# FRED data
SERIES = {
    "nominal": {
        "2Y": "DGS2",
        "5Y": "DGS5",
        "7Y": "DGS7",
        "10Y": "DGS10",
        "30Y": "DGS30",
    },
    "tips": {
        "5Y": "DFII5",
        "7Y": "DFII7",
        "10Y": "DFII10",
        "30Y": "DFII30",
    },
    "policy": {
        "fed_funds": "DFF",
        "sofr": "SOFR",
    },
    "credit": {
        "ig_oas": "BAMLC0A0CM",
        "hy_oas": "BAMLH0A0HYM2",
    },
    "breakeven": {
        "5Y": "T5YIE",
        "10Y": "T10YIE",
        "30Y": "T30YIEM",
    },
    "forward_inflation": {
        "5Y5Y": "T5YIFR",
    },
    "spreads": {
        "10Y2Y": "T10Y2Y",
        "10Y3M": "T10Y3M",
    },
    "mortgage": {
        "30Y": "MORTGAGE30US",
    },
}

def fetch_fred(
    series_id: str,
    start: str = "2000-01-01",
) -> pl.DataFrame:

    params = {
        "series_id": series_id,
        "api_key": API_KEY,
        "file_type": "json",
        "observation_start": start,
    }

    response = requests.get(
        BASE_URL,
        params=params,
        timeout=30,
    )
    response.raise_for_status()

    observations = response.json()["observations"]

    return (
        pl.DataFrame(observations)
        .select(
            pl.col("date").str.to_date(),
            pl.lit(series_id).alias("series_id"),
            pl.col("value")
            .replace(".", None)
            .cast(pl.Float64, strict=False)
            .alias("value"),
        )
        .sort("date")
    )