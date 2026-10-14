import marimo

__generated_with = "0.25.1"
app = marimo.App(width="medium")


@app.cell
def _():
    import marimo as mo
    import polars as pl
    from utils.series import FRED_SERIES
    import altair as alt
    from datetime import date, timedelta

    return FRED_SERIES, alt, date, mo, pl


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
    return NOMINAL, TIPS


@app.cell
def _(NOMINAL, TIPS, df, pl):
    rates = (
        df
        .filter(
            pl.col("series_id").is_in(
                list(NOMINAL.keys()) + list(TIPS.keys())
            ),
            pl.col("value").is_not_null(),
        )
        .sort(["series_id", "date"])
        .group_by("series_id")
        .agg(
            pl.col("value").last().alias("current"),
            pl.col("value").tail(2).first().alias("previous"),
            pl.col("date").last().alias("date"),
        )
        .with_columns(
            ((pl.col("current") - pl.col("previous")) * 100)
            .round(1)
            .alias("delta_bp")
        )
    )
    return (rates,)


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

    return (make_rate_stats,)


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

    return (make_grid,)


@app.cell
def _(NOMINAL, TIPS, df, make_grid, make_rate_stats, mo, rates):
    mo.vstack(
        [
            mo.md("# US Fixed Income Monitor"),

            mo.md("## Treasury Yields"),

            make_rate_stats(rates, NOMINAL),

            make_rate_stats(rates, TIPS),

            make_grid(df, NOMINAL),

            make_grid(df, TIPS),
        ],
        gap=3,
    )
    return


@app.cell
def _(date, mo):
    curve_date = mo.ui.date(
        value=date.today(),
        label="Comparison date",
    )

    curve_type = mo.ui.dropdown(
        options=["Nominal", "TIPS"],
        value="Nominal",
        label="Yield Curve Type",
    )
    return curve_date, curve_type


@app.cell
def _(curve_type, df, pl):
    CURVE_SERIES = {
        "Nominal": {
            "DGS2": 2,
            "DGS5": 5,
            "DGS7": 7,
            "DGS10": 10,
            "DGS30": 30,
        },
        "TIPS": {
            "DFII5": 5,
            "DFII7": 7,
            "DFII10": 10,
            "DFII30": 30,
        },
    }

    selected_series = CURVE_SERIES[curve_type.value]

    curve_data = (
        df
        .filter(
            pl.col("series_id").is_in(list(selected_series.keys())),
            pl.col("value").is_not_null(),
        )
        .with_columns(
            pl.col("series_id")
            .replace_strict(selected_series)
            .cast(pl.Int64)
            .alias("maturity")
        )
        .select("date", "maturity", "value")
        .sort(["date", "maturity"])
    )
    return curve_data, selected_series


@app.cell
def _(curve_data, curve_date, pl):
    latest_date = curve_data["date"].max()

    current_curve = (
        curve_data
        .filter(pl.col("date") <= latest_date)
        .sort("date")
        .group_by("maturity")
        .tail(1)
        .with_columns(
            pl.lit("Current").alias("curve")
        )
    )

    comparison_curve = (
        curve_data
        .filter(pl.col("date") <= curve_date.value)
        .sort("date")
        .group_by("maturity")
        .tail(1)
        .with_columns(
            pl.lit("Comparison").alias("curve")
        )
    )

    yield_curves = pl.concat(
        [current_curve, comparison_curve]
    ).sort(["curve", "maturity"])
    return (yield_curves,)


@app.cell
def _(alt, curve_type, selected_series, yield_curves):
    yield_curve_chart = (
        alt.Chart(yield_curves)
        .mark_line(point=True, strokeWidth=3)
        .encode(
            x=alt.X(
                "maturity:Q",
                title="Maturity (Years)",
                scale=alt.Scale(zero=False),
                axis=alt.Axis(
                    values=list(selected_series.values())
                ),
            ),
            y=alt.Y(
                "value:Q",
                title="Yield (%)",
                scale=alt.Scale(zero=False),
            ),
            color=alt.Color(
                "curve:N",
                title="Yield Curve",
            ),
            tooltip=[
                alt.Tooltip("curve:N", title="Curve"),
                alt.Tooltip("maturity:Q", title="Maturity (Years)"),
                alt.Tooltip("value:Q", title="Yield (%)", format=".2f"),
                alt.Tooltip("date:T", title="Observation Date"),
            ],
        )
        .properties(
            width=700,
            height=400,
            title=f"US Treasury Yield Curve – {curve_type.value}",
        )
    )
    return (yield_curve_chart,)


@app.cell
def _(curve_date, curve_type, mo, yield_curve_chart):
    mo.vstack(
        [
            mo.md("## Yield Curve Analysis"),

            mo.hstack(
                [curve_type, curve_date],
                justify="start",
                gap=2,
            ),

            yield_curve_chart,
        ],
        gap=3,
    )
    return


if __name__ == "__main__":
    app.run()
