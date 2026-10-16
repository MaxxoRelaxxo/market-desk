#!/usr/bin/env python3
"""
Find daily Portuguese government bond yield series in Banco de Portugal's BPstat API.

    uv run python scripts/find_bpstat.py          # list every domain (id, series count, label)
    uv run python scripts/find_bpstat.py 21 194   # every series in these domains -> bpstat_series.txt,
                                                  # matches (bond / yield / treasury / daily) to screen

Put the daily 10Y one as (domain_id, dataset_id, series_id) in BPSTAT_SERIES in src/assets/daily_yields.py.
"""

import re
import sys
from pathlib import Path

import requests

BASE = "https://bpstat.bportugal.pt/data/v1"
MATCH = re.compile(r"treasur|bond|obriga|\bOT\b|yield|rendib|government debt|public debt", re.IGNORECASE)
OUT = Path("bpstat_series.txt")


def get(url: str, **params) -> dict | list:
    r = requests.get(url if url.startswith("http") else f"{BASE}/{url}", params={"lang": "EN", **params}, timeout=60)
    r.raise_for_status()
    return r.json()


def datasets(domain: int) -> list[dict]:
    items, url = [], f"domains/{domain}/datasets"
    while url:
        js = get(url)
        items += js.get("link", {}).get("item", [])
        url = js.get("extension", {}).get("next_page")
    return items


if len(sys.argv) == 1:
    for d in get("domains"):
        print(f"{d['id']:>5}  {d.get('num_series') or 0:>6} series  {d['label']}")
    sys.exit()

lines = []
for domain in map(int, sys.argv[1:]):
    for ds in datasets(domain):
        ds_id = ds["extension"]["id"]
        js = get(f"domains/{domain}/datasets/{ds_id}", obs_last_n=1)
        for s in js.get("extension", {}).get("series", []):
            line = f"({domain}, \"{ds_id}\", {s['id']})  {s['label']}"
            lines.append(line)
            if MATCH.search(s["label"]):
                print(line)

OUT.write_text("\n".join(lines), encoding="utf-8")
print(f"\n{len(lines)} series written to {OUT.resolve()}  (grep -i daily {OUT})")
