"""
Equity: stock indices (yfinance, local currency) and hyperscaler vs semiconductor fundamentals (SEC XBRL).

- Indices: `INDICES` (ticker: label, region), daily closes; development rebased to 100 in the frontend.
- Fundamentals: discrete fiscal quarters from as-filed facts. Facts sharing a start date are cumulative (3M, 6M,
  9M, FY): quarter = diff of consecutive ones, kept when it spans 75–105 days. Per (start, end) the preferred tag,
  then the latest filing (restatements win).
  FCF = operating cash flow − capex (purchases of PP&E). TTM = sum of the last 4 quarters (spanning ~1 year).
- Calendar quarter = quarter containing the fiscal quarter's midpoint (NVDA Apr-end → Q1, AVGO Jan-end → Q4).
  Baskets (`SEC_COMPANIES`): sum of TTM over members, only quarters where every member has reported.
"""

from pathlib import Path

import polars as pl

from utils.series import SEC_COMPANIES

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

INDICES = {  # yfinance ticker: (label, region)
    "^GSPC": ("S&P 500", "US"),
    "^NDX": ("Nasdaq 100", "US"),
    "^DJI": ("Dow Jones", "US"),
    "^RUT": ("Russell 2000", "US"),
    "^SOX": ("PHLX Semiconductor", "US"),
    "^OMX": ("OMXS30", "Europe"),
    "^STOXX50E": ("Euro Stoxx 50", "Europe"),
    "^GDAXI": ("DAX", "Europe"),
    "^FTSE": ("FTSE 100", "Europe"),
    "^N225": ("Nikkei 225", "Asia"),
    "^HSI": ("Hang Seng", "Asia"),
    "^KS11": ("KOSPI", "Asia"),
    "^KQ11": ("KOSDAQ", "Asia"),
    "^VIX": ("VIX", "Volatility"),
}
NAMES = {  # ticker: display name
    "MSFT": "Microsoft", "AMZN": "Amazon", "GOOGL": "Alphabet", "META": "Meta", "ORCL": "Oracle",
    "NVDA": "Nvidia", "AVGO": "Broadcom", "AMD": "AMD", "QCOM": "Qualcomm", "MU": "Micron", "INTC": "Intel",
    "TXN": "Texas Instruments",
}
METRICS = ["ni", "ocf", "capex", "fcf"]
BASKET = {t: b for b, members in SEC_COMPANIES.items() for t in members}


def indices() -> pl.DataFrame:
    """Long date | series_id | value for INDICES present in market_data."""
    return (
        pl.read_parquet(DATA_DIR / "market_data.parquet")
        .filter(pl.col("series_id").is_in(list(INDICES)))
        .select("date", "series_id", "value")
        .drop_nulls("value")
        .sort("series_id", "date")
    )


def quarters() -> pl.DataFrame:
    """Discrete fiscal quarters: ticker | end | ni | ocf | capex | fcf (USD)."""
    by = ["ticker", "metric", "start"]
    return (
        pl.read_parquet(DATA_DIR / "sec_facts.parquet")
        .sort("rank", "filed", descending=[True, False])
        .unique(["ticker", "metric", "start", "end"], keep="last")
        .sort(*by, "end")
        .with_columns(
            prev=pl.col("end").shift().over(by),
            q=pl.col("val") - pl.col("val").shift().over(by).fill_null(0),
        )
        .filter(((pl.col("end") - pl.coalesce("prev", "start")).dt.total_days()).is_between(75, 105))
        .sort("ticker", "metric", "end", pl.col("prev").is_not_null())  # direct 3M fact before derived
        .unique(["ticker", "metric", "end"], keep="first")
        .pivot(on="metric", index=["ticker", "end"], values="q")
        .with_columns(fcf=pl.col("ocf") - pl.col("capex"))
        .select("ticker", "end", *METRICS)
        .sort("ticker", "end")
    )


def ttm(q: pl.DataFrame) -> pl.DataFrame:
    """ticker | basket | end | date (calendar quarter end) | TTM metrics, plus TTM one year earlier (*_y1)."""
    t = (
        q.sort("ticker", "end")
        .with_columns(
            pl.col(METRICS).rolling_sum(4).over("ticker"),
            span=(pl.col("end") - pl.col("end").shift(3)).dt.total_days().over("ticker"),
        )
        .filter(pl.col("span").is_between(250, 300))
        .with_columns(
            pl.col("ticker").replace_strict(BASKET).alias("basket"),
            date=pl.col("end").dt.offset_by("-45d").dt.truncate("1q").dt.offset_by("2mo").dt.month_end(),
        )
        .unique(["ticker", "date"], keep="last")
    )
    y1 = t.select("ticker", pl.col("date").dt.offset_by("1y").dt.month_end(), *(pl.col(m).alias(f"{m}_y1") for m in METRICS))
    return (
        t.join(y1, on=["ticker", "date"], how="left")
        .select("ticker", "basket", "end", "date", *METRICS, *(f"{m}_y1" for m in METRICS))
        .sort("ticker", "date")
    )


def baskets(t: pl.DataFrame) -> pl.DataFrame:
    """date | basket | TTM metrics summed over members; quarters where all members have every metric."""
    size = {b: len(m) for b, m in SEC_COMPANIES.items()}
    return (
        t.drop_nulls(METRICS)
        .group_by("basket", "date")
        .agg(pl.col(METRICS).sum(), n=pl.len())
        .filter(pl.col("n") == pl.col("basket").replace_strict(size))
        .drop("n")
        .sort("basket", "date")
    )


def snapshot(t: pl.DataFrame) -> pl.DataFrame:
    """Latest TTM per company: TTM metrics, FCF / NI (%) and YoY % of NI and FCF (null when the base is ≤ 0)."""
    yoy = lambda m: pl.when(pl.col(f"{m}_y1") > 0).then((pl.col(m) / pl.col(f"{m}_y1") - 1) * 100).alias(f"{m}_yoy")  # noqa: E731
    return (
        t.drop_nulls(METRICS)
        .group_by("ticker", maintain_order=True).last()
        .select(
            "ticker", "basket", "end", "date", *METRICS,
            pl.when(pl.col("ni") > 0).then(pl.col("fcf") / pl.col("ni") * 100).alias("conv"),
            yoy("ni"), yoy("fcf"),
        )
        .sort(pl.col("basket").replace_strict({b: i for i, b in enumerate(SEC_COMPANIES)}), pl.col("ni"),
              descending=[False, True])
    )
