"""
CFTC positioning (TFF): net = long − short (contracts) per trader group.

- % OI = net / open interest. z 3Y = (net − 156w mean) / 156w std. 3Y pct = share of the last 156 weeks
  with net at or below today.
- JPY futures are quoted USD per JPY: net long = long yen = short USD/JPY.
"""

from pathlib import Path

import polars as pl

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

GROUPS = {
    "lev_money": "Leveraged funds",
    "asset_mgr": "Asset managers",
    "dealer": "Dealers",
    "other": "Other reportables",
    "nonrept": "Non-reportables",
}
WINDOW = 156  # weeks (3Y)


def net() -> pl.DataFrame:
    """Weekly long: date | contract | group | net | pct_oi | z_3y | pct_3y."""
    df = pl.read_parquet(DATA_DIR / "cot.parquet")
    roll = {"window_size": WINDOW, "min_samples": WINDOW // 2}
    return (
        df.select("date", "contract", "oi",
                  *((pl.col(f"{g}_long") - pl.col(f"{g}_short")).alias(g) for g in GROUPS))
        .unpivot(index=["date", "contract", "oi"], variable_name="group", value_name="net")
        .sort("contract", "group", "date")
        .with_columns(
            (pl.col("net") / pl.col("oi") * 100).alias("pct_oi"),
            ((pl.col("net") - pl.col("net").rolling_mean(**roll)) / pl.col("net").rolling_std(**roll))
            .over("contract", "group").alias("z_3y"),
            pl.col("net").rolling_map(lambda s: (s <= s[-1]).mean() * 100, **roll)
            .over("contract", "group").alias("pct_3y"),
        )
    )


def snapshot(df: pl.DataFrame) -> pl.DataFrame:
    """Latest per contract × group with 1W and 4W change in net."""
    return (
        df.group_by("contract", "group", maintain_order=True)
        .agg(
            pl.col("date", "oi", "net", "pct_oi", "z_3y", "pct_3y").last(),
            (pl.col("net").last() - pl.col("net").shift(1).last()).alias("chg_w1"),
            (pl.col("net").last() - pl.col("net").shift(4).last()).alias("chg_w4"),
        )
        .with_columns(pl.col("group").replace_strict(GROUPS).alias("label"))
    )
