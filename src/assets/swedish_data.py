
"""
Swedish data
- Yields and FX rates from Riksbank.se
- CPI from SCB (not yet implemented)
"""

import os
import time
from pathlib import Path

import polars as pl
import requests

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

SWEA_URL = "https://api.riksbank.se/swea/v1/Observations"

SCHEMA = {
    "date": pl.Date,
    "series_id": pl.String,
    "value": pl.Float64,
    "source": pl.String,
}

SWEA_SERIES = [
    "SEKAUDPMI",
    "SEKCADPMI",
    "SEKUSDPMI",
    "SEKEURPMI",
    "SEKNOKPMI",
    "SEKCHFPMI",
    "SEKNZDPMI",
    "SEKGBPPMI",
    "SEKJPYPMI",
    "SECBREPOEFF",
    "SEGVB2YC",
    "SEGVB5YC",
    "SEGVB7YC",
    "SEGVB10YC",
    "SEKKIX92",
    "SETB1MBENCHC",
    "SETB3MBENCH",
    "SETB6MBENCH",
    "SETB12MBENCH",
]


def get_swea_series(
    series_id: str,
    from_date: str,
) -> list[dict]:
    """Fetch observations for a single Riksbank series."""

    headers = {"Cache-Control": "no-cache"}

    if key := os.environ.get("RIKSBANK_API_KEY"):
        headers["Ocp-Apim-Subscription-Key"] = key

    url = f"{SWEA_URL}/{series_id}/{from_date}"

    for attempt in range(5):
        response = requests.get(
            url,
            headers=headers,
            timeout=30,
        )

        if response.status_code == 429:
            retry_after = response.headers.get("Retry-After")
            delay = (
                int(retry_after)
                if retry_after and retry_after.isdigit()
                else 15 * (attempt + 1)
            )
            time.sleep(delay)
            continue

        if response.status_code in (204, 404):
            return []

        response.raise_for_status()

        if not response.content.strip():
            return []

        return response.json() or []

    raise RuntimeError(
        f"SWEA rate limit exceeded: {series_id}"
    )


def fetch_swea(
    start: str = "2000-01-01",
) -> pl.DataFrame:
    """Fetch all configured SWEA series."""

    frames: list[pl.DataFrame] = []

    for series_id in SWEA_SERIES:
        try:
            obs = get_swea_series(series_id, start)

            if not obs:
                print(f"SWEA {series_id}: no observations")
                continue

            df = (
                pl.DataFrame(obs)
                .select(
                    pl.col("date")
                    .str.to_date(strict=False)
                    .alias("date"),
                    pl.lit(series_id)
                    .alias("series_id"),
                    pl.col("value")
                    .cast(pl.Float64, strict=False)
                    .alias("value"),
                    pl.lit(f"Riksbank {series_id}")
                    .alias("source"),
                )
                .drop_nulls(subset=["date", "value"])
            )

            frames.append(df)

            print(f"SWEA {series_id}: {df.height} rows")

        except (requests.RequestException, ValueError, pl.PolarsError) as exc:
            print(f"SWEA {series_id}: failed ({exc})")
            continue

    if not frames:
        return pl.DataFrame(schema=SCHEMA)

    return (
        pl.concat(frames)
        .sort(["series_id", "date"])
    )


def save_svea_parquet(
    start: str = "2000-01-01",
) -> Path:
    """Fetch SWEA data and save as Parquet."""

    path = DATA_DIR / "svea_series.parquet"

    df = fetch_swea(start)

    if df.is_empty():
        raise RuntimeError(
            "No SWEA observations retrieved. "
            "Existing Parquet file was not overwritten."
        )

    DATA_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    df.write_parquet(path)

    print(f"Saved {df.height:,} rows to {path}")

    return path
