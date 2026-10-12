from pathlib import Path
import os

import polars as pl
import requests
from dotenv import load_dotenv

from utils.series import FRED_SERIES


load_dotenv()

BASE_URL = "https://api.stlouisfed.org/fred/series/observations"

# Projektets src-katalog
SRC_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = SRC_DIR / "data"


def fetch_fred(
    series_id: str,
    start: str = "2000-01-01",
) -> pl.DataFrame:

    response = requests.get(
        BASE_URL,
        params={
            "series_id": series_id,
            "api_key": os.environ["FRED_API_KEY"],
            "file_type": "json",
            "observation_start": start,
        },
        timeout=30,
    )

    response.raise_for_status()

    observations = response.json()["observations"]

    if not observations:
        return pl.DataFrame(
            schema={
                "date": pl.Date,
                "series_id": pl.String,
                "value": pl.Float64,
            }
        )

    return (
        pl.DataFrame(observations)
        .select(
            pl.col("date").str.to_date(),
            pl.lit(series_id).alias("series_id"),
            pl.col("value")
            .replace(".", None)
            .cast(pl.Float64, strict=False)
            .alias("value"),
        )
    )


def fetch_all_fred(
    start: str = "2000-01-01",
) -> pl.DataFrame:

    series_ids = [
        series_id
        for category in FRED_SERIES.values()
        for series_id in category.values()
    ]

    frames = [
        fetch_fred(series_id, start)
        for series_id in series_ids
    ]

    return pl.concat(frames).sort(["series_id", "date"])


def save_fred_parquet(
    start: str = "2000-01-01",
) -> Path:

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    df = fetch_all_fred(start=start)

    output_path = DATA_DIR / "us_rates.parquet"

    df.write_parquet(output_path)

    return output_path