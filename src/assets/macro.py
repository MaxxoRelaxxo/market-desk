"""
Macro: GDP, inflation, leading indicators and policy inputs -> macro.parquet (date | series_id | value | source).

- `MACRO_SERIES`: "<SOURCE>:<id>" candidates per key, first with data wins. FRED, ECB Data Portal and OECD (SDMX CSV,
  no key). `SCB_SERIES`: Statistics Sweden PxWebApi 2 tables, one series picked by label regexes (lang=en).
- A failing series is printed and skipped; the rest still save.
- Fed funds futures: yfinance has no usable daily history per contract, so each run appends the last close per live
  ZQ contract from market_data.parquet to ff_strip.parquet (run after the yfinance step).
"""

import io
import re
from pathlib import Path

import polars as pl
import requests

from assets.fred import fetch_fred
from utils.series import MACRO_SERIES, SCB_SERIES

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
SDMX = {
    "ECB": ("https://data-api.ecb.europa.eu/service/data/{flow}/{key}", {"format": "csvdata"}),
    "OECD": ("https://sdmx.oecd.org/public/rest/data/{flow}/{key}", {"format": "csvfile"}),
}
SCB_BASES = ["https://statistikdatabasen.scb.se/api/v2", "https://api.scb.se/ov0104/v2beta/api/v2"]


def _period(col: str) -> pl.Expr:
    """Date of a period label: 2024-01-02, 2024-01 / 2024M01, 2024-Q1 / 2024K1 (first day of the period)."""
    p = pl.col(col).str.replace(r"^(\d{4})M(\d{2})$", "$1-$2")
    q = pl.date(p.str.slice(0, 4).cast(pl.Int32, strict=False), p.str.slice(-1).cast(pl.Int8, strict=False) * 3 - 2, 1)
    return pl.coalesce(p.str.to_date("%Y-%m-%d", strict=False), (p + "-01").str.to_date("%Y-%m-%d", strict=False),
                       pl.when(p.str.contains(r"^\d{4}-?[QK]\d$")).then(q))


def fetch_sdmx(source: str, sid: str, start: str = "2000-01-01") -> pl.DataFrame:
    """date | value for one ECB ("<flow>.<key>") or OECD ("<flow>|<key>") series."""
    url, params = SDMX[source]
    flow, key = sid.split("|", 1) if source == "OECD" else sid.split(".", 1)
    r = requests.get(url.format(flow=flow, key=key), params={**params, "startPeriod": start[:7]}, timeout=60)
    r.raise_for_status()
    return (
        pl.read_csv(io.BytesIO(r.content), columns=["TIME_PERIOD", "OBS_VALUE"], infer_schema=False)
        .select(_period("TIME_PERIOD").alias("date"),
                pl.col("OBS_VALUE").cast(pl.Float64, strict=False).fill_nan(None).alias("value"))
        .drop_nulls()
    )


def fetch_scb(table: str, include: list[str], exclude: list[str]) -> pl.DataFrame:
    """date | value for the one series of an SCB table whose joined labels match `include` and none of `exclude`."""
    for base in SCB_BASES:
        try:
            meta = requests.get(f"{base}/tables/{table}/metadata", params={"lang": "en"}, timeout=60)
            meta.raise_for_status()
            break
        except requests.RequestException as exc:
            err = exc
    else:
        raise RuntimeError(f"SCB {table}: {err}")
    dims = meta.json()["id"]
    r = requests.get(f"{base}/tables/{table}/data", timeout=60, params={
        "lang": "en", "outputFormat": "json-stat2", **{f"valuecodes[{d}]": "*" for d in dims}})
    r.raise_for_status()
    js = r.json()
    # JSON-stat: values in row-major order over `id`; chained cross joins give the same order
    grid = None
    for d in js["id"]:
        cat = js["dimension"][d]["category"]
        codes = sorted(cat["index"], key=cat["index"].get)
        f = pl.DataFrame({d: codes, f"{d}_label": [cat.get("label", {}).get(c, c) for c in codes]})
        grid = f if grid is None else grid.join(f, how="cross")
    time = (js.get("role", {}).get("time") or [d for d in js["id"] if d.lower() in ("tid", "time")])[0]
    other = [f"{d}_label" for d in js["id"] if d != time]
    df = grid.with_columns(pl.Series("value", js["value"], dtype=pl.Float64, strict=False),
                           pl.concat_str(other, separator=" | ").alias("series") if other else pl.lit(""))
    keep = [s for s in df["series"].unique().to_list()
            if all(re.search(x, s) for x in include) and not any(re.search(x, s) for x in exclude)]
    if len(keep) != 1:
        options = "\n  ".join(sorted(df["series"].unique().to_list())[:30])
        raise RuntimeError(f"SCB {table}: {len(keep)} series match, need 1. Options:\n  {options}")
    return df.filter(pl.col("series") == keep[0]).select(_period(time).alias("date"), "value").drop_nulls()


def _fetch(cand: str, start: str) -> pl.DataFrame:
    source, sid = cand.split(":", 1)
    return fetch_fred(sid, start) if source == "FRED" else fetch_sdmx(source, sid, start)


def fetch_macro(start: str = "2000-01-01") -> pl.DataFrame:
    """Long date | series_id (key) | value | source."""
    jobs = {k: [(c, lambda c=c: _fetch(c, start)) for c in v] for k, v in MACRO_SERIES.items()}
    jobs |= {k: [(f"SCB:{t}", lambda t=t, v=v: fetch_scb(t, v["include"], v["exclude"])) for t in v["tables"]]
             for k, v in SCB_SERIES.items()}
    frames = []
    for key, cands in jobs.items():
        for name, fetch in cands:
            try:
                df = fetch().drop_nulls("value").filter(pl.col("date") >= pl.lit(start).str.to_date())
            except (RuntimeError, requests.RequestException, KeyError, ValueError) as exc:
                print(f"macro {key}: {name} failed ({exc})")
                continue
            if df.height:
                frames.append(df.select("date", pl.lit(key).alias("series_id"), "value", pl.lit(name).alias("source")))
                break
        else:
            print(f"macro {key}: no data")
    if not frames:
        raise RuntimeError("No macro series could be fetched")
    return pl.concat(frames).sort("series_id", "date")


def save_ff_strip() -> Path:
    """Append today's Fed funds futures closes (last obs per ZQ contract in market_data) to ff_strip.parquet."""
    path = DATA_DIR / "ff_strip.parquet"
    snap = (
        pl.read_parquet(DATA_DIR / "market_data.parquet")
        .filter(pl.col("series_id").str.starts_with("ZQ"))
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
        save_ff_strip()
    except FileNotFoundError as exc:
        print(f"Fed funds strip skipped: {exc}")
    return path
