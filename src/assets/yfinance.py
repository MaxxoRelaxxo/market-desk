
from pathlib import Path
import logging

import polars as pl
import yfinance as yf

from utils.series import YFINANCE_SERIES


SRC_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = SRC_DIR / "data"

logger = logging.getLogger(__name__)

SCHEMA = {
    "date": pl.Date,
    "series_id": pl.String,
    "value": pl.Float64,
}


def fetch_yfinance(
    series_id: str,
    start: str = "2000-01-01",
) -> pl.DataFrame:

    df = yf.Ticker(series_id).history(
        start=start,
        interval="1d",
        auto_adjust=False,
    )

    if df.empty:
        logger.warning("No data for %s", series_id)
        return pl.DataFrame(schema=SCHEMA)

    df = df.reset_index()

    date_col = "Date" if "Date" in df.columns else "Datetime"

    return (
        pl.from_pandas(df)
        .select(
            pl.col(date_col).cast(pl.Date).alias("date"),
            pl.lit(series_id).alias("series_id"),
            pl.col("Close")
            .cast(pl.Float64, strict=False)
            .alias("value"),
        )
        .drop_nulls("value")
    )


def fetch_all_yfinance(
    start: str = "2000-01-01",
) -> pl.DataFrame:

    series_ids = list(dict.fromkeys(
        series_id
        for category in YFINANCE_SERIES.values()
        for series_id in category.values()
    ))

    frames = []
    failed = []

    for series_id in series_ids:

        try:
            df = fetch_yfinance(series_id, start)

            if df.is_empty():
                failed.append(series_id)
                continue

            frames.append(df)

        except Exception as exc:
            logger.warning(
                "Failed to fetch %s: %s",
                series_id,
                exc,
            )
            failed.append(series_id)

    if failed:
        logger.warning(
            "Unavailable tickers (%s): %s",
            len(failed),
            ", ".join(failed),
        )

    if not frames:
        raise RuntimeError(
            "No yfinance series could be fetched"
        )

    return (
        pl.concat(frames)
        .sort(["series_id", "date"])
    )


def save_yfinance_parquet(
    start: str = "2000-01-01",
) -> Path:

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    df = fetch_all_yfinance(start=start)

    output_path = DATA_DIR / "market_data.parquet"

    df.write_parquet(output_path)

    return output_path
