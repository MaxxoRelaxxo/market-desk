import marimo

__generated_with = "0.25.1"
app = marimo.App(width="medium")


@app.cell
def _():
    import marimo as mo
    import polars as pl
    from utils.series import FRED_SERIES

    return FRED_SERIES, pl


@app.cell
def _(FRED_SERIES, pl):
    FRED_MAPPING = pl.DataFrame(
        [
            {
                "category": category,
                "name": name,
                "series_id": series_id,
            }
            for category, series in FRED_SERIES.items()
            for name, series_id in series.items()
        ]
    )
    FRED_MAPPING
    return (FRED_MAPPING,)


@app.cell
def _(FRED_MAPPING, pl):
    df = (
        pl.read_parquet("src/data/us_rates.parquet")
        .join(
            FRED_MAPPING,
            on="series_id",
            how="left"
        )
    )
    df
    return


if __name__ == "__main__":
    app.run()
