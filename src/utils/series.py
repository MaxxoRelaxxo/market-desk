# FRED data
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
}