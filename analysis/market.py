"""시장 전체 흐름 (F-08, D-70): 30일 거래대금 가중 평균, 코인당 비중 상한. β는 자기를 뺀 지수로."""

import numpy as np
import pandas as pd


def cap_weights(weights: np.ndarray, cap: float) -> np.ndarray:
    """합이 1인 비중에서 cap을 넘는 몫을 나머지에 비례해 나눈다 (반복). cap ≥ 1/n이어야 한다."""
    w = np.asarray(weights, dtype="float64")
    total = w.sum()
    if total <= 0:
        return w
    w = w / total
    capped = np.zeros(len(w), dtype=bool)
    for _ in range(len(w)):
        over = (w > cap + 1e-12) & ~capped
        if not over.any():
            break
        capped |= over
        excess = (w[over] - cap).sum()
        w[over] = cap
        free = ~capped
        if w[free].sum() <= 0:
            break
        w[free] += excess * w[free] / w[free].sum()
    return w


def index_weights(
    returns: pd.DataFrame,
    quote_volume: pd.DataFrame,
    window: int,
    cap: float,
    min_coins: int,
) -> pd.DataFrame:
    """시각마다 지수 비중. 수익률이 있는 코인만, 직전 window시간 평균 거래대금 비례, 상한 적용.

    returns, quote_volume: index = 시각(UTC), columns = 마켓. 코인이 min_coins개 미만인 시각은 NaN.
    코인 수가 적어 cap < 1/n이면 상한을 1/n으로 올린다.
    """
    volume = quote_volume.reindex(index=returns.index, columns=returns.columns)
    # 같은 시각 거래대금을 쓰지 않게 한 칸 민다 (지수가 그 시각 움직임에 끌려가지 않게)
    base = volume.rolling(window, min_periods=1).mean().shift(1)
    available = returns.notna() & base.gt(0)
    raw = base.where(available).to_numpy()
    out = np.full(raw.shape, np.nan)
    for i, row in enumerate(raw):
        mask = ~np.isnan(row)
        n = int(mask.sum())
        if n < min_coins:
            continue
        out[i, mask] = cap_weights(row[mask], max(cap, 1 / n))
    return pd.DataFrame(out, index=returns.index, columns=returns.columns)


def market_index(returns: pd.DataFrame, weights: pd.DataFrame) -> pd.Series:
    """가중 평균 수익률. 비중이 없는 시각은 빠진다."""
    has = weights.notna().any(axis=1)
    value = (returns.fillna(0) * weights.fillna(0)).sum(axis=1)
    return value[has].rename("market")


def leave_one_out(market: pd.Series, returns: pd.Series, weight: pd.Series) -> pd.Series:
    """코인 하나를 뺀 지수 ≈ (지수 − w·r) / (1 − w). 상한을 다시 계산하지 않는 근사다."""
    w = weight.reindex(market.index).fillna(0)
    r = returns.reindex(market.index).fillna(0)
    loo = (market - w * r) / (1 - w)
    return loo[w < 1]


def beta(coin: pd.Series, market: pd.Series) -> float:
    """회귀 기울기 cov(r, m) / var(m). 둘 다 있는 시각만."""
    both = pd.concat([coin, market], axis=1, join="inner").dropna()
    if len(both) < 2:
        return float("nan")
    x = both.iloc[:, 1].to_numpy()
    y = both.iloc[:, 0].to_numpy()
    var = float(np.var(x))
    return float(np.cov(y, x, bias=True)[0, 1] / var) if var > 0 else float("nan")
