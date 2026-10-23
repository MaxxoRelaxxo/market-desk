
from datetime import date


# --------------------------------------------------
# FRED data
# --------------------------------------------------

FRED_SERIES = {
    "nominal": {
        "US Government Bond 2Y": "DGS2",
        "US Government Bond 5Y": "DGS5",
        "US Government Bond 7Y": "DGS7",
        "US Government Bond 10Y": "DGS10",
        "US Government Bond 30Y": "DGS30",
    },
    "tips": {
        "US Treasury Inflation-Protected Securities 5Y": "DFII5",
        "US Treasury Inflation-Protected Securities 7Y": "DFII7",
        "US Treasury Inflation-Protected Securities 10Y": "DFII10",
        "US Treasury Inflation-Protected Securities 30Y": "DFII30",
    },
    "policy": {
        "US Effective Federal Funds Rate": "DFF",
        "US Secured Overnight Financing Rate": "SOFR",
    },
    "credit": {
        "US Investment Grade Option-Adjusted Spread": "BAMLC0A0CM",
        "US High Yield Option-Adjusted Spread": "BAMLH0A0HYM2",
    },
    "breakeven": {
        "US Breakeven Inflation Rate 5Y": "T5YIE",
        "US Breakeven Inflation Rate 10Y": "T10YIE",
        "US 30Y Inflation Expectations (Model-Based)": "T30YIEM",
    },
    "forward_inflation": {
        "US 5Y5Y Forward Inflation Expectation Rate": "T5YIFR",
    },
    "spreads": {
        "US Treasury Spread 10Y-2Y": "T10Y2Y",
        "US Treasury Spread 10Y-3M": "T10Y3M",
    },
    "mortgage": {
        "US 30Y Fixed Rate Mortgage Average": "MORTGAGE30US",
    },
    "inflation": {
        "US Consumer Price Index": "CPIAUCNS",
        "Euro Area Harmonised Consumer Price Index": "CP0000EZ19M086NEST",
        "UK Consumer Price Index": "CP0000GBM086NEST",
        "Japan Consumer Price Index": "JPNCPIALLMINMEI",
        "Switzerland Consumer Price Index": "CP0000CHM086NEST",
        "Canada Consumer Price Index": "CANCPIALLMINMEI",
        "Australia Consumer Price Index": "AUSCPIALLQINMEI",
        "New Zealand Consumer Price Index": "NZLCPIALLQINMEI",
        "Norway Consumer Price Index": "CP0000NOM086NEST",
        "Sweden Consumer Price Index": "CP0000SEM086NEST",
    },
}


# --------------------------------------------------
# SOFR futures
# --------------------------------------------------

def generate_sofr_contracts(
    n_contracts: int = 4,
) -> dict[str, str]:

    month_codes = {
        3: "H",
        6: "M",
        9: "U",
        12: "Z",
    }

    today = date.today()
    year = today.year

    contracts = {}

    while len(contracts) < n_contracts:

        for month, code in month_codes.items():

            if (year, month) < (today.year, today.month):
                continue

            yy = str(year)[-2:]

            name = f"sofr_{year}_{month:02d}"
            ticker = f"SR3{code}{yy}.CME"

            contracts[name] = ticker

            if len(contracts) == n_contracts:
                break

        year += 1

    return contracts


# --------------------------------------------------
# CFTC Commitments of Traders (TFF, futures only)
# --------------------------------------------------

COT_CONTRACTS = {  # label: CFTC contract market code
    "UST 2Y": "042601",
    "UST 10Y": "043602",
    "JPY": "097741",
    "EUR": "099741",
}
COT_FUTURES = {  # label: yfinance continuous front-month future (price overlay)
    "UST 2Y": "ZT=F",
    "UST 10Y": "ZN=F",
    "JPY": "6J=F",
    "EUR": "6E=F",
}


# --------------------------------------------------
# SEC EDGAR fundamentals (XBRL company facts)
# --------------------------------------------------

SEC_COMPANIES = {  # basket: {ticker: CIK}
    "Hyperscalers": {"MSFT": "789019", "AMZN": "1018724", "GOOGL": "1652044", "META": "1326801", "ORCL": "1341439"},
    "Semiconductors": {"NVDA": "1045810", "AVGO": "1730168", "AMD": "2488", "QCOM": "804328", "MU": "723125",
                       "INTC": "50863", "TXN": "97476"},
}
SEC_TAGS = {  # metric: us-gaap tags, first = preferred (companies switch tags over time)
    "ni": ["NetIncomeLoss", "ProfitLoss"],
    "ocf": ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"],
    "capex": ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"],
}


# --------------------------------------------------
# Yahoo Finance data
# --------------------------------------------------

YFINANCE_SERIES = {
    "indices": {
        "sp500": "^GSPC",
        "dow_jones": "^DJI",
        "nasdaq100": "^NDX",
        "russell2000": "^RUT",
        "vix": "^VIX",
        "omx30": "^OMX",
        "eurostoxx50": "^STOXX50E",
        "nikkei225": "^N225",
        "hang_seng": "^HSI",
        "kospi": "^KS11",
        "kosdaq": "^KQ11",
        "dax": "^GDAXI",
        "ftse100": "^FTSE",
        "sox": "^SOX",
    },
    "energy": {
        "wti": "CL=F",
        "brent": "BZ=F",
        "natural_gas": "NG=F",
        "heating_oil": "HO=F",
    },
    "metals": {
        "gold": "GC=F",
        "silver": "SI=F",
        "copper": "HG=F",
        "platinum": "PL=F",
        "palladium": "PA=F",
    },
    "cot_futures": COT_FUTURES,
    "sofr": generate_sofr_contracts(
        n_contracts=9,
    ),
}
