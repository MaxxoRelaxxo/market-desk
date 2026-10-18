import marimo

__generated_with = "0.25.1"
app = marimo.App(width="medium")


@app.cell
def _():
    import marimo as mo
    import polars as pl
    import altair as alt

    return alt, pl


@app.cell
def _():
    YFINANCE_NAMES = {
        # Equity indices
        "^GSPC": "S&P 500",
        "^DJI": "Dow Jones Industrial Average",
        "^NDX": "NASDAQ 100",
        "^RUT": "Russell 2000",
        "^VIX": "VIX",
        "^OMX": "OMX Stockholm 30",
        "^STOXX50E": "EURO STOXX 50",
        "^N225": "Nikkei 225",
        "^HSI": "Hang Seng Index",
        "^KS11": "KOSPI Composite",
        "^KQ11": "KOSDAQ Composite",

        # Energy futures
        "CL=F": "WTI Crude Oil Futures",
        "BZ=F": "Brent Crude Oil Futures",
        "NG=F": "Natural Gas Futures",
        "HO=F": "Heating Oil Futures",

        # Metal futures
        "GC=F": "Gold Futures",
        "SI=F": "Silver Futures",
        "HG=F": "Copper Futures",
        "PL=F": "Platinum Futures",
        "PA=F": "Palladium Futures",

        # SOFR futures
        "SR3Z26.CME": "3-Month SOFR Futures - Dec 2026",
        "SR3H27.CME": "3-Month SOFR Futures - Mar 2027",
        "SR3M27.CME": "3-Month SOFR Futures - Jun 2027",
        "SR3U27.CME": "3-Month SOFR Futures - Sep 2027",
        "SR3Z27.CME": "3-Month SOFR Futures - Dec 2027",
        "SR3H28.CME": "3-Month SOFR Futures - Mar 2028",
        "SR3M28.CME": "3-Month SOFR Futures - Jun 2028",
        "SR3U28.CME": "3-Month SOFR Futures - Sep 2028",
        "SR3Z28.CME": "3-Month SOFR Futures - Dec 2028",
    }
    return (YFINANCE_NAMES,)


@app.cell
def _(YFINANCE_NAMES, pl):
    yfinance = (
        pl.read_parquet("src/data/market_data.parquet")
        .with_columns(
            pl.col("series_id").replace(YFINANCE_NAMES).alias("series"),
            pl.when(pl.col("series_id").str.starts_with("SR3"))
            .then(100 - pl.col("value"))
            .otherwise(pl.col("value"))
            .alias("value"),
        )
    )
    yfinance
    return (yfinance,)


@app.cell
def _():
    fx_dict = {
        "SEKAUDPMI" : "AUD/SEK",
        "SEKCADPMI" : "CAD/SEK",
        "SEKUSDPMI" : "USD/SEK",
        "SEKEURPMI" : "EUR/SEK",
        "SEKNOKPMI" : "NOK/SEK",
        "SEKCHFPMI" : "CHF/SEK",
        "SEKNZDPMI" : "NZD/SEK",
        "SEKGBPPMI" : "GBP/SEK",
        "SEKJPYPMI" : "JPY/SEK",
        "SEKKIX92" : "KIX-index"
    }
    return (fx_dict,)


@app.cell
def _(fx_dict, pl):
    fx = (
        pl.read_parquet("src/data/svea_series.parquet")
        .filter(
            pl.col("series_id").is_in([
                "SEKAUDPMI",
                "SEKCADPMI",
                "SEKUSDPMI",
                "SEKEURPMI",
                "SEKNOKPMI",
                "SEKCHFPMI",
                "SEKNZDPMI",
                "SEKGBPPMI",
                "SEKJPYPMI",
                "SEKKIX92",
            ])
        )
        .with_columns(
            pl.col("series_id").replace(fx_dict).alias("series")
        )
        .select(pl.exclude("source"))
    )
    fx
    return (fx,)


@app.cell
def _(fx, pl, yfinance):
    df = pl.concat([yfinance, fx])
    df
    return (df,)


@app.cell
def _(alt, df, pl):
    # --------------------------------------------------
    # 1. FX – dagliga logavkastningar
    # --------------------------------------------------

    fx_returns = (
        df
        .filter(pl.col("series_id").str.starts_with("SEK"))
        .sort(["series_id", "date"])
        .with_columns(
            pl.col("value").log().diff().over("series_id").alias("ret")
        )
        .select("date", "series_id", "ret")
        .pivot(on="series_id", index="date", values="ret")
        .sort("date")
    )

    fx_cols = [c for c in fx_returns.columns if c != "date"]

    # --------------------------------------------------
    # 2. G10 Index – likaviktat, bas 100
    # --------------------------------------------------

    sek = (
        fx_returns
        .drop_nulls(subset=fx_cols)
        .with_columns(
            pl.mean_horizontal(fx_cols).alias("g10_return")
        )
        .with_columns(
            (
                100 * (
                    pl.col("g10_return").cum_sum()
                    - pl.col("g10_return").first()
                ).exp()
            ).alias("G10")
        )
        .select("date", "G10")
    )

    # --------------------------------------------------
    # 3. KIX – endast benchmark
    # --------------------------------------------------

    kix = (
        df
        .filter(pl.col("series") == "KIX-index")
        .select("date", "value")
        .sort("date")
    )

    # --------------------------------------------------
    # 4. Normalisera till gemensam startpunkt
    # --------------------------------------------------

    comparison = (
        sek
        .join(kix, on="date", how="inner")
        .sort("date")
        .with_columns(
            (100 * pl.col("G10") / pl.col("G10").first()).alias("G10"),
            (100 * pl.col("value") / pl.col("value").first()).alias("KIX"),
        )
        .select("date", "G10", "KIX")
        .unpivot(
            index="date",
            variable_name="index",
            value_name="value",
        )
    )

    # --------------------------------------------------
    # 5. Altair
    # --------------------------------------------------

    chart = (
        alt.Chart(comparison)
        .mark_line()
        .encode(
            x=alt.X("date:T", title=None),
            y=alt.Y(
                "value:Q",
                title="Index (100 = start)",
                scale=alt.Scale(zero=False),
            ),
            color=alt.Color("index:N", title=None),
            tooltip=[
                alt.Tooltip("date:T", title="Datum"),
                alt.Tooltip("index:N", title="Index"),
                alt.Tooltip("value:Q", title="Värde", format=".2f"),
            ],
        )
        .properties(
            title="SEK – G10 vs KIX",
            width=800,
            height=400,
        )
        .interactive()
    )

    chart
    return


if __name__ == "__main__":
    app.run()
