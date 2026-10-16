"""
EGB spread fair-value model.

spread_it (bp vs Bund) = FE_t + b_t · [debt, fiscal, ca]_it (relative to DE) + e_it

- Yields: FRED 10Y (monthly), fundamentals: AMECO (annual, % GDP).
- Fundamentals are 12M-forward: month m blends year t and t+1 with weight m/12.
- Betas from a rolling pooled OLS with month fixed effects (cross-sectional RV).
- Residual > 0 -> cheap vs fundamentals, < 0 -> rich.
"""

from pathlib import Path

import numpy as np
import polars as pl

from utils.series import FRED_SERIES


DATA_DIR = Path(__file__).resolve().parents[1] / "data"

BENCH = "DE"
FACTORS = ["debt", "fiscal", "ca"]
YIELDS = {
    series_id: "LV" if series_id.startswith("LVA") else series_id[8:10]
    for series_id in FRED_SERIES["egb_10y"].values()
}
NAMES = {
    YIELDS[series_id]: name.removesuffix(" Government Bond 10Y")
    for name, series_id in FRED_SERIES["egb_10y"].items()
}


def load_spreads() -> pl.DataFrame:
    """date | country | yield | spread (bp vs Bund)"""
    y = (
        pl.read_parquet(DATA_DIR / "us_rates.parquet")
        .filter(pl.col("series_id").is_in(list(YIELDS)))
        .drop_nulls("value")
        .select(
            pl.col("date").dt.month_start(),
            pl.col("series_id").replace_strict(YIELDS).alias("country"),
            pl.col("value").alias("yield"),
        )
    )
    bund = y.filter(pl.col("country") == BENCH).select("date", pl.col("yield").alias("bund"))
    return (
        y.join(bund, on="date")
        .with_columns(((pl.col("yield") - pl.col("bund")) * 100).alias("spread"))
        .drop("bund")
        .sort("country", "date")
    )


def load_fundamentals(dates: pl.Series) -> pl.DataFrame:
    """date | country | debt | fiscal | ca — relative to DE, 12M forward blend."""
    a = pl.read_parquet(DATA_DIR / "ameco_fundamentals.parquet")
    rel = a.join(a.filter(pl.col("country") == BENCH).drop("country"), on="year", suffix="_de").select(
        "country", "year", *((pl.col(f) - pl.col(f"{f}_de")).alias(f) for f in FACTORS)
    )
    nxt = rel.with_columns(pl.col("year") - 1)  # year t+1 keyed on t
    w = pl.col("date").dt.month() / 12

    return (
        pl.DataFrame({"date": dates.unique().sort()})
        .with_columns(pl.col("date").dt.year().alias("year"))
        .join(rel, on="year")
        .join(nxt, on=["country", "year"], how="left", suffix="_next")
        .select(
            "date", "country",
            *(((1 - w) * pl.col(f) + w * pl.col(f"{f}_next").fill_null(pl.col(f))).alias(f) for f in FACTORS),
        )
    )


def rolling_betas(panel: pl.DataFrame, window: int = 36, min_months: int = 24) -> pl.DataFrame:
    """Pooled OLS with month fixed effects (= demeaning by date) on a trailing window."""
    dm = panel.select(
        "date",
        *((pl.col(c) - pl.col(c).mean().over("date")).alias(c) for c in ["spread", *FACTORS]),
    )
    dates = dm["date"].unique().sort().to_list()
    rows = []
    for i in range(min_months - 1, len(dates)):
        win = dm.filter(pl.col("date").is_between(dates[max(0, i - window + 1)], dates[i]))
        beta, *_ = np.linalg.lstsq(win[FACTORS].to_numpy(), win["spread"].to_numpy(), rcond=None)
        rows.append([dates[i], *beta])
    return pl.DataFrame(rows, schema=["date", *(f"b_{f}" for f in FACTORS)], orient="row")


def run_model(window: int = 36, z_window: int = 36, horizon: int = 3) -> tuple[pl.DataFrame, pl.DataFrame]:
    """
    Returns (model, betas).

    model: date | country | yield | spread | debt | fiscal | ca | fair | residual | z | fwd_chg
    """
    s = load_spreads()
    panel = s.join(load_fundamentals(s["date"]), on=["date", "country"]).drop_nulls()
    betas = rolling_betas(panel, window)

    explained = pl.sum_horizontal(
        (pl.col(f) - pl.col(f).mean().over("date")) * pl.col(f"b_{f}") for f in FACTORS
    )
    roll = dict(window_size=z_window, min_samples=12)

    model = (
        panel.join(betas, on="date")
        .with_columns((pl.col("spread").mean().over("date") + explained).alias("fair"))
        .with_columns((pl.col("spread") - pl.col("fair")).alias("residual"))
        .sort("country", "date")
        .with_columns(
            ((pl.col("residual") - pl.col("residual").rolling_mean(**roll))
             / pl.col("residual").rolling_std(**roll)).over("country").alias("z"),
            (pl.col("spread").shift(-horizon) - pl.col("spread")).over("country").alias("fwd_chg"),
        )
        .drop(f"b_{f}" for f in FACTORS)
    )
    return model, betas


def snapshot(model: pl.DataFrame) -> pl.DataFrame:
    """Latest observation per country, ranked cheap -> rich."""
    return (
        model.filter(pl.col("date") == pl.col("date").max().over("country"))
        .filter(pl.col("country") != BENCH)
        .with_columns(
            pl.when(pl.col("z") > 1).then(pl.lit("CHEAP"))
            .when(pl.col("z") < -1).then(pl.lit("RICH"))
            .otherwise(pl.lit("FAIR")).alias("signal")
        )
        .select("country", "date", "yield", "spread", "fair", "residual", "z", "signal", *FACTORS)
        .sort("z", descending=True, nulls_last=True)
    )


def mean_reversion(model: pl.DataFrame) -> pl.DataFrame:
    """Does the residual predict the next-horizon spread change? Want negative corr / high hit rate."""
    m = model.drop_nulls(["z", "fwd_chg"]).filter(pl.col("country") != BENCH)
    return (
        m.group_by("country")
        .agg(
            pl.corr("residual", "fwd_chg").alias("corr"),
            (pl.col("fwd_chg").sign() == -pl.col("residual").sign()).mean().alias("hit_rate"),
            pl.len().alias("n"),
        )
        .sort("corr")
    )
