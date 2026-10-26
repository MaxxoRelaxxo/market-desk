"""
CFTC positioning: TFF trader groups plus Legacy non-commercials: gross long, short and net per trader group.

- Net = long − short (contracts). % OI = net / open interest. z 3Y = (net − 156w mean) / 156w std.
  3Y pct = share of the last 156 weeks with net at or below today.
- Price overlay: yfinance continuous front-month future (`COT_FUTURES`), last close on or before the report Tuesday.
  CME FX futures are USD per unit of the currency: JPY is shown as USD/JPY (1 / price), so net long yen
  = short USD/JPY (the frontend inverts that axis). EUR future = EUR/USD.
"""

from pathlib import Path

import polars as pl

from utils.series import COT_FUTURES

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

GROUPS = {
    "noncomm": "Non-commercials",
    "lev_money": "Leveraged funds",
    "asset_mgr": "Asset managers",
    "dealer": "Dealers",
    "other": "Other reportables",
    "nonrept": "Non-reportables",
}
PRICE = {  # label: (price label, invert, digits)
    "UST 2Y": ("2Y note future", False, 3),
    "UST 10Y": ("10Y note future", False, 3),
    "JPY": ("USD/JPY", True, 2),
    "EUR": ("EUR/USD", False, 4),
}
WINDOW = 156  # weeks (3Y)


def positions() -> pl.DataFrame:
    """Weekly long: date | contract | oi | group | long | short | net | pct_oi | z_3y | pct_3y."""
    df = pl.read_parquet(DATA_DIR / "cot.parquet")
    roll = {"window_size": WINDOW, "min_samples": WINDOW // 2}
    return (
        pl.concat([
            df.select("date", "contract", "oi", pl.lit(g).alias("group"),
                      pl.col(f"{g}_long").alias("long"), pl.col(f"{g}_short").alias("short"))
            for g in GROUPS
        ])
        .with_columns(net=pl.col("long") - pl.col("short"))
        .sort("contract", "group", "date")
        .with_columns(
            (pl.col("net") / pl.col("oi") * 100).alias("pct_oi"),
            ((pl.col("net") - pl.col("net").rolling_mean(**roll)) / pl.col("net").rolling_std(**roll))
            .over("contract", "group").alias("z_3y"),
            pl.col("net").rolling_map(lambda s: (s <= s[-1]).mean() * 100, **roll)
            .over("contract", "group").alias("pct_3y"),
        )
    )


def prices(dates: pl.DataFrame) -> pl.DataFrame:
    """date | contract | price: last futures close on or before each report date (null if missing)."""
    px = (
        pl.read_parquet(DATA_DIR / "market_data.parquet")
        .filter(pl.col("series_id").is_in(list(COT_FUTURES.values())))
        .select("date", pl.col("series_id").replace_strict({v: k for k, v in COT_FUTURES.items()}).alias("contract"),
                "value")
        .with_columns(
            pl.when(pl.col("contract").replace_strict({c: p[1] for c, p in PRICE.items()}, default=False))
            .then(1 / pl.col("value")).otherwise(pl.col("value")).alias("price"))
        .drop("value")
        .sort("date")
    )
    return dates.sort("date").join_asof(px, on="date", by="contract", strategy="backward", check_sortedness=False)


def snapshot(df: pl.DataFrame) -> pl.DataFrame:
    """Latest per contract × group with 1W/4W change in net and 1W change in gross long and short."""
    chg = lambda c, n: (pl.col(c).last() - pl.col(c).shift(n).last()).alias(f"chg_{c}_w{n}")  # noqa: E731
    return (
        df.group_by("contract", "group", maintain_order=True)
        .agg(pl.col("date", "oi", "long", "short", "net", "pct_oi", "z_3y", "pct_3y").last(),
             chg("net", 1), chg("net", 4), chg("long", 1), chg("short", 1))
        .with_columns(pl.col("group").replace_strict(GROUPS).alias("label"))
    )
