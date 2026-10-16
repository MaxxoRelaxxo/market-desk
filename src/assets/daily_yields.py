"""
Daily 10Y euro government bond yields.

- Riksbank SWEA: discovers every "Government Bond <country>, maturity 10 years" series via /Series.
- Banca d'Italia: BTP 10Y benchmark (cube BMK0200).

Output: src/data/egb_daily.parquet  ->  date | country | yield | source
"""

import io
import os
import time
from pathlib import Path

import polars as pl
import requests
from dotenv import load_dotenv


load_dotenv()

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

SWEA_URL = "https://api.riksbank.se/swea/v1"
BDI_URL = (
    "https://a2a.bancaditalia.it/infostat/dataservices/"
    "export/EN/CSV/DATA/CUBE/BANKITALIA/DIFF/BMK0200"
)
BDI_SERIES = "MFN_BMK.D.020.922.0.EUR.210"

ISO2 = {
    "Austria": "AT", "Belgium": "BE", "Finland": "FI", "France": "FR", "Germany": "DE",
    "Greece": "GR", "Ireland": "IE", "Italy": "IT", "Latvia": "LV", "Netherlands": "NL",
    "Portugal": "PT", "Slovakia": "SK", "Slovenia": "SI", "Spain": "ES",
}

SCHEMA = {"date": pl.Date, "country": pl.String, "yield": pl.Float64, "source": pl.String}


# ============================================================
# RIKSBANK SWEA
# ============================================================

def _swea_get(path: str) -> list | dict:
    """GET with optional subscription key; anonymous calls are rate limited -> back off on 429."""
    headers = {"Cache-Control": "no-cache"}
    if key := os.environ.get("RIKSBANK_API_KEY"):
        headers["Ocp-Apim-Subscription-Key"] = key

    for attempt in range(5):
        r = requests.get(f"{SWEA_URL}/{path}", headers=headers, timeout=30)
        if r.status_code != 429:
            r.raise_for_status()
            return r.json()
        time.sleep(int(r.headers.get("Retry-After", 15 * (attempt + 1))))
    raise RuntimeError(f"SWEA rate limit: {path}")


def swea_bond_series() -> pl.DataFrame:
    """seriesId | country for euro-area 10Y government bonds available in SWEA."""
    series = pl.DataFrame(_swea_get("Series"))
    return (
        series.with_columns(
            pl.col("shortDescription")
            .str.extract(r"Government Bond (\w+), maturity 10 years", 1)
            .alias("name")
        )
        .filter(pl.col("name").is_in(list(ISO2)))
        .select("seriesId", pl.col("name").replace_strict(ISO2).alias("country"))
    )


def fetch_swea(start: str = "2000-01-01") -> pl.DataFrame:
    frames = []
    for series_id, country in swea_bond_series().iter_rows():
        obs = _swea_get(f"Observations/{series_id}/{start}")
        if obs:
            frames.append(
                pl.DataFrame(obs).select(
                    pl.col("date").str.to_date(),
                    pl.lit(country).alias("country"),
                    pl.col("value").cast(pl.Float64).alias("yield"),
                    pl.lit(f"Riksbank {series_id}").alias("source"),
                )
            )
    return pl.concat(frames) if frames else pl.DataFrame(schema=SCHEMA)


# ============================================================
# BANCA D'ITALIA
# ============================================================

def _pick(columns: list[str], *keys: str) -> str:
    for key in keys:
        for c in columns:
            if key in c.lower():
                return c
    raise ValueError(f"No column matching {keys} in {columns}")


def fetch_bdi(series: str = BDI_SERIES) -> pl.DataFrame:
    """
    Download cube BMK0200 and keep one series.

    Handles both long (series key in a column) and wide (series key as header) CSV layouts.
    """
    r = requests.get(BDI_URL, timeout=120)
    r.raise_for_status()
    text = r.content.decode("utf-8-sig")
    sep = ";" if text.splitlines()[0].count(";") > text.splitlines()[0].count(",") else ","
    df = pl.read_csv(io.StringIO(text), separator=sep, infer_schema=False)

    date_col = _pick(df.columns, "time_period", "date", "data", "period")

    if series in df.columns:  # wide
        value_col = series
    else:  # long
        key_col = next((c for c in df.columns if df[c].str.contains(series, literal=True).any()), None)
        if key_col is None:
            raise ValueError(f"{series} not found. Columns: {df.columns}\n{df.head(3)}")
        df = df.filter(pl.col(key_col) == series)
        value_col = _pick(df.columns, "obs_value", "value", "valore")

    return (
        df.select(
            pl.col(date_col).str.to_date(strict=False).alias("date"),
            pl.lit("IT").alias("country"),
            pl.col(value_col).str.replace(",", ".").cast(pl.Float64, strict=False).alias("yield"),
            pl.lit(f"Banca d'Italia {series}").alias("source"),
        )
        .drop_nulls()
    )


# ============================================================
# SAVE
# ============================================================

def save_daily_parquet(start: str = "2000-01-01") -> Path:
    """Fetch all daily sources. One failing source does not stop the others."""
    frames = []
    for name, fetch in [("Riksbank", lambda: fetch_swea(start)), ("Banca d'Italia", fetch_bdi)]:
        try:
            df = fetch()
            print(f"{name}: {df['country'].unique().sort().to_list()} ({df.height} rows)")
            frames.append(df)
        except Exception as e:  # noqa: BLE001
            print(f"{name} failed: {e}")

    if not frames:
        raise RuntimeError("No daily yields fetched")

    out = (
        pl.concat(frames)
        .filter(pl.col("date") >= pl.lit(start).str.to_date())
        .unique(["date", "country"], keep="last")  # Banca d'Italia overrides Riksbank for IT
        .sort("country", "date")
    )
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / "egb_daily.parquet"
    out.write_parquet(path)
    return path
