"""
Macro: GDP, inflation and survey expectations (FRED), €STR, AAA forward curve and SPF (ECB Data Portal, no key).

- One series failing (moved or discontinued id) is logged and skipped; FRED keys take the first candidate with data.
- SOFR futures strip: yfinance has no usable daily history per contract, so each run appends the last close per
  live contract from market_data.parquet to sofr_strip.parquet (run after the yfinance step).
"""

import io
import logging
from pathlib import Path

import polars as pl
import requests

from assets.fred import fetch_fred
from utils.series import MACRO_ECB, MACRO_FRED

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
ECB_URL = "https://data-api.ecb.europa.eu/service/data"

logger = logging.getLogger(__name__)


def fetch_ecb(key: str, start: str = "2000-01-01") -> pl.DataFrame:
    """date | value for one ECB series ("<flow>.<key>"); daily, monthly or quarterly periods."""
    flow, series = key.split(".", 1)
    r = requests.get(f"{ECB_URL}/{flow}/{series}", params={"format": "csvdata", "startPeriod": start}, timeout=60)
    r.raise_for_status()
    p = pl.col("TIME_PERIOD")
    quarter = pl.date(p.str.slice(0, 4).cast(pl.Int32, strict=False), p.str.slice(-1).cast(pl.Int8, strict=False) * 3 - 2, 1)
    return (
        pl.read_csv(io.BytesIO(r.content), columns=["TIME_PERIOD", "OBS_VALUE"], infer_schema=False)
        .select(
            pl.coalesce(p.str.to_date("%Y-%m-%d", strict=False), (p + "-01").str.to_date("%Y-%m-%d", strict=False),
                        pl.when(p.str.contains("Q")).then(quarter)).alias("date"),
            pl.col("OBS_VALUE").cast(pl.Float64, strict=False).fill_nan(None).alias("value"),
        )
        .drop_nulls()
    )


def fetch_macro(start: str = "2000-01-01") -> pl.DataFrame:
    """Long date | series_id (MACRO_* key) | value | source."""
    frames = []
    for key, ids in MACRO_FRED.items():
        for sid in ids:
            try:
                df = fetch_fred(sid, start).drop_nulls("value")
            except RuntimeError as exc:
                logger.warning("FRED %s: %s", sid, exc)
                continue
            if df.height:
                frames.append(df.select("date", pl.lit(key).alias("series_id"), "value", pl.lit(f"FRED {sid}").alias("source")))
                break
        else:
            print(f"macro {key}: no data ({', '.join(ids)})")
    for key, sid in MACRO_ECB.items():
        try:
            df = fetch_ecb(sid, start)
        except requests.RequestException as exc:
            print(f"macro {key}: ECB {sid} failed ({exc})")
            continue
        frames.append(df.select("date", pl.lit(key).alias("series_id"), "value", pl.lit(f"ECB {sid}").alias("source")))
    if not frames:
        raise RuntimeError("No macro series could be fetched")
    return pl.concat(frames).sort("series_id", "date")


def save_sofr_strip() -> Path:
    """Append today's SOFR futures closes (last obs per contract in market_data) to sofr_strip.parquet."""
    path = DATA_DIR / "sofr_strip.parquet"
    snap = (
        pl.read_parquet(DATA_DIR / "market_data.parquet")
        .filter(pl.col("series_id").str.starts_with("SR3"))
        .sort("date").group_by("series_id").last()
        .select("date", "series_id", "value")
    )
    if path.exists():
        snap = pl.concat([pl.read_parquet(path), snap])
    snap.unique(["date", "series_id"], keep="last").sort("date", "series_id").write_parquet(path)
    return path


def save_macro_parquet(start: str = "2000-01-01") -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    df = fetch_macro(start)
    path = DATA_DIR / "macro.parquet"
    df.write_parquet(path)
    print(df.group_by("series_id", "source").agg(pl.col("date").max().alias("last"), pl.len()).sort("series_id"))
    try:
        save_sofr_strip()
    except FileNotFoundError as exc:
        print(f"SOFR strip skipped: {exc}")
    return path
