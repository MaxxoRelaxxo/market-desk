"""
SEC EDGAR XBRL company facts (data.sec.gov, no key): net income, operating cash flow and capex per company.

- `companyfacts/CIK##########.json`: us-gaap duration facts in USD from 10-K/10-Q, incl. restated comparatives.
- Companies `SEC_COMPANIES`, tag candidates per metric `SEC_TAGS` (rank 0 = preferred).
- Values are as filed: 3M or year-to-date (cash flow is YTD only); `models/equity.py` derives discrete quarters.
- SEC requires a User-Agent with name and email, else 403: env `SEC_USER_AGENT` (or .env). Max 10 requests/s.

Output: src/data/sec_facts.parquet  ->  ticker | metric | rank | start | end | val | filed
"""

import logging
import os
import time
from pathlib import Path

import polars as pl
import requests
from dotenv import load_dotenv

from utils.series import SEC_COMPANIES, SEC_TAGS

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:0>10}.json"

logger = logging.getLogger(__name__)

load_dotenv()


def fetch_company(ticker: str, cik: str, ua: str) -> pl.DataFrame:
    r = requests.get(URL.format(cik=cik), headers={"User-Agent": ua}, timeout=60)
    if not r.ok:  # SEC/Akamai put the reason in the body
        raise RuntimeError(f"HTTP {r.status_code}: {' '.join(r.text.split())[:300]}")
    gaap = r.json()["facts"].get("us-gaap", {})
    rows = [
        {"ticker": ticker, "metric": m, "rank": i, "start": f["start"], "end": f["end"], "val": f["val"], "filed": f["filed"]}
        for m, tags in SEC_TAGS.items()
        for i, tag in enumerate(tags)
        for f in gaap.get(tag, {}).get("units", {}).get("USD", [])
        if "start" in f and f.get("form", "").startswith(("10-K", "10-Q"))
    ]
    return pl.DataFrame(rows, schema={"ticker": pl.String, "metric": pl.String, "rank": pl.Int8, "start": pl.String,
                                      "end": pl.String, "val": pl.Float64, "filed": pl.String}
                        ).with_columns(pl.col("start", "end", "filed").str.to_date())


def save_sec_parquet() -> Path:
    ua = os.environ.get("SEC_USER_AGENT")
    if not ua or "@" not in ua:
        raise RuntimeError('Set SEC_USER_AGENT="Name email@domain" (SEC returns 403 without an email)')
    frames = []
    for ticker, cik in {t: c for basket in SEC_COMPANIES.values() for t, c in basket.items()}.items():
        try:
            frames.append(fetch_company(ticker, cik, ua))
        except Exception as exc:
            logger.warning("SEC %s failed: %s", ticker, exc)
        time.sleep(0.2)
    if not frames:
        raise RuntimeError("No SEC company facts could be fetched")
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / "sec_facts.parquet"
    pl.concat(frames).write_parquet(path)
    return path
