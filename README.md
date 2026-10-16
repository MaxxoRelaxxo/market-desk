# market-desk

To run in terminal:
PYTHONPATH=src uv run python -c "from assets.fred import save_fred_parquet; print(save_fred_parquet())"

PYTHONPATH=src uv run python -c "from assets.ameco import inspect_ameco; print(inspect_ameco('ameco_chapter18-01'))"
PYTHONPATH=src uv run python -c "from assets.ameco import inspect_ameco; print(inspect_ameco('ameco_chapter16-03'))"
PYTHONPATH=src uv run python -c "from assets.ameco import inspect_ameco; print(inspect_ameco('ameco_chapter10-01'))"


To start Marimo:
uv run marimo edit src/notebooks/fred.py

## Market Desk (frontend)

Same structure as markets-data-hub: Python/Polars → `scripts/build_data.py` → JSON in `frontend/public/data/` → React + Vite + Recharts.

```bash
PYTHONPATH=src uv run python -c "from assets.fred import save_fred_parquet; save_fred_parquet()"
PYTHONPATH=src uv run python -c "from assets.ameco import save_ameco_parquet; save_ameco_parquet()"
PYTHONPATH=src uv run python -c "from assets.daily_yields import save_daily_parquet; print(save_daily_parquet())"
uv run python scripts/build_data.py          # all themes, or e.g. `... build_data.py egb`
cd frontend && npm install && npm run dev
```

Themes (tabs, F1/F2…): **EGB Spreads** (`src/models/egb.py`) and **US Rates**.
Add a theme: one `build_<theme>()` in `scripts/build_data.py` + one component in `frontend/src/sections/` registered in `THEMES` in `App.jsx`.

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
