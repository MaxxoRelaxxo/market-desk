"""
CFTC Commitments of Traders: Traders in Financial Futures (TFF), futures only.

- Socrata API (publicreporting.cftc.gov), dataset gpe5-46if. Positions as of Tuesday, released Friday.
- Contracts: `COT_CONTRACTS` (CFTC contract market code). Long/short contracts per trader group:
  dealer, asset_mgr, lev_money, other (other reportables), nonrept (non-reportables), plus open interest.

Output: src/data/cot.parquet  ->  date | contract | oi | {group}_long | {group}_short
"""

from pathlib import Path

import polars as pl
import requests

from utils.series import COT_CONTRACTS

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

URL = "https://publicreporting.cftc.gov/resource/gpe5-46if.json"
GROUPS = {"dealer": "dealer", "asset_mgr": "asset_mgr", "lev_money": "lev_money",
          "other_rept": "other", "nonrept": "nonrept"}  # API prefix: name


def fetch_cot(contracts: dict[str, str] = COT_CONTRACTS) -> pl.DataFrame:
    codes = ", ".join(f"'{c}'" for c in contracts.values())
    r = requests.get(URL, params={
        "$where": f"cftc_contract_market_code in ({codes})",
        "$order": "report_date_as_yyyy_mm_dd",
        "$limit": 50_000,
    }, timeout=60)
    r.raise_for_status()
    df = pl.DataFrame(r.json(), infer_schema_length=None)
    if df.is_empty():
        raise RuntimeError("No COT data returned")

    # Column suffixes differ (dealer_positions_long_all vs lev_money_positions_long): match on prefix
    col = lambda g, side: next(c for c in df.columns if c.startswith(f"{g}_positions_{side}"))  # noqa: E731
    return (
        df.select(
            pl.col("report_date_as_yyyy_mm_dd").str.slice(0, 10).str.to_date().alias("date"),
            pl.col("cftc_contract_market_code").replace_strict({v: k for k, v in contracts.items()}).alias("contract"),
            pl.col("open_interest_all").cast(pl.Float64).alias("oi"),
            *(pl.col(col(g, side)).cast(pl.Float64).alias(f"{name}_{side}")
              for g, name in GROUPS.items() for side in ("long", "short")),
        )
        .unique(["date", "contract"], keep="last")
        .sort("contract", "date")
    )


def save_cot_parquet() -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / "cot.parquet"
    fetch_cot().write_parquet(path)
    return path
