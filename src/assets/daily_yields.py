"""
Daily 10Y euro government bond yields.

- Riksbank SWEA: Observations/{CC}GVB10Y/{from} (same call pattern as markets-data-hub).
  Euro 10Y series available in SWEA: DE, FI, FR, NL.
- Banca d'Italia: BTP 10Y benchmark (cube BMK0200).
- Banco de España: 10Y Bono (D_G0B1F0ZP), listaSeries API, one calendar year per call.
- National Bank of Belgium: long-term yield of the reference loans, 11am (BE2,DF_IROLOYLD),
  SDMX-JSON from the NSI web service, for BE, AT, GR, IE, PT.

Output: src/data/egb_daily.parquet  ->  date | country | yield | source
"""

import io
import os
import re
import time
import zipfile
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
BDE_URL = "https://app.bde.es/bierest/resources/srdatosapp/listaSeries"
BDE_SERIES = "D_G0B1F0ZP"
NBB_URL = "https://nsidisseminate-stat.nbb.be/rest/data/BE2,DF_IROLOYLD,1.0"
NBB_COUNTRIES = ["BE", "AT", "GR", "IE", "PT"]
NBB_HEADERS = {  # the NBB WAF rejects non-browser requests
    "Accept": "application/vnd.sdmx.data+json",
    "Accept-Language": "en",
    "Origin": "https://dataexplorer.nbb.be",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
}

ISO2 = {
    "Austria": "AT", "Belgium": "BE", "Finland": "FI", "France": "FR", "Germany": "DE",
    "Greece": "GR", "Ireland": "IE", "Italy": "IT", "Latvia": "LV", "Netherlands": "NL",
    "Portugal": "PT", "Slovakia": "SK", "Slovenia": "SI", "Spain": "ES",
}

SWEA_COUNTRIES = ["DE", "FI", "FR", "NL"]

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
        if r.status_code in (204, 400, 404) or not r.content.strip():
            return []  # series does not exist
        r.raise_for_status()
        return r.json() or []
    raise RuntimeError(f"SWEA rate limit: {series_id}")


def fetch_swea(start: str = "2000-01-01") -> pl.DataFrame:
    frames = []
    for country in SWEA_COUNTRIES:
        series_id = f"{country}GVB10Y"
        try:
            obs = get_swea_series(series_id, start)
        except Exception as e:  # noqa: BLE001
            print(f"  SWEA {series_id}: failed ({e})")
            continue
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

DATE_RE = re.compile(r"\d{4}[-/]\d{2}[-/]\d{2}|\d{2}/\d{2}/\d{4}")
DATE_FORMATS = ["%Y-%m-%d", "%Y/%m/%d", "%d/%m/%Y"]


def _decode(raw: bytes) -> str:
    """Infostat may return a zip archive; text is UTF-8 or Windows-1252."""
    if raw[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            name = ([n for n in z.namelist() if n.lower().endswith((".csv", ".txt"))] or z.namelist())[0]
            print(f"  Banca d'Italia: zip {z.namelist()} -> {name}")
            raw = z.read(name)
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return raw.decode("latin-1")  # never fails; ® etc. in metadata only


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
            pl.coalesce(d.str.to_date(f, strict=False) for f in DATE_FORMATS).alias("date"),
            pl.lit("IT").alias("country"),
            pl.col(value_col).str.strip_chars().str.replace(",", ".").cast(pl.Float64, strict=False).alias("yield"),
            pl.lit(f"Banca d'Italia {series}").alias("source"),
        )
        .drop_nulls()
    )


# ============================================================
# BANCO DE ESPAÑA
# ============================================================

def fetch_bde(series: str = BDE_SERIES, start_year: int = 2000) -> pl.DataFrame:
    """
    Daily series allow rango = 3M/12M/36M or a calendar year -> loop over years.

    Response: [{"serie": ..., "fechas": [...], "valores": [...]}] or {"errNum": ...} per series.
    """
    headers = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}
    dates, values = [], []
    for year in range(start_year, time.localtime().tm_year + 1):
        r = requests.get(BDE_URL, params={"idioma": "en", "series": series, "rango": str(year)},
                         headers=headers, timeout=60)
        r.raise_for_status()
        res = r.json()
        s = res[0] if isinstance(res, list) else res
        if s.get("errNum") is not None or not s.get("fechas"):
            continue  # no data that year
        dates += s["fechas"]
        values += [None if v is None else float(v) for v in s["valores"]]

    print(f"  BdE {series}: {len(dates)} rows")
    return (
        pl.DataFrame({"date": dates, "yield": values}, schema={"date": pl.String, "yield": pl.Float64})
        .select(
            pl.col("date").str.slice(0, 10).str.to_date(),
            pl.lit("ES").alias("country"),
            "yield",
            pl.lit(f"Banco de España {series}").alias("source"),
        )
        .drop_nulls()
        .unique("date")
    )


# ============================================================
# NATIONAL BANK OF BELGIUM
# ============================================================

def fetch_nbb(countries: list[str] = NBB_COUNTRIES, start: str = "2000-01-01") -> pl.DataFrame:
    """
    SDMX-JSON 2.0: data.dataSets[0].series["<freq>:<area>"].observations["<t>"] = [value, ...],
    with positions resolved through data.structures[0].dimensions.{series, observation}.
    """
    r = requests.get(f"{NBB_URL}/D.{'+'.join(countries)}", params={"startPeriod": start},
                     headers=NBB_HEADERS, timeout=120)
    r.raise_for_status()
    data = r.json()["data"]
    dims = data["structures"][0]["dimensions"]
    series_dims = sorted(dims["series"], key=lambda d: d.get("keyPosition", 0))
    area_pos = next(i for i, d in enumerate(series_dims) if d["id"].endswith("AREA"))
    areas = [v["id"] for v in series_dims[area_pos]["values"]]
    periods = [v["id"] for v in dims["observation"][0]["values"]]

    rows = [
        (periods[int(t)], areas[int(key.split(":")[area_pos])], obs[0])
        for key, body in data["dataSets"][0]["series"].items()
        for t, obs in body.get("observations", {}).items()
        if obs and obs[0] is not None
    ]
    df = pl.DataFrame(rows, schema={"date": pl.String, "country": pl.String, "yield": pl.Float64}, orient="row")
    for c, g in df.group_by("country"):
        print(f"  NBB D.{c[0]}: {g.height} rows")
    return df.select(
        pl.col("date").str.slice(0, 10).str.to_date(),
        "country",
        "yield",
        pl.concat_str(pl.lit("NBB DF_IROLOYLD D."), pl.col("country")).alias("source"),
    )


# ============================================================
# SAVE
# ============================================================

def save_daily_parquet(start: str = "2000-01-01") -> Path:
    """Fetch all daily sources. One failing source does not stop the others."""
    frames = []
    sources = [
        ("Riksbank", lambda: fetch_swea(start)),
        ("Banca d'Italia", fetch_bdi),
        ("Banco de España", lambda: fetch_bde(start_year=int(start[:4]))),
        ("NBB", lambda: fetch_nbb(start=start)),
    ]
    for name, fetch in sources:
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
