#!/usr/bin/env python3
"""
Find daily Portuguese government bond yield series in Banco de Portugal's BPstat API.

    uv run python scripts/find_bpstat.py            # every dataset in domain 21 (Interest rates)
    uv run python scripts/find_bpstat.py 21 207     # other domains

Prints domain id | dataset id | series id | label. Put the daily 10Y one in BPSTAT_SERIES
in src/assets/daily_yields.py.
"""

import re
import sys

import requests

BASE = "https://bpstat.bportugal.pt/data/v1"
SERIES_RE = re.compile(r"treasur|bond|\bOT\b|yield|government|public debt|10 year|10-year", re.IGNORECASE)


def get(url: str, **params) -> dict | list:
    r = requests.get(url if url.startswith("http") else f"{BASE}/{url}", params={"lang": "EN", **params}, timeout=60)
    r.raise_for_status()
    return r.json()


def datasets(domain: int) -> list[dict]:
    items, url = [], f"domains/{domain}/datasets"
    while url:
        js = get(url)
        page = js.get("link", {}).get("item") if isinstance(js, dict) else js
        if page is None:  # unexpected layout: show it
            print(f"  unexpected response keys: {list(js)[:10]} {str(js)[:300]}")
            return items
        items += page
        url = js.get("extension", {}).get("next_page") if isinstance(js, dict) else None
    return items


for domain in [int(a) for a in sys.argv[1:]] or [21]:
    print(f"\n# domain {domain}")
    for ds in datasets(domain):
        ext = ds.get("extension", {})
        ds_id = ext.get("id") or ds.get("id")
        print(f"  dataset {ds_id}: {ds.get('label')} ({ext.get('num_series')} series)")
        js = get(f"domains/{domain}/datasets/{ds_id}", obs_last_n=1)
        for s in js.get("extension", {}).get("series", []):
            if SERIES_RE.search(s.get("label", "")):
                print(f"    series {s['id']}: {s['label']}")
