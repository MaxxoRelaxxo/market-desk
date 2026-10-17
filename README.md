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
uv run python scripts/build_data.py          # all themes, or e.g. `... build_data.py se_rates`
cd frontend && npm install && npm run dev
```

Pages (tabs, F1/F2…): **Rates** (`frontend/src/sections/RatesPage.jsx`), one scrolling page:
overview tiles + levels/changes/range table (SE, US, euro area 10Y) → weekly development → curve analysis
(SGB / UST / TIPS vs chosen dates) → EGB relative value → Swedish term premium (ACM).
Data: `us_rates.json`, `egb.json`, `se_rates.json` (`build_us_rates`, `build_egb`, `build_se_rates`).
Add a page (FX, Macro): `build_<theme>()` in `scripts/build_data.py` + a component in `frontend/src/sections/` registered in `THEMES` in `App.jsx`.

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
- Unbalanced panel: a country enters when its series starts; the snapshot uses the latest date with the full
  recent cross-section, so a lagging source (Banca d'Italia) does not drop a country from the table.
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
