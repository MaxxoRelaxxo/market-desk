"""
Macro monitor: growth, inflation, policy-rate pricing and inflation expectations for the US, euro area and Sweden.

- GDP: real, SA. QoQ %, QoQ SAAR % and YoY % from the level (changes vs the same date 3/12 months earlier).
- Inflation: YoY % of the index; 3M annualised (3m/3m SAAR) only for seasonally adjusted indices (US).
  HICP for the euro area and Sweden (Riksbank targets CPIF, which is not on FRED).
- Policy pricing, implied rate per horizon (months ahead) vs the policy rate, now / 1W / 1M ago:
  Fed: 3M SOFR futures, implied = 100 − price over the IMM reference quarter (3rd Wed → 3rd Wed), vs SOFR.
  ECB: instantaneous forwards of the AAA government curve (ECB), vs the deposit facility rate. AAA bonds carry a
  spread to €STR OIS, so read changes rather than the level.
  Riksbank: forwards implied by T-bills 1M/3M/6M (simple money-market compounding) vs the policy rate. T-bills
  trade below the policy rate (scarcity), so the level is biased low.
"""

from datetime import date, timedelta
from pathlib import Path

import polars as pl

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

ECONOMIES = {"US": "United States", "EA": "Euro area", "SE": "Sweden"}
GDP = {"US": "us_gdp", "EA": "ea_gdp", "SE": "se_gdp"}
INFLATION = {  # key: (economy, label, seasonally adjusted, headline)
    "us_cpi": ("US", "CPI", True, True),
    "us_core_cpi": ("US", "Core CPI", True, False),
    "us_pce": ("US", "PCE", True, False),
    "us_core_pce": ("US", "Core PCE", True, False),
    "ea_hicp": ("EA", "HICP", False, True),
    "ea_core_hicp": ("EA", "Core HICP", False, False),
    "se_hicp": ("SE", "HICP", False, True),
    "se_core_hicp": ("SE", "Core HICP", False, False),
}
EXPECTATIONS = {  # key: (label, source file)
    "T5YIE": ("US breakeven 5Y", "us_rates"),
    "T10YIE": ("US breakeven 10Y", "us_rates"),
    "T5YIFR": ("US 5Y5Y forward", "us_rates"),
    "us_mich_1y": ("US Michigan 1Y", "macro"),
    "us_cleveland_1y": ("US Cleveland Fed 1Y", "macro"),
    "ea_spf_lt": ("EA SPF 5Y ahead", "macro"),
}
POLICY = {  # economy: (label, series_id, file)
    "US": ("SOFR", "SOFR", "us_rates"),
    "EA": ("ECB deposit rate", "ecb_dfr", "macro"),
    "SE": ("Riksbank policy rate", "SECBREPOEFF", "svea_series"),
}
EA_FWD = {"estr": 0, "ea_fwd_3m": 3, "ea_fwd_6m": 6, "ea_fwd_1y": 12, "ea_fwd_2y": 24, "ea_fwd_3y": 36}
IMM = {"H": 3, "M": 6, "U": 9, "Z": 12}


def _read(file: str, ids) -> pl.DataFrame:
    path = DATA_DIR / f"{file}.parquet"
    if not path.exists():
        return pl.DataFrame(schema={"date": pl.Date, "series_id": pl.String, "value": pl.Float64})
    return (pl.read_parquet(path).filter(pl.col("series_id").is_in(list(ids)))
            .select("date", "series_id", "value").drop_nulls("value").sort("series_id", "date"))


def load() -> pl.DataFrame:
    return _read("macro", [*GDP.values(), *INFLATION, *EA_FWD, "ecb_dfr", "us_mich_1y", "us_cleveland_1y", "ea_spf_lt"])


def _pct(df: pl.DataFrame, months: int, name: str) -> pl.DataFrame:
    """% change vs the same date `months` earlier (exact date match, so gaps give null)."""
    prev = df.select("series_id", pl.col("date").dt.offset_by(f"{months}mo"), pl.col("value").alias("_p"))
    return df.join(prev, on=["series_id", "date"], how="left").with_columns(
        ((pl.col("value") / pl.col("_p") - 1) * 100).alias(name)).drop("_p")


def _saar(col: str, periods: int = 4) -> pl.Expr:
    return (((1 + pl.col(col) / 100) ** periods - 1) * 100)


def growth(m: pl.DataFrame) -> pl.DataFrame:
    """date | economy | qoq | saar | yoy (%)."""
    df = m.filter(pl.col("series_id").is_in(list(GDP.values())))
    return (
        _pct(_pct(df, 3, "qoq"), 12, "yoy")
        .select("date", pl.col("series_id").replace_strict({v: k for k, v in GDP.items()}).alias("economy"),
                "qoq", _saar("qoq").alias("saar"), "yoy")
        .drop_nulls("qoq").sort("economy", "date")
    )


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


def prints(g: pl.DataFrame, i: pl.DataFrame) -> pl.DataFrame:
    """Latest release per indicator: economy | label | date | value | prev | y1 | lo_5y | hi_5y | avg_5y."""
    obs = pl.concat([
        g.select("date", "economy", pl.lit("GDP QoQ").alias("label"), pl.col("qoq").alias("value")),
        g.select("date", "economy", pl.lit("GDP YoY").alias("label"), pl.col("yoy").alias("value")),
        i.select("date", "economy", "label", pl.col("yoy").alias("value")),
    ]).drop_nulls().sort("date")
    last = pl.col("date").last()
    w5 = pl.col("value").filter(pl.col("date") > last.dt.offset_by("-5y"))
    order = ["GDP QoQ", "GDP YoY", *(v[1] for v in INFLATION.values())]
    return (
        obs.group_by("economy", "label")
        .agg(last, pl.col("value").last(), pl.col("value").tail(2).first().alias("prev"),
             pl.col("value").filter(pl.col("date") <= last.dt.offset_by("-1y")).last().alias("y1"),
             w5.min().alias("lo_5y"), w5.max().alias("hi_5y"), w5.mean().alias("avg_5y"))
        .sort(pl.col("economy").replace_strict({e: n for n, e in enumerate(ECONOMIES)}),
              pl.col("label").replace_strict({lbl: n for n, lbl in enumerate(dict.fromkeys(order))}))
    )


# ============================================================ POLICY PRICING

def _asof(wide: pl.DataFrame, days: int) -> dict:
    """Last row of a daily wide frame on or before (last date − days); columns forward-filled first."""
    cutoff = wide["date"].max() - timedelta(days=days)
    rows = wide.with_columns(pl.exclude("date").forward_fill()).filter(pl.col("date") <= cutoff)
    return rows.row(-1, named=True) if rows.height else {}


def _path(wide: pl.DataFrame, points: dict[str, tuple[str, float]], policy: str, label: str) -> dict:
    """{asof, policy: {label, value}, points: [{label, h, now, w1, m1, bp}]} from date | <point>... | policy."""
    r = lambda v, n=3: None if v is None else round(v, n)  # noqa: E731
    now, w1, m1 = _asof(wide, 0), _asof(wide, 7), _asof(wide, 30)
    pol = now.get(policy)
    pts = [
        {"label": lbl, "h": r(h, 1), "now": r(now[c]), "w1": r(w1.get(c)), "m1": r(m1.get(c)),
         "bp": None if pol is None else r((now[c] - pol) * 100, 1)}
        for c, (lbl, h) in points.items() if now.get(c) is not None
    ]
    return {"asof": wide["date"].max(), "policy": {"label": label, "value": pol}, "points": pts}


def _third_wed(y: int, m: int) -> date:
    d = date(y, m, 1)
    return d + timedelta(days=(2 - d.weekday()) % 7 + 14)


def fed_path() -> dict | None:
    """SOFR futures strip (sofr_strip.parquet snapshots, else the last close in market_data) vs SOFR."""
    sr3 = pl.col("series_id").str.starts_with("SR3")
    strip = pl.concat([
        pl.read_parquet(p).filter(sr3).select("date", "series_id", "value")
        for p in [DATA_DIR / "sofr_strip.parquet"] if p.exists()
    ] + [
        pl.read_parquet(DATA_DIR / "market_data.parquet").filter(sr3)
        .sort("date").group_by("series_id").last().select("date", "series_id", "value"),
    ]).unique(["date", "series_id"], keep="last")
    if strip.is_empty():
        return None
    asof = strip["date"].max()
    live = strip.filter(pl.col("date") == asof)["series_id"].to_list()
    points = {}
    for t in live:
        y, m = 2000 + int(t[4:6]), IMM[t[3]]
        start, end = _third_wed(y, m), _third_wed(y + (m == 12), m % 12 + 3)
        points[t] = (start.strftime("%b %y"), ((start + (end - start) / 2) - asof).days / 30.44)
    points = dict(sorted(points.items(), key=lambda kv: kv[1][1]))
    wide = (
        pl.concat([strip.filter(pl.col("series_id").is_in(live)).with_columns(value=100 - pl.col("value")),
                   _read("us_rates", ["SOFR"])])
        .pivot(on="series_id", index="date", values="value", aggregate_function="last").sort("date")
        .filter(pl.col("date") <= asof)
    )
    return _path(wide, points, "SOFR", "SOFR")


def ecb_path(m: pl.DataFrame) -> dict | None:
    df = m.filter(pl.col("series_id").is_in([*EA_FWD, "ecb_dfr"]))
    if df.filter(pl.col("series_id").is_in(list(EA_FWD))).is_empty():
        return None
    wide = df.pivot(on="series_id", index="date", values="value").sort("date")
    labels = {"estr": "€STR"} | {k: f"{h}M fwd" if h < 12 else f"{h // 12}Y fwd" for k, h in EA_FWD.items() if k != "estr"}
    return _path(wide, {k: (labels[k], h) for k, h in EA_FWD.items() if k in wide.columns}, "ecb_dfr", "ECB deposit rate")


def riksbank_path() -> dict | None:
    """Forwards from T-bills: 0–1M, 1–3M, 3–6M (simple compounding, ACT/360 ≈ months/12) vs the policy rate."""
    df = _read("svea_series", ["SETB1MBENCHC", "SETB3MBENCH", "SETB6MBENCH", "SECBREPOEFF"])
    if df.is_empty():
        return None
    g = lambda c, n: 1 + pl.col(c) / 100 * n / 12  # noqa: E731
    wide = (
        df.pivot(on="series_id", index="date", values="value").sort("date")
        .with_columns(pl.exclude("date").forward_fill(limit=5))
        .with_columns(
            f0_1=pl.col("SETB1MBENCHC"),
            f1_3=(g("SETB3MBENCH", 3) / g("SETB1MBENCHC", 1) - 1) * 100 * 12 / 2,
            f3_6=(g("SETB6MBENCH", 6) / g("SETB3MBENCH", 3) - 1) * 100 * 12 / 3,
        )
    )
    points = {"f0_1": ("T-bill 1M", 0.5), "f1_3": ("1M→3M fwd", 2), "f3_6": ("3M→6M fwd", 4.5)}
    return _path(wide, points, "SECBREPOEFF", "Riksbank policy rate")


def paths(m: pl.DataFrame) -> dict:
    out = {}
    for eco, f in [("US", fed_path), ("EA", lambda: ecb_path(m)), ("SE", riksbank_path)]:
        try:
            if (p := f()) is not None:
                out[eco] = p
        except FileNotFoundError as exc:
            print(f"  {eco} policy path skipped: {exc}")
    return out


def policy_history() -> pl.DataFrame:
    """Weekly date | US | EA | SE policy rates (last obs)."""
    return (
        pl.concat([_read(f, [sid]).with_columns(series_id=pl.lit(eco)) for eco, (_, sid, f) in POLICY.items()])
        .sort("series_id", "date")
        .group_by_dynamic("date", every="1w", group_by="series_id").agg(pl.col("value").last())
        .pivot(on="series_id", index="date", values="value").sort("date")
    )


def expectations() -> pl.DataFrame:
    """Long date | series_id | value of EXPECTATIONS (daily, monthly and quarterly as published)."""
    return pl.concat([_read(f, [k]) for k, (_, f) in EXPECTATIONS.items()])
