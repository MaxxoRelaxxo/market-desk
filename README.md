# market-desk

To run in terminal:
PYTHONPATH=src uv run python -c "from assets.fred import save_fred_parquet; print(save_fred_parquet())"

PYTHONPATH=src uv run python -c "from assets.ameco import inspect_ameco; print(inspect_ameco('ameco_chapter18-01'))"
PYTHONPATH=src uv run python -c "from assets.ameco import inspect_ameco; print(inspect_ameco('ameco_chapter16-03'))"
PYTHONPATH=src uv run python -c "from assets.ameco import inspect_ameco; print(inspect_ameco('ameco_chapter10-01'))"


To start Marimo:
uv run marimo edit src/notebooks/market_desk.py

## Market Desk (frontend)

Same structure as markets-data-hub: Python/Polars → `scripts/build_data.py` → JSON in `frontend/public/data/` → React + Vite + Recharts.

```bash
PYTHONPATH=src uv run python -c "from assets.fred import save_fred_parquet; save_fred_parquet()"
PYTHONPATH=src uv run python -c "from assets.ameco import save_ameco_parquet; save_ameco_parquet()"
PYTHONPATH=src uv run python -c "from assets.daily_yields import save_daily_parquet; print(save_daily_parquet())"
PYTHONPATH=src uv run python -c "from assets.swedish_data import save_svea_parquet; save_svea_parquet()"
PYTHONPATH=src uv run python -c "from assets.yfinance import save_yfinance_parquet; save_yfinance_parquet()"
PYTHONPATH=src uv run python -c "from assets.cftc import save_cot_parquet; save_cot_parquet()"
PYTHONPATH=src uv run python -c "from assets.sec import save_sec_parquet; save_sec_parquet()"
uv run python scripts/build_data.py          # all themes, or e.g. `... build_data.py se_rates`
cd frontend && npm install && npm run dev
```

Landing page (`frontend/src/sections/HomePage.jsx`, default route, brand click): background video `frontend/public/media/hero.mp4` + desk cards.
Pages (tabs, F1/F2…): **Rates** (`frontend/src/sections/RatesPage.jsx`), one scrolling page:
overview tiles + levels/changes/range table (Sweden, euro area 10Y, US) → weekly development → curve analysis
(government bonds vs chosen dates: Sweden SGB, US Treasuries)
→ CFTC positioning (UST 2Y/10Y) → EGB relative value → Swedish term premium (ACM).
Data: `se_rates.json`, `egb.json`, `us_rates.json`, `curves.json` (`build_se_rates`, `build_egb`, `build_us_rates`, `build_curves`).
**FX & Commodities** (`frontend/src/sections/FxPage.jsx`, F2, data `fx.json` from `build_fx`, model `src/models/fx.py`):
overview tiles + levels/% changes/range table → weekly development → G10 cross matrix → SEK vs PPP → CFTC positioning (JPY, EUR).

- FX: Riksbank fixings (`SEK{CCY}PMI`, SEK per unit). EUR/USD and USD/JPY are crosses of the SEK fixings.
- Commodities: yfinance front-month futures (Brent `BZ=F`, WTI `CL=F`, gold `GC=F`, silver `SI=F`, copper `HG=F`).
- G10 matrix: cell (row, col) = units of col per 1 row; % change > 0 = row currency stronger. Avg = row vs the other nine.
- SEK PPP (relative): fair CCY/SEK = base spot · (CPI_SE / base) / (CPI_F / base), base 2000–2009 (`fx.BASE`).
  Valuation = −(spot / fair − 1), as Bloomberg SEK PPP % over/undervalued: < 0 = SEK undervalued. CPI: HICP (SE, EA, NO), CPI-U (US) via FRED.

### CFTC positioning (`src/assets/cftc.py`, `src/models/cot.py`, `frontend/src/sections/CotSection.jsx`)

Traders in Financial Futures (TFF), futures only, Socrata dataset `gpe5-46if` on publicreporting.cftc.gov (no key).
Plus non-commercials from the Legacy report, futures only (`6dca-aqww`), joined on date × contract (same OI;
spreading excluded, net = long − short). Contracts in `COT_CONTRACTS`
(`src/utils/series.py`): UST 2Y `042601`, UST 10Y `043602`, JPY `097741`, EUR `099741`.

- Gross long, short and net per group (non-commercials, leveraged funds, asset managers, dealers, other reportables, non-reportables);
  % OI, z-score and percentile vs the last 156 weeks; 1W change in gross long and short.
- Views: net of a chosen group vs the front-month future (`COT_FUTURES`, yfinance: ZT=F, ZN=F, 6J=F, 6E=F) with
  3Y mean ± 2σ bands; gross long/short; net of all groups. Units k contracts or % OI, weekly or 4W MA.
- FX futures are USD per unit of the currency: JPY is shown as USD/JPY on an inverted axis (net long yen = short
  USD/JPY); EUR future = EUR/USD. Positions as of Tuesday, published Friday.
- Data `cot.json` (`build_cot`), shown on Rates (UST) and FX (JPY, EUR). Add a contract: its code in
  `COT_CONTRACTS`, its future in `COT_FUTURES`, price label in `cot.PRICE`, label in a page's `<CotSection contracts={[...]} />`.

### Equity (`frontend/src/sections/EquityPage.jsx`, F3, data `equity.json` from `build_equity`, model `src/models/equity.py`)

Overview tiles + levels/% changes/range table by region → weekly development rebased to 100 (US, Europe, Asia,
global; YTD–10Y) → hyperscalers vs semiconductors.

- Indices: yfinance daily closes, local currency (`equity.INDICES`: ticker, label, region). DAX is a total return index.
- Fundamentals: SEC EDGAR XBRL company facts (`src/assets/sec.py`, data.sec.gov, no key; env `SEC_USER_AGENT`
  = "Name email" required, SEC answers 403 without it; repo secret of the same name for the workflow). Companies and baskets in `SEC_COMPANIES`, us-gaap tag candidates in `SEC_TAGS` (`src/utils/series.py`).
  Net income, operating cash flow, capex (purchases of PP&E); FCF = OCF − capex.
- Discrete quarters from as-filed 3M/YTD facts (cash flow is YTD only: Q = diff of consecutive YTD with the same start),
  TTM = last 4 quarters, mapped to the calendar quarter of the fiscal quarter's midpoint. Basket = sum of TTM over
  members, only quarters where all members have reported. US filers only (TSMC, ASML file 20-F/6-K).
- Indices build without `sec_facts.parquet`; the fundamentals block then shows a hint.

Add a page (Macro): `build_<theme>()` in `scripts/build_data.py` + a component in `frontend/src/sections/` registered in `THEMES` in `App.jsx`.

### Swedish term premium (ACM 2013, `src/models/acm.py`)

Month-end SWEA T-bills 1M/3M/6M + SGB 2Y/5Y/7Y/10Y, PCHIP to a 1–120 month grid, factors = 3 yield PCs.
VAR(1) on factors → excess returns (3M…10Y) on innovations + lagged factors → prices of risk.
Term premium = model yield − risk-neutral yield (λ = 0). 1M T-bill (`SETB1MBENCHC`) gaps filled with the policy rate.

### EGB relative value model (daily cross-section)

`spread_i (bp vs Bund) = a + b · debt_i [+ c · tds_i] + e_i` — one OLS per day across countries ex Germany.

- Yields: daily 10Y only (`src/data/egb_daily.parquet`): DE, FI, FR, NL from Riksbank SWEA (`{CC}GVB10Y`,
  `RIKSBANK_API_KEY` in `.env`), IT (BTP 10Y) from Banca d'Italia (`MFN_BMK.D.020.922.0.EUR.210`),
  ES (Bono 10Y) from Banco de España (`D_G0B1F0ZP`), BE from the National Bank of Belgium
  (`BE2,DF_IROLOYLD` — long-term yield of the reference loans, 11am).
- Unbalanced panel: a country enters when its series starts; the spread is measured on the country's own obs date
  and carried forward up to 10 business days (`MAX_GAP`), Belgium up to 90 (`LAGGING`: NBB publishes with up to a
  quarter's lag, shown as stale). The snapshot uses the latest date with the full recent cross-section.
- Fundamentals: AMECO levels (% GDP) of the last full year, used from 120 days after year-end (`LAG_DAYS`).
  TDS (twin deficit score) = −(budget balance + current account) / 2.
- Regressors scale with the cross-section: debt + TDS from 8 countries (`MIN_N_TWO_FACTORS`), debt only below.
  With 5 countries two factors leave 2 degrees of freedom and an extreme country (Netherlands, lowest TDS)
  dominates the fit.
- Residual > 0 = cheap (above the 45° line). z cross-sec. = residual / regression σ (signal at |z| > 1);
  z 104w = residual vs its own 104-week history.
- LOO (robustness): each country priced off a fit on the other countries only.
- Caveat: AMECO is the latest vintage, so the backtest has look-ahead.

### Deploy (GitHub Pages)

`.github/workflows/daily.yml` runs daily at 05:00 UTC (and on push to `main` / manually): fetches FRED, AMECO and
daily yields (last good data cached in Actions), builds the frontend and deploys to Pages. A failing source keeps its last data.
Setup: Settings → Pages → Source: *GitHub Actions*; Settings → Secrets → Actions: `FRED_API_KEY`, `RIKSBANK_API_KEY`.
