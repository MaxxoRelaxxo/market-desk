"""
EGB spread fair-value model (daily cross-section).

spread_i (bp vs Bund) = a + b · debt_i + c · tds_i + e_i      per date, countries ex DE

- Yields: daily 10Y (src/data/egb_daily.parquet: Riksbank SWEA, Banca d'Italia, Banco de España).
- Fundamentals: AMECO levels (% GDP) of the last full year, published with LAG_DAYS lag:
  on date t use year (t - LAG_DAYS).year - 1.
- TDS (twin deficit score) = -(budget balance + current account) / 2; > 0 = deficits.
- z cross-sec = residual / regression sigma that day. z 104w = residual vs own 104-week history.
- LOO: each country's fair value from a fit on the other countries only (out-of-sample check).
"""

from pathlib import Path

import numpy as np
import polars as pl

from assets.daily_yields import ISO2

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

BENCH = "DE"
FACTORS = ["debt", "tds"]           # regressors
SHOWN = ["debt", "fiscal", "ca", "tds"]  # table columns
REG = ["one", *FACTORS]
NAMES = {iso: name for name, iso in ISO2.items()}

LAG_DAYS = 120  # AMECO year Y used from (Y+1)-01-01 + LAG_DAYS
Z_WINDOW = 520  # 104 weeks of business days
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
    """date | country | debt | fiscal | ca | tds — levels, last full year with LAG_DAYS publication lag."""
    a = pl.read_parquet(DATA_DIR / "ameco_fundamentals.parquet").with_columns(
        (-(pl.col("fiscal") + pl.col("ca")) / 2).alias("tds")
    )
    return (
        pl.DataFrame({"date": dates.unique().sort()})
        .with_columns((pl.col("date").dt.offset_by(f"-{LAG_DAYS}d").dt.year() - 1).alias("year"))
        .join(a, on="year")
        .select("date", "country", *SHOWN)
    )


def _solve(xx: np.ndarray, xy: np.ndarray) -> np.ndarray:
    k = len(REG)
    return (np.linalg.pinv(xx.reshape(-1, k, k)) @ xy[..., None])[..., 0]


def run_model(horizon: int = HORIZON) -> pl.DataFrame:
    """
    date | country | yield | obs_date | spread | debt | fiscal | ca | tds
    | alpha | b_debt | b_tds | fair | residual | sigma | r2 | n | z_cs | z_ts
    | loo_fair | loo_residual | loo_b_debt | loo_b_tds | fwd_chg

    One OLS per date across countries (ex DE); X'X and X'y per date, LOO by removing own row.
    """
    s = load_spreads()
    p = (
        s.filter(pl.col("country") != BENCH)
        .join(load_fundamentals(s["date"]), on=["date", "country"])
        .drop_nulls(FACTORS)
        .with_columns(pl.lit(1.0).alias("one"))
        .with_columns(
            *((pl.col(a) * pl.col(b)).sum().over("date").alias(f"xx_{a}_{b}") for a in REG for b in REG),
            *((pl.col(a) * pl.col("spread")).sum().over("date").alias(f"xy_{a}") for a in REG),
        )
    )
    k = len(REG)
    if p["country"].n_unique() <= k:
        raise ValueError(f"{p['country'].n_unique()} countries ex {BENCH}: need more than {k} for {FACTORS} + intercept")

    X, y = p[REG].to_numpy(), p["spread"].to_numpy()
    xx = p[[f"xx_{a}_{b}" for a in REG for b in REG]].to_numpy()
    xy = p[[f"xy_{a}" for a in REG]].to_numpy()
    beta = _solve(xx, xy)
    beta_loo = _solve(xx - np.einsum("ni,nj->nij", X, X).reshape(len(X), -1), xy - X * y[:, None])

    model = (
        p.select("date", "country", "yield", "obs_date", "spread", *SHOWN)
        .with_columns(
            pl.Series("alpha", beta[:, 0]),
            *(pl.Series(f"b_{f}", beta[:, i + 1]) for i, f in enumerate(FACTORS)),
            pl.Series("fair", (X * beta).sum(1)),
            pl.Series("loo_fair", (X * beta_loo).sum(1)),
            *(pl.Series(f"loo_b_{f}", beta_loo[:, i + 1]) for i, f in enumerate(FACTORS)),
        )
        .with_columns(
            (pl.col("spread") - pl.col("fair")).alias("residual"),
            (pl.col("spread") - pl.col("loo_fair")).alias("loo_residual"),
            pl.len().over("date").alias("n"),
        )
        .with_columns(
            ((pl.col("residual") ** 2).sum().over("date") / (pl.col("n") - k)).sqrt().alias("sigma"),
            (1 - (pl.col("residual") ** 2).sum().over("date")
             / ((pl.col("spread") - pl.col("spread").mean().over("date")) ** 2).sum().over("date")).alias("r2"),
        )
        .sort("country", "date")
        .with_columns(
            (pl.col("residual") / pl.col("sigma")).alias("z_cs"),
            ((pl.col("residual") - pl.col("residual").rolling_mean(Z_WINDOW, min_samples=250))
             / pl.col("residual").rolling_std(Z_WINDOW, min_samples=250)).over("country").alias("z_ts"),
            (pl.col("spread").shift(-horizon) - pl.col("spread")).over("country").alias("fwd_chg"),
        )
    )
    return model


def snapshot(model: pl.DataFrame) -> pl.DataFrame:
    """Latest date, ranked cheap -> rich by residual."""
    return (
        model.filter(pl.col("date") == pl.col("date").max())
        .with_columns(
            pl.when(pl.col("z_cs") > 1).then(pl.lit("CHEAP"))
            .when(pl.col("z_cs") < -1).then(pl.lit("RICH"))
            .otherwise(pl.lit("NEUTRAL")).alias("signal"),
            *((pl.col(f"b_{f}") * pl.col(f)).alias(f"c_{f}") for f in FACTORS),
        )
        .sort("residual", descending=True)
    )


def mean_reversion(model: pl.DataFrame) -> pl.DataFrame:
    """Does the residual predict the next-HORIZON spread change? Want negative corr / high hit rate."""
    m = model.drop_nulls(["residual", "fwd_chg"])
    return (
        m.group_by("country")
        .agg(
            pl.corr("residual", "fwd_chg").alias("corr"),
            (pl.col("fwd_chg").sign() == -pl.col("residual").sign()).mean().alias("hit_rate"),
            pl.len().alias("n"),
        )
        .sort("corr")
    )
