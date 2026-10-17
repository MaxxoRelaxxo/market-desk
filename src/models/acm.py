"""
ACM (Adrian, Crump & Moench 2013) term premium for the Swedish government curve.

Monthly snapshot of SWEA T-bills (1M, 3M, 6M) and benchmark bonds (2Y, 5Y, 7Y, 10Y),
PCHIP-interpolated to a 1–120 month grid. Pricing factors = first K yield PCs.

1) VAR(1) on factors  2) excess returns on innovations + lagged factors  3) prices of risk.
Term premium = fitted yield − risk-neutral yield (same recursion with λ = 0).
"""

from pathlib import Path

import numpy as np
import polars as pl
from scipy.interpolate import PchipInterpolator

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

COLS = {1: "SETB1MBENCHC", 3: "SETB3MBENCH", 6: "SETB6MBENCH",
        24: "SEGVB2YC", 60: "SEGVB5YC", 84: "SEGVB7YC", 120: "SEGVB10YC"}
RET_MATS = [3, 6, 24, 60, 84, 120]
SHORT_PROXY = "SECBREPOEFF"  # fills 1M where the T-bill series is missing
K = 3


# === core estimator ========================================================

def _ols(Y, Z):
    """Y: T x m, Z: T x k  ->  coef k x m, resid T x m."""
    coef = np.linalg.solve(Z.T @ Z, Z.T @ Y)
    return coef, Y - Z @ coef


def acm(rx, X, r, nmax):
    """ACM (2013) three-step term-structure estimator.

    rx   : T x N   monthly log excess returns dated t+1
    X    : (T+1) x K   pricing factors (yield PCs), levels, demeaned
    r    : (T+1,)  one-month risk-free rate, per period (monthly)
    nmax : longest maturity (months) to build the curve for

    Returns dict; `fitted`/`riskneutral`/`tp` are nmax x (T+1), annualized.
    """
    K = X.shape[1]
    Xlag, Xc = X[:-1], X[1:]
    T, N = rx.shape

    # 1) VAR(1):  X_{t+1} = mu + Phi X_t + v
    coef, V = _ols(Xc, np.c_[np.ones(T), Xlag])
    mu, Phi = coef[0], coef[1:].T
    Sig = V.T @ V / T

    # 2) rx = a + beta'V + c X_- + E
    coef2, E = _ols(rx, np.c_[np.ones(T), V, Xlag])
    a = coef2[0]
    beta = coef2[1:1 + K]          # K x N
    c = coef2[1 + K:].T            # N x K
    s2 = np.trace(E.T @ E) / (N * T)

    # 3) prices of risk
    BB = beta @ beta.T
    Bstar = np.array([np.outer(beta[:, i], beta[:, i]).flatten("F") for i in range(N)])
    a_adj = a + 0.5 * (Bstar @ Sig.flatten("F") + s2)
    lam0 = np.linalg.solve(BB, beta @ a_adj)
    lam1 = np.linalg.solve(BB, beta @ c)

    # short rate:  r_t = d0 + d1' X_t  (contemporaneous)
    dcoef, _ = _ols(r[:, None], np.c_[np.ones(T + 1), X])
    d0, d1 = dcoef[0, 0], dcoef[1:, 0]

    # affine recursions (priced, then risk-neutral)
    def recurse(l0, l1):
        A = np.zeros(nmax + 1); B = np.zeros((nmax + 1, K))
        for n in range(1, nmax + 1):
            A[n] = (A[n - 1] + B[n - 1] @ (mu - l0)
                    + 0.5 * (B[n - 1] @ Sig @ B[n - 1] + s2) - d0)
            B[n] = (Phi - l1).T @ B[n - 1] - d1
        return A[1:], B[1:]

    A, B = recurse(lam0, lam1)
    Arf, Brf = recurse(np.zeros(K), np.zeros((K, K)))

    n = np.arange(1, nmax + 1)[:, None]
    y = -(A + X @ B.T).T / n * 12          # annualized
    yrf = -(Arf + X @ Brf.T).T / n * 12
    return dict(mu=mu, Phi=Phi, Sig=Sig, beta=beta, s2=s2, lam0=lam0,
                lam1=lam1, fitted=y, riskneutral=yrf, tp=y - yrf)


# === data prep =============================================================

def load_wide() -> pl.DataFrame:
    """date | one column per COLS series (percent), 1M coalesced with the policy rate."""
    one = COLS[1]
    df = (pl.read_parquet(DATA_DIR / "svea_series.parquet")
          .filter(pl.col("series_id").is_in([*COLS.values(), SHORT_PROXY]))
          .pivot(on="series_id", index="date", values="value").sort("date"))
    if one not in df.columns:
        df = df.with_columns(pl.lit(None, pl.Float64).alias(one))
    return df.with_columns(pl.coalesce(one, SHORT_PROXY).alias(one))


def prep_df(df, k=K):
    """rx, X, r, dates, Y, mats from a joined Polars df (percent yields).
    Daily nulls forward-filled, month-end snapshot, PCHIP curve, 1m = short."""
    mats = sorted(COLS); cols = [COLS[m] for m in mats]
    d = (df.sort("date")
           .with_columns([pl.col(c).forward_fill() for c in cols])
           .with_columns(pl.col("date").dt.truncate("1mo").alias("m")))
    mo = (d.group_by("m")
            .agg([pl.col(c).last() for c in cols] + [pl.col("date").last()])
            .sort("m").drop_nulls())
    Y = mo.select(cols).to_numpy() / 100.0
    rf = Y[:, mats.index(1)]
    Yd = Y - Y.mean(0)
    w = np.linalg.eigh(np.cov(Yd, rowvar=False))[1][:, ::-1][:, :k]
    X = Yd @ w
    grid = np.arange(1, 121)
    Yfull = PchipInterpolator(mats, Y, axis=1)(grid)
    lnP = -(grid / 12.0) * Yfull
    r = rf / 12.0
    j = {m: i for i, m in enumerate(grid)}
    rx = np.column_stack([lnP[1:, j[n - 1]] - lnP[:-1, j[n]] - r[:-1] for n in RET_MATS])
    return rx, X, r, mo["date"].to_numpy(), Y, mats


# === output frames =========================================================

MAT_LABEL = {24: "2Y", 60: "5Y", 84: "7Y", 120: "10Y"}


def run(k=K):
    rx, X, r, dates, Y, mats = prep_df(load_wide(), k)
    return acm(rx, X, r, nmax=120), dates, Y, mats


def pricing_errors(out, Y, mats):
    e = {m: (Y[:, mats.index(m)] - out["fitted"][m - 1]) * 1e4 for m in mats[1:]}
    return pl.DataFrame({"maturity_m": list(e),
                         "mean_bp": [float(v.mean()) for v in e.values()],
                         "sd_bp": [float(v.std()) for v in e.values()]})


def tp_frame(out, dates, labels=MAT_LABEL):
    return pl.DataFrame({"date": pl.Series(dates).cast(pl.Date)}
                        | {lbl: out["tp"][n - 1] * 100 for n, lbl in labels.items()})


def decomp_frame(out, dates, Y, mats, n=120):
    return pl.DataFrame({
        "date": pl.Series(dates).cast(pl.Date),
        "observed": Y[:, mats.index(n)] * 100,
        "fitted": out["fitted"][n - 1] * 100,
        "risk_neutral": out["riskneutral"][n - 1] * 100,
        "term_premium": out["tp"][n - 1] * 100,
    })
