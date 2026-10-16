"""
Daily 10Y euro government bond yields.

- Riksbank SWEA: Observations/{CC}GVB10Y/{from} (same call pattern as markets-data-hub).
  Every euro country in ISO2 is tried; series that do not exist are skipped.
- Banca d'Italia: BTP 10Y benchmark (cube BMK0200).

Output: src/data/egb_daily.parquet  ->  date | country | yield | source
"""

import io
import os
import re
import time
from pathlib import Path

import polars as pl
import requests
from dotenv import load_dotenv


load_dotenv()

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

SWEA_URL = "https://api.riksbank.se/swea/v1/Observations"
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

def get_swea_series(series_id: str, from_date: str) -> list[dict]:
    """Observations for one series; [] if the series does not exist. Backs off on 429."""
    headers = {"Cache-Control": "no-cache"}
    if key := os.environ.get("RIKSBANK_API_KEY"):
        headers["Ocp-Apim-Subscription-Key"] = key

    for attempt in range(5):
        r = requests.get(f"{SWEA_URL}/{series_id}/{from_date}", headers=headers, timeout=30)
        if r.status_code == 429:
            time.sleep(int(r.headers.get("Retry-After", 15 * (attempt + 1))))
            continue
        if r.status_code in (400, 404):
            return []
        r.raise_for_status()
        return r.json() or []
    raise RuntimeError(f"SWEA rate limit: {series_id}")


def fetch_swea(start: str = "2000-01-01") -> pl.DataFrame:
    frames = []
    for country in ISO2.values():
        series_id = f"{country}GVB10Y"
        obs = get_swea_series(series_id, start)
        print(f"  SWEA {series_id}: {len(obs)} rows")
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

DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}|\d{2}/\d{2}/\d{4}")


def _decode(raw: bytes) -> str:
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return raw.decode("cp1252")  # Infostat exports are Windows-1252 (e.g. 0xAE = ®)


def _pick(columns: list[str], *keys: str) -> str:
    for key in keys:
        for c in columns:
            if key in c.lower():
                return c
    raise ValueError(f"No column matching {keys} in {columns}")


def fetch_bdi(series: str = BDI_SERIES) -> pl.DataFrame:
    """
    Download cube BMK0200 and keep one series.

    Skips any metadata preamble (header = line before the first row with a date) and
    handles both long (series key in a column) and wide (series key as header) layouts.
    """
    r = requests.get(BDI_URL, timeout=120)
    r.raise_for_status()
    lines = _decode(r.content).splitlines()

    dated = [bool(DATE_RE.search(line)) for line in lines] + [False]
    first_data = next((i for i in range(1, len(lines)) if dated[i] and dated[i + 1]), None)
    if not first_data:
        raise ValueError("No dated rows found. First lines:\n" + "\n".join(lines[:10]))
    header = lines[first_data - 1]
    sep = max([";", ",", "\t"], key=header.count)
    df = pl.read_csv(io.StringIO("\n".join(lines[first_data - 1:])), separator=sep,
                     infer_schema=False, truncate_ragged_lines=True)

    date_col = next(c for c in df.columns if df[c].drop_nulls().str.contains(DATE_RE.pattern).all())

    if series in df.columns:  # wide
        value_col = series
    else:  # long
        key_col = next((c for c in df.columns if df[c].str.contains(series, literal=True).any()), None)
        if key_col is None:
            raise ValueError(f"{series} not found. Columns: {df.columns}\n{df.head(3)}")
        df = df.filter(pl.col(key_col) == series)
        value_col = _pick(df.columns, "obs_value", "value", "valore")

    d = pl.col(date_col).str.strip_chars()
    return (
        df.select(
            pl.coalesce(d.str.to_date("%Y-%m-%d", strict=False), d.str.to_date("%d/%m/%Y", strict=False)).alias("date"),
            pl.lit("IT").alias("country"),
            pl.col(value_col).str.strip_chars().str.replace(",", ".").cast(pl.Float64, strict=False).alias("yield"),
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
