
from itertools import product
from pathlib import Path

import polars as pl
import requests


BASE_URL = (
    "https://webgate.ec.europa.eu/ecfin/redisstat/"
    "api/dissemination/statistics/1.0/data"
)

# Projektets src-katalog
SRC_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = SRC_DIR / "data"


# ============================================================
# COUNTRIES
# ============================================================

COUNTRIES = [
    "AUT", "BEL", "FIN", "FRA", "DEU", "GRC", "IRL",
    "ITA", "LVA", "NLD", "PRT", "SVK", "SVN", "ESP",
]

COUNTRY_CODES = {
    "AUT": "AT",
    "BEL": "BE",
    "FIN": "FI",
    "FRA": "FR",
    "DEU": "DE",
    "GRC": "GR",
    "IRL": "IE",
    "ITA": "IT",
    "LVA": "LV",
    "NLD": "NL",
    "PRT": "PT",
    "SVK": "SK",
    "SVN": "SI",
    "ESP": "ES",
}


# ============================================================
# DATASET CONFIGURATION
# ============================================================

AMECO_DATASETS = {
    "debt": "ameco_chapter18-01",
    "fiscal": "ameco_chapter16-03",
    "ca": "ameco_chapter10-01",
}

# Debt configuration verified against Italy 2024:
# UDGG, UNIT=319, REFERENCE=0 -> 134.73942 % GDP.
#
# Fiscal and current account codes are not yet verified.
# Set them after inspecting the corresponding datasets.

AMECO_INDICATORS = {
    "debt": {
        "item": "UDGG",
        "unit": "319",
        "reference": "0",
    },
    "fiscal": {
        "item": "UBLG",
        "unit": "319",
        "reference": "0",
    },
    "ca": {
        "item": "UBCA",
        "unit": "310",
        "reference": "0",
    },
}


# ============================================================
# API REQUEST
# ============================================================

def request_ameco(
    dataset: str,
    params: list[tuple[str, str]] | None = None,
) -> dict:
    """
    Request JSON-stat data from AMECO.

    Detects API errors even when HTTP status is 200.
    """

    response = requests.get(
        f"{BASE_URL}/{dataset}",
        params=params,
        timeout=120,
    )

    response.raise_for_status()

    data = response.json()

    if "error" in data:
        raise ValueError(
            f"AMECO API error for {dataset}: "
            f"{data['error']}"
        )

    if "dimension" not in data or "id" not in data:
        raise ValueError(
            f"Unexpected AMECO response for {dataset}"
        )

    return data


# ============================================================
# JSON-STAT TO POLARS
# ============================================================

def jsonstat_to_polars(
    data: dict,
) -> pl.DataFrame:
    """
    Convert JSON-stat 2.0 to long-format Polars.

    Dimension codes are preserved.
    Missing observations are excluded.
    """

    dimension_ids = data["id"]
    dimensions = data["dimension"]

    categories = []

    for dim_id in dimension_ids:

        index = (
            dimensions[dim_id]
            ["category"]["index"]
        )

        if isinstance(index, dict):
            ordered = [
                key
                for key, _ in sorted(
                    index.items(),
                    key=lambda item: item[1],
                )
            ]
        else:
            ordered = list(index)

        categories.append(ordered)

    values = data.get("value", {})

    rows = []

    for position, combination in enumerate(
        product(*categories)
    ):

        if isinstance(values, list):
            value = (
                values[position]
                if position < len(values)
                else None
            )
        else:
            value = values.get(str(position))

        if value is None:
            continue

        row = dict(
            zip(dimension_ids, combination)
        )

        row["value"] = float(value)

        rows.append(row)

    schema = {
        dim_id: pl.String
        for dim_id in dimension_ids
    }

    schema["value"] = pl.Float64

    if not rows:
        return pl.DataFrame(schema=schema)

    return pl.DataFrame(
        rows,
        schema=schema,
    )


# ============================================================
# INSPECT AMECO DATASETS
# ============================================================

def inspect_ameco(
    dataset: str,
    dimension: str = "ITEM",
) -> pl.DataFrame:
    """
    Inspect available codes and descriptions
    for a dataset dimension.

    Example:
        inspect_ameco("ameco_chapter18-01")
        inspect_ameco("ameco_chapter18-01", "UNIT")
    """

    data = request_ameco(dataset)

    dimensions = data["dimension"]

    if dimension not in dimensions:
        raise ValueError(
            f"Dimension {dimension} not found. "
            f"Available: {list(dimensions)}"
        )

    category = dimensions[dimension]["category"]

    labels = category.get("label", {})
    index = category["index"]

    if isinstance(index, dict):
        codes = [
            key
            for key, _ in sorted(
                index.items(),
                key=lambda item: item[1],
            )
        ]
    else:
        codes = list(index)

    return pl.DataFrame({
        "code": codes,
        "description": [
            labels.get(code, code)
            for code in codes
        ],
    })


# ============================================================
# FETCH FILTERED DATA
# ============================================================

def fetch_ameco(
    dataset: str,
    countries: list[str],
    indicators: list[str],
    start_year: int = 2000,
    unit: str = "319",
    reference: str = "0",
) -> dict:
    """
    Fetch annual AMECO observations.

    Filters are applied directly in the API request.
    """

    if not countries:
        raise ValueError(
            "At least one country is required"
        )

    if not indicators:
        raise ValueError(
            "At least one indicator is required"
        )

    params = [
        ("lang", "EN"),
        ("sinceTimePeriod", str(start_year)),
        ("FREQ", "A"),
        ("TRANSFORMATION", "1"),
        ("AGG_METHOD", "0"),
        ("UNIT", unit),
        ("REFERENCE", reference),
    ]

    params.extend(
        ("REF_AREA", country)
        for country in countries
    )

    params.extend(
        ("ITEM", indicator)
        for indicator in indicators
    )

    return request_ameco(
        dataset=dataset,
        params=params,
    )


# ============================================================
# FETCH ONE FUNDAMENTAL
# ============================================================

def fetch_ameco_fundamental(
    name: str,
    start_year: int = 2000,
    countries: list[str] | None = None,
) -> pl.DataFrame:
    """
    Fetch one fundamental and return:

        country | year | value

    Values are expressed as percentages of GDP,
    provided the configured AMECO series is correct.
    """

    if name not in AMECO_DATASETS:
        raise ValueError(
            f"Unknown fundamental: {name}"
        )

    if countries is None:
        countries = COUNTRIES

    config = AMECO_INDICATORS[name]

    if any(
        config[key] is None
        for key in ("item", "unit", "reference")
    ):
        raise ValueError(
            f"AMECO configuration for {name} "
            "is not yet verified. "
            "Use inspect_ameco() first."
        )

    data = fetch_ameco(
        dataset=AMECO_DATASETS[name],
        countries=countries,
        indicators=[config["item"]],
        start_year=start_year,
        unit=config["unit"],
        reference=config["reference"],
    )

    df = jsonstat_to_polars(data)

    if df.is_empty():
        return pl.DataFrame(
            schema={
                "country": pl.String,
                "year": pl.Int32,
                name: pl.Float64,
            }
        )

    return (
        df.select(
            pl.col("REF_AREA")
            .replace(COUNTRY_CODES)
            .alias("country"),

            pl.col("TIME_PERIOD")
            .cast(pl.Int32)
            .alias("year"),

            pl.col("value")
            .alias(name),
        )
        .sort(["country", "year"])
    )


# ============================================================
# FETCH ALL FUNDAMENTALS
# ============================================================

def fetch_all_ameco(
    start_year: int = 2000,
    countries: list[str] | None = None,
    fundamentals: list[str] | None = None,
) -> pl.DataFrame:
    """
    Fetch and combine selected fundamentals.

    Output:
        country | year | debt | fiscal | ca

    By default, only fully configured fundamentals
    are downloaded.
    """

    if countries is None:
        countries = COUNTRIES

    if fundamentals is None:
        fundamentals = [
            name
            for name, config in AMECO_INDICATORS.items()
            if all(
                config[key] is not None
                for key in ("item", "unit", "reference")
            )
        ]

    if not fundamentals:
        raise ValueError(
            "No configured AMECO fundamentals"
        )

    frames = []

    for name in fundamentals:

        print(f"Fetching AMECO: {name}")

        df = fetch_ameco_fundamental(
            name=name,
            start_year=start_year,
            countries=countries,
        )

        frames.append(df)

    result = frames[0]

    for df in frames[1:]:
        result = result.join(
            df,
            on=["country", "year"],
            how="full",
            coalesce=True,
        )

    return result.sort(["country", "year"])


# ============================================================
# SAVE PARQUET
# ============================================================

def save_ameco_parquet(
    start_year: int = 2000,
    countries: list[str] | None = None,
    fundamentals: list[str] | None = None,
) -> Path:
    """
    Download AMECO fundamentals and save
    to src/data/ameco_fundamentals.parquet.
    """

    DATA_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    df = fetch_all_ameco(
        start_year=start_year,
        countries=countries,
        fundamentals=fundamentals,
    )

    output_path = (
        DATA_DIR / "ameco_fundamentals.parquet"
    )

    df.write_parquet(output_path)

    return output_path
