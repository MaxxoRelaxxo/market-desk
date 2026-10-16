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

### EGB spread model (daily)

`spread_it (bp vs Bund) = FE_t + b_t · [debt, fiscal, ca]_it + e_it`

- Yields: daily 10Y only (`src/data/egb_daily.parquet`), from Riksbank SWEA (series auto-discovered via `/Series`,
  optional `RIKSBANK_API_KEY` in `.env`) and BTP 10Y from Banca d'Italia (`MFN_BMK.D.020.922.0.EUR.210`).
  Only countries with a daily source are in the model; the sample starts when all of them have data.
- Fundamentals from AMECO as difference vs Germany, 12M-forward blend (month m weights m/12 on next year).
- Rolling 3Y (756 business days) pooled OLS with daily fixed effects → pure cross-country relative value.
  Betas are pooled (one regression across all countries, not per country / not LOO).
- Residual > 0 = cheap (above the 45° line). z = residual / the country's own 3Y residual vol; signal at |z| > 1.
- Needs more than 4 countries incl. Germany (3 factors).
- Caveat: AMECO is the latest vintage, so the backtest has look-ahead.
