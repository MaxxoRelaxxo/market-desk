"""
FX & commodities: G10 spot (Riksbank fixings), cross matrix and SEK relative PPP.

- Spot: SWEA `SEK{CCY}PMI` = SEK per 1 unit of CCY. Crosses are derived: EUR/USD = EURSEK / USDSEK.
- Matrix: cell (row, col) = units of col per 1 row. % change > 0 = row currency stronger vs col.
- PPP (relative): fair CCY/SEK = base spot · (P_SE / P_SE,base) / (P_F / P_F,base), base = mean over BASE.
  Valuation = −(spot / fair − 1) (%), as Bloomberg SEK PPP % over/undervalued: < 0 = SEK undervalued vs PPP.
  CPI: HICP (Eurostat via FRED), US CPI-U; monthly, carried forward to daily spot.
"""

from datetime import date
from pathlib import Path

import polars as pl

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

G10 = ["USD", "EUR", "JPY", "GBP", "CHF", "CAD", "AUD", "NZD", "NOK", "SEK"]
PAIRS = {  # label: (base, quote)
    "USD/SEK": ("USD", "SEK"),
    "EUR/SEK": ("EUR", "SEK"),
    "EUR/USD": ("EUR", "USD"),
    "USD/JPY": ("USD", "JPY"),
}
COMMODITIES = {  # yfinance front-month futures
    "BZ=F": "Brent ($/bbl)",
    "CL=F": "WTI ($/bbl)",
    "GC=F": "Gold ($/oz)",
    "SI=F": "Silver ($/oz)",
    "HG=F": "Copper ($/lb)",
}
CPI = {
    "USD": "CPIAUCNS",
    "EUR": "CP0000EZ19M086NEST",
    "NOK": "CP0000NOM086NEST",
    "SEK": "CP0000SEM086NEST",
}
PPP_CCY = ["USD", "EUR", "NOK"]
BASE = (date(2000, 1, 1), date(2009, 12, 31))


def g10_spot() -> pl.DataFrame:
    """Daily wide: date | USD | EUR | ... (SEK per 1 unit), SEK = 1. Dates where all fixings exist."""
    return (
        pl.read_parquet(DATA_DIR / "svea_series.parquet")
        .filter(pl.col("series_id").is_in([f"SEK{c}PMI" for c in G10 if c != "SEK"]))
        .select("date", pl.col("series_id").str.slice(3, 3).alias("ccy"), "value")
        .pivot(on="ccy", index="date", values="value")
        .drop_nulls()
        .with_columns(SEK=pl.lit(1.0))
        .select("date", *G10)
        .sort("date")
    )


def pairs(spot: pl.DataFrame) -> pl.DataFrame:
    """Long date | series_id | value for PAIRS (base/quote = units of quote per base)."""
    return spot.select(
        "date", *((pl.col(b) / pl.col(q)).alias(label) for label, (b, q) in PAIRS.items())
    ).unpivot(index="date", variable_name="series_id")


def commodities() -> pl.DataFrame:
    """Long date | series_id | value for COMMODITIES."""
    return (
        pl.read_parquet(DATA_DIR / "market_data.parquet")
        .filter(pl.col("series_id").is_in(list(COMMODITIES)))
        .select("date", "series_id", "value")
        .drop_nulls("value")
        .sort("series_id", "date")
    )


def matrix(spot: pl.DataFrame, at: date | None = None) -> pl.DataFrame:
    """ccy | USD | EUR | ...: units of column currency per 1 row currency, last fixing on or before `at`."""
    row = (spot if at is None else spot.filter(pl.col("date") <= at)).row(-1, named=True)
    return pl.DataFrame({"ccy": G10, **{q: [row[b] / row[q] for b in G10] for q in G10}})


def ppp(spot: pl.DataFrame, base: tuple[date, date] = BASE) -> pl.DataFrame:
    """Daily: date | {CCY} spot | {CCY}_fair | {CCY}_val (% SEK vs PPP, < 0 = SEK undervalued) for PPP_CCY."""
    cpi = (
        pl.read_parquet(DATA_DIR / "us_rates.parquet")
        .filter(pl.col("series_id").is_in(list(CPI.values())))
        .drop_nulls("value")
        .pivot(on="series_id", index="date", values="value")
        .rename({sid: f"{c}_cpi" for c, sid in CPI.items()})
        .sort("date")
        .with_columns(pl.exclude("date").forward_fill())
    )
    df = spot.select("date", *PPP_CCY).join_asof(cpi, on="date", strategy="backward").drop_nulls()
    b = df.filter(pl.col("date").is_between(*base)).select(pl.exclude("date").mean()).row(0, named=True)
    fair = {
        c: b[c] * (pl.col("SEK_cpi") / b["SEK_cpi"]) / (pl.col(f"{c}_cpi") / b[f"{c}_cpi"]) for c in PPP_CCY
    }
    return df.select(
        "date",
        *PPP_CCY,
        *(fair[c].alias(f"{c}_fair") for c in PPP_CCY),
        *(((1 - pl.col(c) / fair[c]) * 100).alias(f"{c}_val") for c in PPP_CCY),
    )
