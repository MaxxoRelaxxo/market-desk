import marimo

__generated_with = "0.25.1"
app = marimo.App(width="medium")


@app.cell
def _():
    import marimo as mo
    import polars as pl
    import altair as alt
    from datetime import date, timedelta

    import importlib
    import utils.series

    importlib.reload(utils.series)

    FRED_SERIES = utils.series.FRED_SERIES
    return FRED_SERIES, alt, mo, pl


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
        .select([
            "date",
            "category",
            "name",
            "value",
            "series_id"
        ])
    )
    return (df,)


@app.cell
def _():
    NOMINAL = {
        "DGS2": "US 2Y",
        "DGS5": "US 5Y",
        "DGS7": "US 7Y",
        "DGS10": "US 10Y",
        "DGS30": "US 30Y",
    }

    TIPS = {
        "DFII5": "US 5Y TIPS",
        "DFII7": "US 7Y TIPS",
        "DFII10": "US 10Y TIPS",
        "DFII30": "US 30Y TIPS",
    }
    return


@app.cell
def _():
    # rates = (
    #     df
    #     .filter(
    #         pl.col("series_id").is_in(
    #             list(NOMINAL.keys()) + list(TIPS.keys())
    #         ),
    #         pl.col("value").is_not_null(),
    #     )
    #     .sort(["series_id", "date"])
    #     .group_by("series_id")
    #     .agg(
    #         pl.col("value").last().alias("current"),
    #         pl.col("value").tail(2).first().alias("previous"),
    #         pl.col("date").last().alias("date"),
    #     )
    #     .with_columns(
    #         ((pl.col("current") - pl.col("previous")) * 100)
    #         .round(1)
    #         .alias("delta_bp")
    #     )
    # )
    return


@app.cell
def _(mo, pl):
    def make_rate_stats(rates, series):
        cards = []

        for series_id, name in series.items():
            row = rates.filter(
                pl.col("series_id") == series_id
            )

            if row.is_empty():
                continue

            current = row["current"][0]
            delta = row["delta_bp"][0]

            cards.append(
                mo.stat(
                    label=name,
                    value=f"{current:.2f}%",
                    caption=(
                        f"{delta:+.1f} bp"
                        if delta is not None
                        else "N/A"
                    ),
                )
            )

        return mo.hstack(
            cards,
            justify="start",
            gap=2,
            widths="equal",
        )

    return


@app.cell
def _(alt, pl):
    def make_rate_chart(df, series_id, title):
        data = (
            df
            .filter(
                pl.col("series_id") == series_id,
                pl.col("value").is_not_null(),
            )
            .sort("date")
        )

        # Max 500 datapunkter per graf
        if data.height > 500:
            step = max(1, data.height // 500)

            data = data.with_row_index("idx").filter(
                pl.col("idx") % step == 0
            )

        return (
            alt.Chart(data)
            .mark_line(strokeWidth=2)
            .encode(
                x=alt.X("date:T", title=None),
                y=alt.Y(
                    "value:Q",
                    title="Yield (%)",
                    scale=alt.Scale(zero=False),
                ),
                tooltip=[
                    alt.Tooltip("date:T", title="Date", format="%Y-%m-%d"),
                    alt.Tooltip("value:Q", title="Yield (%)", format=".2f"),
                ],
            )
            .properties(
                title=title,
                width=300,
                height=180,
            )
        )

    return (make_rate_chart,)


@app.cell
def _(alt, make_rate_chart):
    def make_grid(df, series, columns=2):
        charts = [
            make_rate_chart(df, series_id, title)
            for series_id, title in series.items()
        ]

        rows = [
            alt.hconcat(*charts[i:i + columns])
            for i in range(0, len(charts), columns)
        ]

        return (
            alt.vconcat(*rows)
            .resolve_scale(y="independent")
            .configure_view(stroke=None)
        )

    return


@app.cell
def _():
    # mo.vstack(
    #     [
    #         mo.md("# US Fixed Income Monitor"),

    #         mo.md("## Treasury Yields"),

    #         make_rate_stats(rates, NOMINAL),

    #         make_rate_stats(rates, TIPS),

    #         make_grid(df, NOMINAL),

    #         make_grid(df, TIPS),
    #     ],
    #     gap=3,
    # )
    return


@app.cell
def _():
    # curve_date = mo.ui.date(
    #     value=date.today(),
    #     label="Comparison date",
    # )

    # curve_type = mo.ui.dropdown(
    #     options=["Nominal", "TIPS"],
    #     value="Nominal",
    #     label="Yield Curve Type",
    # )
    return


@app.cell
def _():
    # CURVE_SERIES = {
    #     "Nominal": {
    #         "DGS2": 2,
    #         "DGS5": 5,
    #         "DGS7": 7,
    #         "DGS10": 10,
    #         "DGS30": 30,
    #     },
    #     "TIPS": {
    #         "DFII5": 5,
    #         "DFII7": 7,
    #         "DFII10": 10,
    #         "DFII30": 30,
    #     },
    # }

    # selected_series = CURVE_SERIES[curve_type.value]

    # curve_data = (
    #     df
    #     .filter(
    #         pl.col("series_id").is_in(list(selected_series.keys())),
    #         pl.col("value").is_not_null(),
    #     )
    #     .with_columns(
    #         pl.col("series_id")
    #         .replace_strict(selected_series)
    #         .cast(pl.Int64)
    #         .alias("maturity")
    #     )
    #     .select("date", "maturity", "value")
    #     .sort(["date", "maturity"])
    # )
    return


@app.cell
def _():
    # latest_date = curve_data["date"].max()

    # current_curve = (
    #     curve_data
    #     .filter(pl.col("date") <= latest_date)
    #     .sort("date")
    #     .group_by("maturity")
    #     .tail(1)
    #     .with_columns(
    #         pl.lit("Current").alias("curve")
    #     )
    # )

    # comparison_curve = (
    #     curve_data
    #     .filter(pl.col("date") <= curve_date.value)
    #     .sort("date")
    #     .group_by("maturity")
    #     .tail(1)
    #     .with_columns(
    #         pl.lit("Comparison").alias("curve")
    #     )
    # )

    # yield_curves = pl.concat(
    #     [current_curve, comparison_curve]
    # ).sort(["curve", "maturity"])
    return


@app.cell
def _():
    # yield_curve_chart = (
    #     alt.Chart(yield_curves)
    #     .mark_line(point=True, strokeWidth=3)
    #     .encode(
    #         x=alt.X(
    #             "maturity:Q",
    #             title="Maturity (Years)",
    #             scale=alt.Scale(zero=False),
    #             axis=alt.Axis(
    #                 values=list(selected_series.values())
    #             ),
    #         ),
    #         y=alt.Y(
    #             "value:Q",
    #             title="Yield (%)",
    #             scale=alt.Scale(zero=False),
    #         ),
    #         color=alt.Color(
    #             "curve:N",
    #             title="Yield Curve",
    #         ),
    #         tooltip=[
    #             alt.Tooltip("curve:N", title="Curve"),
    #             alt.Tooltip("maturity:Q", title="Maturity (Years)"),
    #             alt.Tooltip("value:Q", title="Yield (%)", format=".2f"),
    #             alt.Tooltip("date:T", title="Observation Date"),
    #         ],
    #     )
    #     .properties(
    #         width=700,
    #         height=400,
    #         title=f"US Treasury Yield Curve – {curve_type.value}",
    #     )
    # )
    return


@app.cell
def _():
    # mo.vstack(
    #     [
    #         mo.md("## Yield Curve Analysis"),

    #         mo.hstack(
    #             [curve_type, curve_date],
    #             justify="start",
    #             gap=2,
    #         ),

    #         yield_curve_chart,
    #     ],
    #     gap=3,
    # )
    return


@app.cell
def _(pl):
    ### Sweden data ###
    svea_dict = {
        "SEKAUDPMI" : "AUD/SEK",
        "SEKCADPMI" : "CAD/SEK",
        "SEKUSDPMI" : "USD/SEK",
        "SEKEURPMI" : "EUR/SEK",
        "SEKNOKPMI" : "NOK/SEK",
        "SEKCHFPMI" : "CHF/SEK",
        "SEKNZDPMI" : "NZD/SEK",
        "SEKGBPPMI" : "GBP/SEK",
        "SEKJPYPMI" : "JPY/SEK",
        "SEKHKDPMI" : "HKD/SEK",
        "SECBREPOEFF" : "Policy Rate",
        "SEGVB2YC" : "Swedish Government Bond 2Y",
        "SEGVB5YC" : "Swedish Government Bond 5Y",
        "SEGVB7YC" : "Swedish Government Bond 7Y",
        "SEGVB10YC" : "Swedish Government Bond 10Y",
        "SEKKIX92" : "KIX-index",
        "SETB1MBENCHC" : "Swedish Treasury Bill maturity 1m",
        "SETB3MBENCH" : "Swedish Treasury Bill maturity 3m",
        "SETB6MBENCH" : "Swedish Treasury Bill maturity 6m",
        "SETB12MBENCH" : "Swedish Treasury Bill maturity 1y",
    }

    s, v = pl.col("series"), pl.col("value")

    def add_spread(df: pl.DataFrame) -> pl.DataFrame:
        spread = (
            df.group_by("date")
            .agg((
                (v.filter(s == "Swedish Government Bond 10Y").first()
                 - v.filter(s == "Swedish Government Bond 2Y").first()).alias("value")
            ) * 100)
            .drop_nulls()
            .with_columns(
                series_id=pl.lit("SGB10Y2Y"),
                source=pl.lit("calc"),
                series=pl.lit("SGB Spread 10Y-2Y"),
            )
            .select(df.columns)
        )
        return pl.concat([df, spread])

    svea = (
        pl.read_parquet("src/data/svea_series.parquet")
        .with_columns(pl.col.series_id.replace(svea_dict).alias("series"))
        .pipe(add_spread)
        .sort("series", "date")
    )
    svea
    return (svea,)


@app.cell
def _(pl, svea):
    fx_curr = (
        svea.filter(
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
                "SEKHKDPMI",
            ])
        )
    )
    fx_curr
    return


@app.cell
def _(pl, svea):
    currencies = [
        "USD", "EUR", "JPY", "GBP", "CHF",
        "CAD", "AUD", "NZD", "HKD", "NOK", "SEK"
    ]

    fx = (
        svea
        .filter(
            pl.col("series_id").is_in(
                [f"SEK{c}PMI" for c in currencies if c != "SEK"]
            )
        )
        .select(
            "date",
            pl.col("series_id").str.slice(3, 3).alias("currency"),
            "value"
        )
        .pivot(on="currency", index="date", values="value")
        .sort("date")
        .drop_nulls()
    )

    latest = fx.tail(1)

    rates = {
        c: latest[c][0]
        for c in currencies if c != "SEK"
    }
    rates["SEK"] = 1.0

    matrix = pl.DataFrame({
        "currency": currencies,
        **{
            base: [
                rates[base] / rates[quote]
                for quote in currencies
            ]
            for base in currencies
        }
    })

    matrix
    return currencies, fx


@app.cell
def _(df):
    df
    return


@app.cell
def _(fx):
    fx
    return


@app.cell
def _(df, pl):
    inflation = (
        df
        .filter(
            pl.col("category") == "inflation"
        )
        .pivot(
            index="date",
            on="name",
            values="value"
        )
    )
    inflation
    return (inflation,)


@app.cell
def _(currencies, fx, inflation, pl):
    g10 = [c for c in currencies if c != "HKD"]

    cpi_names = {
        "USD": "US Consumer Price Index",
        "EUR": "Euro Area Harmonised Consumer Price Index",
        "JPY": "Japan Consumer Price Index",
        "GBP": "UK Consumer Price Index",
        "CHF": "Switzerland Consumer Price Index",
        "CAD": "Canada Consumer Price Index",
        "AUD": "Australia Consumer Price Index",
        "NZD": "New Zealand Consumer Price Index",
        "NOK": "Norway Consumer Price Index",
        "SEK": "Sweden Consumer Price Index",
    }

    # Dagliga valutakurser till månadsgenomsnitt
    spot = (
        fx
        .group_by_dynamic("date", every="1mo")
        .agg(
            pl.col([c for c in g10 if c != "SEK"]).mean()
        )
        .sort("date")
    )

    foreign = ["USD", "EUR", "NOK"]

    cpi = (
        inflation
        .select(
            "date",
            pl.col("US Consumer Price Index").alias("USD_cpi"),
            pl.col("Euro Area Harmonised Consumer Price Index").alias("EUR_cpi"),
            pl.col("Norway Consumer Price Index").alias("NOK_cpi"),
            pl.col("Sweden Consumer Price Index").alias("SEK_cpi"),
        )
        .sort("date")
        .with_columns(pl.exclude("date").forward_fill())
    )

    daily = (
        fx.select("date", *foreign)
        .sort("date")
        .join_asof(cpi, on="date", strategy="backward")
    )

    base = daily.filter(
        pl.col("date").is_between(pl.date(2000, 1, 1), pl.date(2009, 12, 31))
    )

    spot_mean = {c: base[c].mean() for c in foreign}
    cpi_mean = {c: base[f"{c}_cpi"].mean() for c in foreign + ["SEK"]}

    valuation = (
        daily
        .select(
            "date",
            *[
                (
                    (
                        pl.col(c)
                        /
                        (
                            pl.lit(spot_mean[c])
                            * (pl.col("SEK_cpi") / cpi_mean["SEK"])
                            / (pl.col(f"{c}_cpi") / cpi_mean[c])
                        )
                        - 1
                    ) * -100
                ).alias(c)
                for c in foreign
            ]
        )
        .drop_nulls()
    )

    valuation
    return


if __name__ == "__main__":
    app.run()
