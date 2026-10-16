"""
EGB spread fair-value model (daily).

spread_it (bp vs Bund) = FE_t + b_t · [FACTORS]_it (relative to DE) + e_it

- Yields: daily 10Y (src/data/egb_daily.parquet: Riksbank SWEA, Banca d'Italia).
- Fundamentals: AMECO (annual, % GDP), 12M-forward: month m blends year t and t+1 with weight m/12.
- Betas: rolling pooled OLS with daily fixed effects (cross-sectional RV) over WINDOW business days.
- Residual > 0 -> cheap vs fundamentals, < 0 -> rich. z = residual / own rolling residual vol.
"""

from pathlib import Path

import numpy as np
import polars as pl

from assets.daily_yields import ISO2


DATA_DIR = Path(__file__).resolve().parents[1] / "data"

BENCH = "DE"
# 6 countries (DE, FI, FR, NL, IT, ES) -> 5 demeaned obs per day: keep k small or the fit is near-exact.
# Add "ca" back when more countries have a daily source.
FACTORS = ["debt", "fiscal"]
NAMES = {iso: name for name, iso in ISO2.items()}

WINDOW = 756    # ~3Y of business days, betas and residual vol
HORIZON = 63    # ~3M, backtest
MAX_GAP = 5     # forward-fill holidays / missing prints up to this many business days


def load_spreads() -> pl.DataFrame:
    """
    date | country | yield | obs_date | spread (bp vs Bund)

    Business-day grid on Bund dates; each country forward-filled up to MAX_GAP days.
    Starts on the first date where every country has a print (stable cross-section).
    """
    y = pl.read_parquet(DATA_DIR / "egb_daily.parquet").select("date", "country", "yield").drop_nulls()
    if y.filter(pl.col("country") == BENCH).is_empty():
        raise ValueError(f"No daily {BENCH} yield in egb_daily.parquet")

    dates = y.filter(pl.col("country") == BENCH).select("date").unique()
    panel = (
        dates.join(y.select("country").unique(), how="cross")
        .join(y.with_columns(pl.col("date").alias("obs_date")), on=["date", "country"], how="left")
        .sort("country", "date")
        .with_columns(pl.col("yield", "obs_date").forward_fill(limit=MAX_GAP).over("country"))
    )
    n = panel["country"].n_unique()
    start = panel.drop_nulls("yield").group_by("country").agg(pl.col("date").min())["date"].max()
    bund = panel.filter(pl.col("country") == BENCH).select("date", pl.col("yield").alias("bund"))

    return (
        panel.filter(pl.col("date") >= start)
        .join(bund, on="date")
        .with_columns(((pl.col("yield") - pl.col("bund")) * 100).alias("spread"))
        .drop("bund")
        .filter(pl.col("spread").is_not_null().sum().over("date") == n)
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


def rolling_betas(panel: pl.DataFrame, window: int = WINDOW, min_days: int = 250) -> pl.DataFrame:
    """
    Pooled OLS with daily fixed effects (= demeaning by date) on a trailing window.

    Rolling sums of per-date X'X and X'y, then one k x k solve per date.
    """
    k = len(FACTORS)
    dm = panel.select(
        "date", *((pl.col(c) - pl.col(c).mean().over("date")).alias(c) for c in ["spread", *FACTORS])
    )
    xx = [f"xx_{a}_{b}" for a in FACTORS for b in FACTORS]
    xy = [f"xy_{a}" for a in FACTORS]

    s = (
        dm.group_by("date")
        .agg(
            *((pl.col(a) * pl.col(b)).sum().alias(f"xx_{a}_{b}") for a in FACTORS for b in FACTORS),
            *((pl.col(a) * pl.col("spread")).sum().alias(f"xy_{a}") for a in FACTORS),
        )
        .sort("date")
        .with_columns(pl.col(*xx, *xy).rolling_sum(window_size=window, min_samples=min_days))
        .drop_nulls()
    )
    beta = (np.linalg.pinv(s[xx].to_numpy().reshape(-1, k, k)) @ s[xy].to_numpy()[..., None])[..., 0]
    return pl.DataFrame({"date": s["date"], **{f"b_{f}": beta[:, i] for i, f in enumerate(FACTORS)}})


def run_model(window: int = WINDOW, horizon: int = HORIZON) -> tuple[pl.DataFrame, pl.DataFrame]:
    """
    Returns (model, betas).

    model: date | country | yield | obs_date | spread | debt | fiscal | ca
           | base | c_debt | c_fiscal | c_ca | fair | residual | res_vol | z | fwd_chg

    fair = base (cross-country avg spread) + sum(c_f), c_f = b_f * (f - avg f).
    Betas are pooled: identical for all countries on a given date.
    """
    s = load_spreads()
    n = s["country"].n_unique()
    if n - 1 <= len(FACTORS):
        raise ValueError(f"{n} countries incl. {BENCH}: need more than {len(FACTORS) + 1} for {len(FACTORS)} factors")

    panel = s.join(load_fundamentals(s["date"]), on=["date", "country"]).drop_nulls(FACTORS)
    betas = rolling_betas(panel, window)

    model = (
        panel.join(betas, on="date")
        .with_columns(
            pl.col("spread").mean().over("date").alias("base"),
            *(((pl.col(f) - pl.col(f).mean().over("date")) * pl.col(f"b_{f}")).alias(f"c_{f}") for f in FACTORS),
        )
        .with_columns((pl.col("base") + pl.sum_horizontal(f"c_{f}" for f in FACTORS)).alias("fair"))
        .with_columns((pl.col("spread") - pl.col("fair")).alias("residual"))
        .sort("country", "date")
        .with_columns(
            pl.col("residual").rolling_std(window_size=window, min_samples=250).over("country").alias("res_vol"),
            (pl.col("spread").shift(-horizon) - pl.col("spread")).over("country").alias("fwd_chg"),
        )
        # z: sign matches the residual (above/below fair), scaled by the country's own residual vol
        .with_columns((pl.col("residual") / pl.col("res_vol")).alias("z"))
        .drop(f"b_{f}" for f in FACTORS)
    )
    return model, betas


def snapshot(model: pl.DataFrame) -> pl.DataFrame:
    """Latest date, ranked cheap -> rich."""
    return (
        model.filter(pl.col("date") == pl.col("date").max(), pl.col("country") != BENCH)
        .with_columns(
            pl.when(pl.col("z") > 1).then(pl.lit("CHEAP"))
            .when(pl.col("z") < -1).then(pl.lit("RICH"))
            .otherwise(pl.lit("FAIR")).alias("signal")
        )
        .select("country", "date", "obs_date", "yield", "spread", "fair", "residual", "z", "signal",
                *FACTORS, "base", *(f"c_{f}" for f in FACTORS))
        .sort("z", descending=True, nulls_last=True)
    )


def mean_reversion(model: pl.DataFrame) -> pl.DataFrame:
    """Does the residual predict the next-HORIZON spread change? Want negative corr / high hit rate."""
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
