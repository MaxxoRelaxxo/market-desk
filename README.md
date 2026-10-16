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
uv run python scripts/build_data.py          # all themes, or e.g. `... build_data.py egb`
cd frontend && npm install && npm run dev
```

Themes (tabs, F1/F2…): **EGB Spreads** (`src/models/egb.py`) and **US Rates**.
Add a theme: one `build_<theme>()` in `scripts/build_data.py` + one component in `frontend/src/sections/` registered in `THEMES` in `App.jsx`.

### EGB spread model

`spread_it (bp vs Bund) = FE_t + b_t · [debt, fiscal, ca]_it + e_it`

- Fundamentals from AMECO as difference vs Germany, 12M-forward blend (month m weights m/12 on next year).
- Rolling 36M pooled OLS with month fixed effects → pure cross-country relative value.
- Residual > 0 = cheap vs fundamentals. Signal on residual z-score vs own 3Y history (|z| > 1).
- Caveat: AMECO is latest vintage, so the backtest has look-ahead.
