#!/usr/bin/env python3
"""Convert Parquet data and model output to JSON for the React frontend (one file per theme)."""

import json
import sys
from datetime import date, timedelta
from pathlib import Path

import polars as pl

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from models import acm, egb, fx
from utils.series import FRED_SERIES

DATA_DIR = ROOT / "src" / "data"
OUT_DIR = ROOT / "frontend" / "public" / "data"


def _dump(obj, name: str) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / name
    path.write_text(json.dumps(obj, default=date.isoformat, ensure_ascii=False), encoding="utf-8")
    print(f"  wrote {path}  ({path.stat().st_size / 1024:.1f} KB)")


def _records(df: pl.DataFrame, decimals: int = 2) -> list[dict]:
    return df.with_columns(pl.selectors.float().round(decimals)).to_dicts()


# ============================================================
# US RATES
# ============================================================

US_LABELS = {sid: name for cat in FRED_SERIES.values() for name, sid in cat.items()}
NOMINAL = {"DGS2": 2, "DGS5": 5, "DGS7": 7, "DGS10": 10, "DGS30": 30}
TIPS = {"DFII5": 5, "DFII7": 7, "DFII10": 10, "DFII30": 30}
US_HISTORY = [
    "DGS2", "DGS10", "DGS30", *TIPS, "T10YIE", "T5YIFR",
    "T10Y2Y", "T10Y3M", "BAMLC0A0CM", "BAMLH0A0HYM2", "DFF", "MORTGAGE30US",
]


def _latest(df: pl.DataFrame, ids: list[str], labels: dict[str, str], pct: bool = False) -> pl.DataFrame:
    """Long df (date | series_id | value) -> level, bp (pct: %) change vs prev obs/1W/1M/YTD/1Y, 1Y range, 5Y pct."""
    df = df.filter(pl.col("series_id").is_in(ids)).drop_nulls("value").sort("series_id", "date")

    def asof(offset: str, ytd: bool = False) -> pl.DataFrame:
        cutoff = pl.col("date").max()
        cutoff = cutoff.dt.truncate("1y").dt.offset_by("-1d") if ytd else cutoff.dt.offset_by(offset)
        return df.filter(pl.col("date") <= cutoff.over("series_id")).group_by("series_id").agg(pl.col("value").last())

    def since(offset: str) -> pl.DataFrame:
        return df.filter(pl.col("date") > pl.col("date").max().dt.offset_by(offset).over("series_id"))

    stats = (
        since("-1y").group_by("series_id").agg(pl.col("value").min().alias("lo_1y"), pl.col("value").max().alias("hi_1y"))
        .join(since("-5y").group_by("series_id")
              .agg(((pl.col("value") <= pl.col("value").last()).mean() * 100).alias("pct_5y")), on="series_id")
    )

    return (
        df.group_by("series_id")
        .agg(pl.col("date").last(), pl.col("value").last(), pl.col("value").tail(2).first().alias("prev"))
        .join(asof("-1w").rename({"value": "w1"}), on="series_id", how="left")
        .join(asof("-1mo").rename({"value": "m1"}), on="series_id", how="left")
        .join(asof("", ytd=True).rename({"value": "ytd"}), on="series_id", how="left")
        .join(asof("-1y").rename({"value": "y1"}), on="series_id", how="left")
        .join(stats, on="series_id", how="left")
        .select(
            "series_id", pl.col("series_id").replace_strict(labels).alias("label"), "date", "value",
            *((((pl.col("value") / pl.col(c) - 1) if pct else (pl.col("value") - pl.col(c))) * 100).alias(f"chg_{c}")
              for c in ["prev", "w1", "m1", "ytd", "y1"]),
            "lo_1y", "hi_1y", "pct_5y",
        )
        .sort(pl.col("series_id").replace_strict({s: i for i, s in enumerate(ids)}))
    )


def build_us_rates() -> None:
    df = (
        pl.read_parquet(DATA_DIR / "us_rates.parquet")
        .filter(pl.col("series_id").is_in(list(US_LABELS)))
        .drop_nulls("value")
        .sort("series_id", "date")
    )
    curve_ids = [*NOMINAL, *TIPS]
    latest = _latest(df, curve_ids, US_LABELS)  # nominal + TIPS only, curve order

    history = (  # weekly, last obs
        df.filter(pl.col("series_id").is_in(US_HISTORY))
        .group_by_dynamic("date", every="1w", group_by="series_id").agg(pl.col("value").last())
        .pivot(on="series_id", index="date", values="value")
        .sort("date")
    )

    _dump({
        "latest": _records(latest, 3),
        "history": _records(history, 3),
    }, "us_rates.json")


# ============================================================
# EGB SPREAD MODEL
# ============================================================

def _weekly(df: pl.DataFrame, by: str | None = None) -> pl.DataFrame:
    return df.sort("date").group_by_dynamic("date", every="1w", group_by=by).agg(pl.all().last())


def build_egb() -> None:
    model, factors = egb.run_model()
    snap = egb.snapshot(model, factors).with_columns(pl.col("country").replace_strict(egb.NAMES).alias("name"))
    recent = model.filter(pl.col("date") >= pl.col("date").max().dt.offset_by("-2y"))
    cols = ["date", "spread", "fair", "residual", "z_cs"]
    fit = snap.row(0, named=True)

    def per_country(df: pl.DataFrame) -> dict:
        return {c: _records(g.select(cols), 2) for (c,), g in df.group_by("country", maintain_order=True)}

    spreads = (
        _weekly(model.select("date", "country", "spread"), "country")
        .pivot(on="country", index="date", values="spread").sort("date")
    )
    bund = (
        egb.load_spreads().filter(pl.col("country") == egb.BENCH, pl.col("date") >= recent["date"].min())
        .select("date", pl.col("yield").alias("bund"))
    )

    yields = pl.read_parquet(DATA_DIR / "egb_daily.parquet").select(
        "date", pl.col("country").alias("series_id"), pl.col("yield").alias("value"))
    order = [egb.BENCH, *sorted(set(egb.NAMES) & set(yields["series_id"].unique()) - {egb.BENCH})]

    _dump({
        "asof": snap["date"].max(),
        "yields_latest": _records(_latest(yields, order, egb.NAMES), 3),
        "yields": _records(_weekly(yields, "series_id").pivot(on="series_id", index="date", values="value")
                           .select("date", *order).sort("date"), 3),
        "factors": factors,
        "all_factors": egb.ALL_FACTORS,
        "min_n_two_factors": egb.MIN_N_TWO_FACTORS,
        "lag_days": egb.LAG_DAYS,
        "stale": _records(snap.filter(pl.col("obs_date") < pl.col("date")).select("country", "obs_date")),
        "fit": {k: fit[k] for k in ["alpha", *(f"b_{f}" for f in factors), "r2", "n", "sigma"]},
        "names": {c: egb.NAMES[c] for c in model["country"].unique().sort()},
        "snapshot": _records(snap, 2),
        "bund": _records(bund.sort("date"), 3),
        "spreads": _records(spreads, 1),
        "daily": per_country(recent),                                       # last 2Y, daily
        "series": per_country(_weekly(model.select("country", *cols), "country")),  # full, weekly
        "loo_daily": _records(recent.pivot(on="country", index="date", values="loo_residual").sort("date"), 1),
        "loo_weekly": _records(
            _weekly(model.select("date", "country", "loo_residual"), "country")
            .pivot(on="country", index="date", values="loo_residual").sort("date"), 1),
        "mean_reversion": _records(egb.mean_reversion(model), 2),
    }, "egb.json")


# ============================================================
# SWEDISH RATES + ACM TERM PREMIUM
# ============================================================

SGB = {"SEGVB2YC": 2, "SEGVB5YC": 5, "SEGVB7YC": 7, "SEGVB10YC": 10}
SE_LABELS = {sid: f"SGB {t}Y" for sid, t in SGB.items()}


def _svea(ids) -> pl.DataFrame:
    return pl.read_parquet(DATA_DIR / "svea_series.parquet").filter(pl.col("series_id").is_in(ids)).drop_nulls("value")


def build_se_rates() -> None:
    df = _svea(list(SGB)).select("date", "series_id", "value")
    history = (
        df.sort("series_id", "date")
        .group_by_dynamic("date", every="1w", group_by="series_id").agg(pl.col("value").last())
        .pivot(on="series_id", index="date", values="value").sort("date")
        .with_columns(((pl.col("SEGVB10YC") - pl.col("SEGVB2YC")) * 100).alias("s2s10"),
                      ((pl.col("SEGVB10YC") - pl.col("SEGVB5YC")) * 100).alias("s5s10"))
    )

    out, dates, Y, mats = acm.run()
    tp = acm.tp_frame(out, dates)
    decomp = acm.decomp_frame(out, dates, Y, mats)
    last = decomp.row(-1, named=True)
    y1 = decomp.filter(pl.col("date") <= pl.col("date").max().dt.offset_by("-1y")).row(-1, named=True)

    _dump({
        "latest": _records(_latest(df, list(SGB), SE_LABELS), 3),
        "history": _records(history, 3),
        "acm": {
            "k": acm.K, "n_obs": len(dates), "start": decomp["date"].min(), "asof": last["date"],
            "latest": last, "y1": y1,
            "tp_latest": dict(zip(tp.columns[1:], tp.row(-1)[1:])),
            "decomp": _records(decomp, 3),
            "tp": _records(tp, 3),
            "errors": _records(acm.pricing_errors(out, Y, mats), 1),
        },
    }, "se_rates.json")


# ============================================================
# GOVERNMENT CURVES (curve analysis): Sweden, US
# ============================================================

def build_curves() -> None:
    """{country: {name, tenors: {tenor: years}, history: daily wide date | <tenor>...}}."""
    tenor = lambda t: int(t.rstrip("Y"))  # noqa: E731
    long = [
        ("SE", "Sweden", _svea(list(SGB)).select(
            "date", pl.col("series_id").replace_strict({s: f"{t}Y" for s, t in SGB.items()}).alias("tenor"), "value")),
    ]
    us = pl.read_parquet(DATA_DIR / "us_rates.parquet").filter(pl.col("series_id").is_in(list(NOMINAL)))
    long.append(("US", "United States", us.select(
        "date", pl.col("series_id").replace_strict({s: f"{t}Y" for s, t in NOMINAL.items()}).alias("tenor"), "value")))

    out = {}
    for code, name, df in long:
        tenors = sorted(df["tenor"].unique(), key=tenor)
        wide = (df.drop_nulls("value").pivot(on="tenor", index="date", values="value").sort("date")
                .select("date", *tenors).with_columns(pl.col(tenors).forward_fill()).drop_nulls())
        out[code] = {"name": name, "tenors": {t: tenor(t) for t in tenors}, "history": _records(wide, 3)}
    _dump(out, "curves.json")


# ============================================================
# FX & COMMODITIES: pairs, G10 matrix, SEK PPP
# ============================================================

def build_fx() -> None:
    spot = fx.g10_spot()
    pairs, comm = fx.pairs(spot), fx.commodities()

    def weekly(df: pl.DataFrame) -> pl.DataFrame:
        return (df.sort("series_id", "date").group_by_dynamic("date", every="1w", group_by="series_id")
                .agg(pl.col("value").last()).pivot(on="series_id", index="date", values="value").sort("date"))

    # G10 spot (SEK per unit) at the matrix horizons; frontend derives crosses and % changes
    last = spot["date"].max()
    at = {"latest": last, "prev": spot["date"][-2], "w1": last - timedelta(weeks=1), "m1": last - timedelta(days=30),
          "ytd": date(last.year - 1, 12, 31), "y1": last - timedelta(days=365)}
    g10 = {k: spot.filter(pl.col("date") <= d).row(-1, named=True) for k, d in at.items()}

    ppp = fx.ppp(spot)
    _dump({
        "asof": last,
        "fx_latest": _records(_latest(pairs, list(fx.PAIRS), {p: p for p in fx.PAIRS}, pct=True), 4),
        "comm_latest": _records(_latest(comm, list(fx.COMMODITIES), fx.COMMODITIES, pct=True), 4),
        "fx": _records(weekly(pairs).select("date", *fx.PAIRS), 4),
        "comm": _records(weekly(comm).select("date", *fx.COMMODITIES), 3),
        "g10": {"ccys": fx.G10, "spot": g10},
        "ppp": {
            "ccys": fx.PPP_CCY, "base": [d.isoformat() for d in fx.BASE], "cpi": fx.CPI,
            "latest": ppp.row(-1, named=True),
            "history": _records(ppp.group_by_dynamic("date", every="1w").agg(pl.all().last()).sort("date"), 4),
        },
    }, "fx.json")


THEMES = {"us_rates": build_us_rates, "egb": build_egb, "se_rates": build_se_rates, "curves": build_curves,
          "fx": build_fx}


if __name__ == "__main__":
    for name in sys.argv[1:] or THEMES:
        print(f"Building {name}")
        try:
            THEMES[name]()
        except FileNotFoundError as e:
            print(f"  skipped {name}: {e}")
