#!/usr/bin/env python3
"""
Find daily Portuguese government bond yield series in Banco de Portugal's BPstat API.

    uv run python scripts/find_bpstat.py

Prints domain id | dataset id | series id | label for series that look like
treasury bond yields. Put the 10Y daily one in BPSTAT_SERIES in src/assets/daily_yields.py.
"""

import re

import requests

BASE = "https://bpstat.bportugal.pt/data/v1"
DOMAIN_RE = re.compile(r"interest|rate|financial market|securit|bond", re.IGNORECASE)
DATASET_RE = re.compile(r"bond|treasur|yield|obriga|rendib|government|public debt", re.IGNORECASE)
SERIES_RE = re.compile(r"10|ten", re.IGNORECASE)


def get(url: str, **params) -> dict | list:
    r = requests.get(url if url.startswith("http") else f"{BASE}/{url}", params={"lang": "EN", **params}, timeout=60)
    r.raise_for_status()
    return r.json()


def paged_items(path: str) -> list[dict]:
    items, url = [], path
    while url:
        js = get(url)
        items += js.get("link", {}).get("item", [])
        url = js.get("extension", {}).get("next_page")
    return items


domains = [d for d in get("domains") if d.get("has_series") or d.get("num_datasets")]
for d in domains:
    if not DOMAIN_RE.search(d["label"]):
        continue
    print(f"\n# domain {d['id']}: {d['label']}")
    for ds in paged_items(f"domains/{d['id']}/datasets"):
        label, ds_id = ds["label"], ds["extension"]["id"]
        if not DATASET_RE.search(label):
            continue
        print(f"  dataset {ds_id}: {label} ({ds['extension'].get('num_series')} series)")
        js = get(f"domains/{d['id']}/datasets/{ds_id}", obs_last_n=1)
        for s in js.get("extension", {}).get("series", []):
            if SERIES_RE.search(s["label"]):
                print(f"    series {s['id']}: {s['label']}")
