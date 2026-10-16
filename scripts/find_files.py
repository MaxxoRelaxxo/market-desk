#!/usr/bin/env python3
"""
List downloadable data files on a web page, and peek into one.

    uv run python scripts/find_files.py URL          # numbered list of xls/xlsx/csv/zip links
    uv run python scripts/find_files.py URL 3        # download link 3: sheets + first rows

Used to locate daily bond-yield files (e.g. Bank of Greece) before writing a fetcher.
"""

import html
import io
import re
import sys
from urllib.parse import urljoin

import polars as pl
import requests

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"}
LINK_RE = re.compile(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', re.IGNORECASE | re.DOTALL)
FILE_RE = re.compile(r"\.(xlsx?|csv|zip)(\?|$)|/getmedia/|/media/|download", re.IGNORECASE)

url = sys.argv[1]
page = requests.get(url, headers=HEADERS, timeout=60)
page.raise_for_status()
links = []
for href, text in LINK_RE.findall(page.text):
    full = urljoin(url, html.unescape(href))
    label = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", html.unescape(text))).strip()
    if FILE_RE.search(full) and (full, label) not in links:
        links.append((full, label))

if len(sys.argv) == 2:
    for i, (full, label) in enumerate(links):
        print(f"{i:>3}  {label[:80]:<80}  {full}")
    sys.exit()

full, label = links[int(sys.argv[2])]
print(f"{label}\n{full}\n")
raw = requests.get(full, headers=HEADERS, timeout=120).content
if full.lower().split("?")[0].endswith(".csv") or raw[:1] not in (b"\xd0", b"P"):
    print(raw[:2000].decode("utf-8", "replace"))
else:
    for name, df in pl.read_excel(io.BytesIO(raw), sheet_id=0, has_header=False, infer_schema_length=0).items():
        print(f"--- sheet '{name}' {df.shape}")
        print(df.head(15))
