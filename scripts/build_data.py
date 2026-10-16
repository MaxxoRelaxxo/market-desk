#!/usr/bin/env python3
"""Convert Parquet data and model output to JSON for the React frontend (one file per theme)."""

import json
import sys
from datetime import date
from pathlib import Path

import polars as pl

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from models import egb  # noqa: E402
from utils.series import FRED_SERIES  # noqa: E402

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
    "DGS2", "DGS10", "DGS30", "DFII10", "T10YIE", "T5YIFR",
    "T10Y2Y", "T10Y3M", "BAMLC0A0CM", "BAMLH0A0HYM2", "DFF", "MORTGAGE30US",
]


def build_us_rates() -> None:
    df = (
        pl.read_parquet(DATA_DIR / "us_rates.parquet")
        .filter(pl.col("series_id").is_in(list(US_LABELS)))
        .drop_nulls("value")
        .sort("series_id", "date")
    )

    def asof(offset: str) -> pl.DataFrame:
        cutoff = pl.col("date").max().dt.offset_by(offset)
        return df.filter(pl.col("date") <= cutoff.over("series_id")).group_by("series_id").agg(pl.col("value").last())

    latest = (
        df.group_by("series_id", maintain_order=True)
        .agg(pl.col("date").last(), pl.col("value").last(), pl.col("value").tail(2).first().alias("prev"))
        .join(asof("-1mo").rename({"value": "m1"}), on="series_id", how="left")
        .join(asof("-1y").rename({"value": "y1"}), on="series_id", how="left")
        .select(
            "series_id", pl.col("series_id").replace_strict(US_LABELS).alias("label"), "date", "value",
            *(((pl.col("value") - pl.col(c)) * 100).alias(f"chg_{c}") for c in ["prev", "m1", "y1"]),
            "m1", "y1",
        )
    )

    curve = {
        kind: _records(
            latest.filter(pl.col("series_id").is_in(list(tenors)))
            .select(pl.col("series_id").replace_strict(tenors).alias("tenor"),
                    pl.col("value").alias("now"), "m1", "y1")
            .sort("tenor")
        )
        for kind, tenors in {"nominal": NOMINAL, "tips": TIPS}.items()
    }

    history = (  # weekly, last obs
        df.filter(pl.col("series_id").is_in(US_HISTORY))
        .group_by_dynamic("date", every="1w", group_by="series_id").agg(pl.col("value").last())
        .pivot(on="series_id", index="date", values="value")
        .sort("date")
    )

    _dump({
        "latest": _records(latest.drop("m1", "y1"), 3),
        "curve": curve,
        "history": _records(history, 3),
    }, "us_rates.json")


# ============================================================
# EGB SPREAD MODEL
# ============================================================

def _weekly(df: pl.DataFrame, by: str | None = None) -> pl.DataFrame:
    return df.sort("date").group_by_dynamic("date", every="1w", group_by=by).agg(pl.all().last())


def build_egb() -> None:
    model, betas = egb.run_model()
    snap = egb.snapshot(model).with_columns(pl.col("country").replace_strict(egb.NAMES).alias("name"))
    recent = model.filter(pl.col("date") >= pl.col("date").max().dt.offset_by("-2y"))
    cols = ["date", "spread", "fair", "residual", "z"]

    def per_country(df: pl.DataFrame) -> dict:
        return {
            c: _records(g.select(cols), 2)
            for (c,), g in df.filter(pl.col("country") != egb.BENCH).group_by("country", maintain_order=True)
        }

    spreads = (
        _weekly(model.select("date", "country", "spread"), "country")
        .pivot(on="country", index="date", values="spread").sort("date").drop(egb.BENCH)
    )
    bund = recent.filter(pl.col("country") == egb.BENCH).select("date", pl.col("yield").alias("bund"))

    _dump({
        "asof": model["date"].max(),
        "factors": egb.FACTORS,
        "names": {c: egb.NAMES[c] for c in model["country"].unique().sort() if c != egb.BENCH},
        "snapshot": _records(snap, 2),
        "bund": _records(bund.sort("date"), 3),
        "spreads": _records(spreads, 1),
        "daily": per_country(recent),                                       # last 2Y, daily
        "series": per_country(_weekly(model.select("country", *cols), "country")),  # full, weekly
        "betas": _records(_weekly(betas).rename({f"b_{f}": f for f in egb.FACTORS}), 2),
        "mean_reversion": _records(egb.mean_reversion(model), 2),
    }, "egb.json")


THEMES = {"us_rates": build_us_rates, "egb": build_egb}


if __name__ == "__main__":
    for name in sys.argv[1:] or THEMES:
        print(f"Building {name}")
        try:
            THEMES[name]()
        except FileNotFoundError as e:
            print(f"  skipped {name}: {e}")
