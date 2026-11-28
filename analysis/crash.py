"""폭락형 (F-09, D-72·D-77)과 캔들 꼬리 (F-10, D-78).

폭락: 고유 움직임(코인 − β × 자기를 뺀 지수)의 window시간 누적 수익률이 threshold 이하인 구간.
코인마다 겹치지 않는 구간을 가장 나쁜 것부터 max_per_coin개까지 고르고, 그 뒤 recovery시간
누적 수익률을 함께 기록한다. 빈 시간은 0으로 보고 누적하되, 구간 안에 수익률이 있는 시간이
min_coverage 미만이면 쓰지 않는다 (값을 채워 통계에 쓰지 않음).

꼬리: (고가 − 저가 − |종가 − 시가|) ÷ 시가 ÷ 그 코인·상태의 1시간 수익률 표준편차.
"""

from dataclasses import dataclass

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class Episode:
    source: str
    start: pd.Timestamp
    end: pd.Timestamp
    drawdown: float
    # 구간 뒤 recovery시간 누적 수익률. 데이터가 그만큼 없으면 None
    recovery: float | None
    returns: pd.Series


def crash_episodes(
    source: str,
    idio: pd.Series,
    window: int,
    threshold: float,
    recovery_hours: int,
    max_per_coin: int,
    min_coverage: float,
) -> list[Episode]:
    if idio.empty:
        return []
    index = pd.date_range(idio.index.min(), idio.index.max(), freq="h")
    logr = np.log1p(idio).reindex(index)
    observed = logr.notna().astype("float64")
    cum = logr.fillna(0).cumsum().to_numpy()
    coverage = observed.rolling(window, min_periods=window).mean().to_numpy()
    change = np.full(len(index), np.inf)
    change[window:] = cum[window:] - cum[:-window]
    change[np.isnan(coverage) | (coverage < min_coverage)] = np.inf

    episodes: list[Episode] = []
    limit = np.log1p(threshold)
    while len(episodes) < max_per_coin:
        end = int(np.argmin(change))
        if not np.isfinite(change[end]) or change[end] > limit:
            break
        start = end - window + 1
        after = end + recovery_hours
        recovery = float(np.expm1(cum[after] - cum[end])) if after < len(index) else None
        episodes.append(
            Episode(
                source,
                index[start],
                index[end],
                float(np.expm1(change[end])),
                recovery,
                idio[(idio.index >= index[start]) & (idio.index <= index[end])],
            )
        )
        # 이 구간과 겹치는 창(끝이 start ~ end + window − 1)은 다시 고르지 않는다
        change[max(start, 0) : min(end + window, len(index))] = np.inf
    return episodes


def wick_ratios(
    candles: pd.DataFrame, returns: pd.Series, labels: pd.Series
) -> dict[str, np.ndarray]:
    """상태별 꼬리 길이 ÷ 그 상태의 1시간 수익률 표준편차. 수익률과 상태가 있는 시각만."""
    frame = candles.set_index("time")
    wick = (frame["high"] - frame["low"] - (frame["close"] - frame["open"]).abs()) / frame["open"]
    joined = pd.concat(
        [wick.rename("wick"), returns.rename("r"), labels.rename("state")], axis=1, join="inner"
    ).dropna()
    out: dict[str, np.ndarray] = {}
    for state, part in joined.groupby("state"):
        std = float(part["r"].std(ddof=0))
        if std > 0:
            out[str(state)] = (part["wick"] / std).to_numpy()
    return out
