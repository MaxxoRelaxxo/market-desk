"""
Macro monitor: growth (GDP, OECD CLI), inflation and meeting-by-meeting policy pricing.

- GDP: real, SA. QoQ %, QoQ SAAR % and YoY % from the level (changes vs the same date 3/12 months earlier).
  US: BEA (FRED). Euro area: ECB MNA. Sweden: SCB, seasonally adjusted, constant prices.
- CLI: OECD composite leading indicator, amplitude adjusted, 100 = long-term trend. Phase from level vs 100 and the
  1M change: expansion (> 100, rising), downturn (> 100, falling), slowdown (< 100, falling), recovery (< 100, rising).
- Inflation: YoY % of the index; 3M annualised (3m/3m SAAR) only for seasonally adjusted indices (US).
  Sweden: SCB CPIF, CPIF ex energy, CPI (2020=100).
- Fed pricing: 30-day Fed funds futures, monthly average EFFR = 100 − price (CME FedWatch method). Rate after a
  meeting = next month's average when that month has no meeting, else solved from the meeting month:
  avg = (d · pre + (N − d) · post) / N, d = decision day (new rate from the day after). Pre = previous post, the
  first one starts from today's EFFR. Cumulative = vs today's EFFR; implied target mid = mid + cumulative.
- ECB pricing: AAA euro area government curve (ECB, Svensson parameters), instantaneous forwards shifted so the
  0-horizon forward equals €STR, averaged over each inter-meeting period (rate effective the Wednesday after the
  decision). Cumulative = vs today's €STR; implied deposit rate = DFR + cumulative. AAA bonds are not OIS: the
  shift removes the level gap at the front, the slope beyond ~1Y still carries term premium.
- Riksbank: no free market source for meeting pricing (STIBOR FRA, SEK OIS); policy rate and calendar only.
"""

import calendar
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import polars as pl

from utils.series import ECB_MEETINGS, FOMC_MEETINGS, RIKSBANK_MEETINGS

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

ECONOMIES = {"US": "United States", "EA": "Euro area", "SE": "Sweden"}
GDP = {"US": "us_gdp", "EA": "ea_gdp", "SE": "se_gdp"}
CLI = {"us_cli": "United States", "g4e_cli": "Major 4 Europe"}
INFLATION = {  # key: (economy, label, seasonally adjusted, headline)
    "us_cpi": ("US", "CPI", True, True),
    "us_core_cpi": ("US", "Core CPI", True, False),
    "us_pce": ("US", "PCE", True, False),
    "us_core_pce": ("US", "Core PCE", True, False),
    "ea_hicp": ("EA", "HICP", False, True),
    "ea_core_hicp": ("EA", "Core HICP", False, False),
    "se_kpif": ("SE", "CPIF", False, True),
    "se_kpif_xe": ("SE", "CPIF ex energy", False, False),
    "se_kpi": ("SE", "CPI", False, False),
}
SV = ["ea_sv_beta0", "ea_sv_beta1", "ea_sv_beta2", "ea_sv_beta3", "ea_sv_tau1", "ea_sv_tau2"]
FF_MONTHS = {c: i + 1 for i, c in enumerate("FGHJKMNQUVXZ")}
COMPARE = {"w1": 7, "m1": 30}  # days back for the comparison strips


def _read(file: str, ids=None) -> pl.DataFrame:
    path = DATA_DIR / f"{file}.parquet"
    if not path.exists():
        return pl.DataFrame(schema={"date": pl.Date, "series_id": pl.String, "value": pl.Float64})
    df = pl.read_parquet(path)
    if ids is not None:
        df = df.filter(pl.col("series_id").is_in(list(ids)))
    return df.select("date", "series_id", "value").drop_nulls("value").sort("series_id", "date")


def load() -> pl.DataFrame:
    return _read("macro")


def _pct(df: pl.DataFrame, months: int, name: str) -> pl.DataFrame:
    """% change vs the same date `months` earlier (exact date match, so gaps give null)."""
    prev = df.select("series_id", pl.col("date").dt.offset_by(f"{months}mo"), pl.col("value").alias("_p"))
    return df.join(prev, on=["series_id", "date"], how="left").with_columns(
        ((pl.col("value") / pl.col("_p") - 1) * 100).alias(name)).drop("_p")


def _saar(col: str, periods: int = 4) -> pl.Expr:
    return ((1 + pl.col(col) / 100) ** periods - 1) * 100


def prints(obs: pl.DataFrame, order: list[str]) -> pl.DataFrame:
    """Latest release per (economy, label) of date | economy | label | value, sorted by `order` ("<economy>|<label>"):
    date | value | prev | y1 | lo_5y | hi_5y | avg_5y."""
    last = pl.col("date").last()
    w5 = pl.col("value").filter(pl.col("date") > last.dt.offset_by("-5y"))
    return (
        obs.drop_nulls().sort("date").group_by("economy", "label")
        .agg(last, pl.col("value").last(), pl.col("value").tail(2).first().alias("prev"),
             pl.col("value").filter(pl.col("date") <= last.dt.offset_by("-1y")).last().alias("y1"),
             w5.min().alias("lo_5y"), w5.max().alias("hi_5y"), w5.mean().alias("avg_5y"))
        .sort(pl.concat_str("economy", pl.lit("|"), "label").replace_strict({k: n for n, k in enumerate(order)}, default=99))
    )


# ============================================================ GROWTH

def growth(m: pl.DataFrame) -> pl.DataFrame:
    """date | economy | qoq | saar | yoy (%)."""
    df = m.filter(pl.col("series_id").is_in(list(GDP.values())))
    return (
        _pct(_pct(df, 3, "qoq"), 12, "yoy")
        .select("date", pl.col("series_id").replace_strict({v: k for k, v in GDP.items()}).alias("economy"),
                "qoq", _saar("qoq").alias("saar"), "yoy")
        .drop_nulls("qoq").sort("economy", "date")
    )


def growth_prints(g: pl.DataFrame) -> pl.DataFrame:
    return prints(pl.concat([
        g.select("date", "economy", pl.lit("GDP QoQ").alias("label"), pl.col("qoq").alias("value")),
        g.select("date", "economy", pl.lit("GDP YoY").alias("label"), pl.col("yoy").alias("value")),
    ]), [f"{e}|{lbl}" for e in ECONOMIES for lbl in ["GDP QoQ", "GDP YoY"]])


def cli(m: pl.DataFrame) -> pl.DataFrame:
    """date | series_id | value | chg_1m | chg_6m | phase."""
    d = pl.col("value").diff().over("series_id")
    return (
        m.filter(pl.col("series_id").is_in(list(CLI))).sort("series_id", "date")
        .with_columns(chg_1m=d, chg_6m=pl.col("value") - pl.col("value").shift(6).over("series_id"))
        .with_columns(phase=pl.when(pl.col("value") >= 100)
                      .then(pl.when(d >= 0).then(pl.lit("Expansion")).otherwise(pl.lit("Downturn")))
                      .otherwise(pl.when(d < 0).then(pl.lit("Slowdown")).otherwise(pl.lit("Recovery"))))
    )


# ============================================================ INFLATION

def inflation(m: pl.DataFrame) -> pl.DataFrame:
    """date | series_id | economy | label | yoy | m3 (3M annualised, SA indices only) (%)."""
    df = m.filter(pl.col("series_id").is_in(list(INFLATION)))
    sa = [k for k, v in INFLATION.items() if v[2]]
    return (
        _pct(_pct(df, 3, "m3"), 12, "yoy")
        .with_columns(pl.when(pl.col("series_id").is_in(sa)).then(_saar("m3")).alias("m3"))
        .select("date", "series_id",
                pl.col("series_id").replace_strict({k: v[0] for k, v in INFLATION.items()}).alias("economy"),
                pl.col("series_id").replace_strict({k: v[1] for k, v in INFLATION.items()}).alias("label"),
                "yoy", "m3")
        .drop_nulls("yoy").sort("series_id", "date")
    )


def inflation_prints(i: pl.DataFrame) -> pl.DataFrame:
    return prints(i.select("date", "economy", "label", pl.col("yoy").alias("value")),
                  [f"{e}|{lbl}" for e, lbl, _, _ in INFLATION.values()])


# ============================================================ POLICY PRICING

def _dates(ds: list[str]) -> list[date]:
    return [date.fromisoformat(d) for d in ds]


def _wide(m: pl.DataFrame, ids: list[str]) -> pl.DataFrame:
    return (m.filter(pl.col("series_id").is_in(ids)).pivot(on="series_id", index="date", values="value")
            .sort("date").with_columns(pl.exclude("date").forward_fill()))


def _row(wide: pl.DataFrame, asof: date) -> dict:
    rows = wide.filter(pl.col("date") <= asof)
    return rows.row(-1, named=True) if rows.height else {}


def ff_strip() -> pl.DataFrame:
    """Fed funds futures snapshots: date | month (contract month, 1st) | rate (100 − price)."""
    zq = pl.col("series_id").str.starts_with("ZQ")
    frames = [pl.read_parquet(p).filter(zq) for p in [DATA_DIR / "ff_strip.parquet"] if p.exists()]
    md = DATA_DIR / "market_data.parquet"
    if md.exists():
        frames.append(pl.read_parquet(md).filter(zq).sort("date").group_by("series_id").last())
    if not frames:
        return pl.DataFrame(schema={"date": pl.Date, "month": pl.Date, "rate": pl.Float64})
    return (
        pl.concat([f.select("date", "series_id", "value") for f in frames])
        .unique(["date", "series_id"], keep="last")
        .select("date",
                pl.date(pl.col("series_id").str.slice(3, 2).cast(pl.Int32) + 2000,
                        pl.col("series_id").str.slice(2, 1).replace_strict(FF_MONTHS, return_dtype=pl.Int8), 1)
                .alias("month"),
                (100 - pl.col("value")).alias("rate"))
        .sort("date", "month")
    )


def _fed(strip: pl.DataFrame, effr: pl.DataFrame, asof: date) -> list[dict]:
    """Implied EFFR after each FOMC meeting from the latest futures snapshot on or before `asof`."""
    past = strip.filter(pl.col("date") <= asof)
    if past.is_empty():
        return []
    d0 = past["date"].max()
    avg = dict(past.filter(pl.col("date") == d0).select("month", "rate").iter_rows())
    rate = start = _row(effr, d0).get("effr")
    if rate is None:
        return []
    months = {date(m.year, m.month, 1) for m in _dates(FOMC_MEETINGS)}
    out = []
    for mt in (m for m in _dates(FOMC_MEETINGS) if m > d0):
        month = date(mt.year, mt.month, 1)
        nxt = date(mt.year + mt.month // 12, mt.month % 12 + 1, 1)
        if month not in avg:
            break
        n, d = calendar.monthrange(mt.year, mt.month)[1], mt.day
        post = avg[nxt] if nxt not in months and nxt in avg else (avg[month] * n - rate * d) / (n - d)
        out.append({"date": mt, "rate": post, "chg": (post - rate) * 100, "cum": (post - start) * 100})
        rate = post
    return out


def _sv_fwd(p: dict, t: np.ndarray) -> np.ndarray:
    """Svensson instantaneous forward at horizons t (years)."""
    b0, b1, b2, b3, t1, t2 = (p[k] for k in SV)
    return b0 + b1 * np.exp(-t / t1) + b2 * (t / t1) * np.exp(-t / t1) + b3 * (t / t2) * np.exp(-t / t2)


def _ecb(wide: pl.DataFrame, asof: date) -> list[dict]:
    """Implied €STR after each ECB meeting: AAA Svensson forwards anchored on €STR, averaged per period."""
    p = _row(wide, asof)
    if any(p.get(k) is None for k in [*SV, "estr"]):
        return []
    d0, estr = p["date"], p["estr"]
    shift = estr - _sv_fwd(p, np.array([0.0]))[0]
    meetings = [m for m in _dates(ECB_MEETINGS) if m > d0]
    eff = [m + timedelta(days=6) for m in meetings]  # Thursday decision, effective the next Wednesday
    out, rate = [], estr
    for i, mt in enumerate(meetings):
        end = eff[i + 1] if i + 1 < len(eff) else eff[i] + timedelta(days=42)
        t = (np.arange((eff[i] - d0).days, (end - d0).days) + 0.5) / 365.25
        post = float(_sv_fwd(p, t).mean() + shift)
        out.append({"date": mt, "rate": post, "chg": (post - rate) * 100, "cum": (post - estr) * 100})
        rate = post
    return out


def _compare(f, asof: date) -> list[dict]:
    """Rows of f(asof) with the cumulative pricing of the same meeting 1W / 1M earlier."""
    now = f(asof)
    for k, days in COMPARE.items():
        prev = {r["date"]: r["cum"] for r in f(asof - timedelta(days=days))}
        for r in now:
            r[f"cum_{k}"] = prev.get(r["date"])
    return now


def policy(m: pl.DataFrame) -> dict:
    """{bank: {asof, rate (current policy), effective, meetings: [{date, rate, policy, chg, cum, cum_w1, cum_m1}]}}."""
    out = {}
    pol = _wide(m, ["fed_upper", "fed_lower", "effr", "ecb_dfr", "estr", *SV])
    strip = ff_strip()
    if not strip.is_empty() and "effr" in pol.columns:
        asof = strip["date"].max()
        p = _row(pol, asof)
        mid = (p.get("fed_upper", 0) + p.get("fed_lower", 0)) / 2 if p.get("fed_upper") is not None else None
        rows = _compare(lambda d: _fed(strip, pol.select("date", "effr"), d), asof)
        out["US"] = {
            "asof": asof, "label": "Fed funds target", "lower": p.get("fed_lower"), "upper": p.get("fed_upper"),
            "effective": p.get("effr"), "effective_label": "EFFR",
            "meetings": [r | {"policy": None if mid is None else mid + r["cum"] / 100} for r in rows],
        }
    if all(k in pol.columns for k in [*SV, "estr"]):
        asof = pol.drop_nulls([*SV, "estr"])["date"].max()
        p = _row(pol, asof)
        rows = _compare(lambda d: _ecb(pol, d), asof)
        out["EA"] = {
            "asof": asof, "label": "ECB deposit rate", "rate": p.get("ecb_dfr"),
            "effective": p.get("estr"), "effective_label": "€STR",
            "meetings": [r | {"policy": None if p.get("ecb_dfr") is None else p["ecb_dfr"] + r["cum"] / 100} for r in rows],
        }
    se = _read("svea_series", ["SECBREPOEFF"])
    if se.height:
        out["SE"] = {
            "asof": se["date"].max(), "label": "Riksbank policy rate", "rate": se["value"][-1],
            "meetings": [{"date": d} for d in _dates(RIKSBANK_MEETINGS) if d > se["date"].max()],
        }
    for b in out.values():  # round for JSON
        b["meetings"] = [{k: round(v, 4) if isinstance(v, float) else v for k, v in r.items()} for r in b["meetings"]]
    return out


def policy_history(m: pl.DataFrame) -> pl.DataFrame:
    """Weekly date | fed_upper | fed_lower | ecb_dfr | SE (last obs)."""
    return (
        pl.concat([m.filter(pl.col("series_id").is_in(["fed_upper", "fed_lower", "ecb_dfr"])),
                   _read("svea_series", ["SECBREPOEFF"]).with_columns(series_id=pl.lit("SE"))])
        .sort("series_id", "date")
        .group_by_dynamic("date", every="1w", group_by="series_id").agg(pl.col("value").last())
        .pivot(on="series_id", index="date", values="value").sort("date")
    )
