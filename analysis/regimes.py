"""시장 상태 구분 (F-06, D-68): 가운데 창 누적 수익률 + 히스테리시스.

진입: 누적 수익률 > +enter 이면 상승, < −enter 이면 하락. 이탈: 0을 지나면 횡보 (반대쪽 진입 기준을
넘으면 바로 반대 상태). 창은 그 시각을 가운데에 둔다 (분석은 과거·미래를 모두 볼 수 있다).
"""

import numpy as np
import pandas as pd

STATES = ("bull", "bear", "sideways")


def centered_trend(market: pd.Series, window: int) -> pd.Series:
    """앞뒤 window/2시간 사이 누적 로그 수익률. 양 끝 window/2시간은 NaN."""
    half = window // 2
    logp = np.log1p(market).cumsum()
    return logp.shift(-half) - logp.shift(half)


def label_regimes(trend: pd.Series, enter: float) -> pd.Series:
    """히스테리시스 상태 라벨. trend가 NaN인 시각은 빠진다."""
    values = trend.dropna()
    labels: list[str] = []
    state = "sideways"
    for v in values.to_numpy():
        if state == "sideways":
            state = "bull" if v > enter else "bear" if v < -enter else "sideways"
        elif state == "bull" and v < 0:
            state = "bear" if v < -enter else "sideways"
        elif state == "bear" and v > 0:
            state = "bull" if v > enter else "sideways"
        labels.append(state)
    return pd.Series(labels, index=values.index, name="state")


def runs(labels: pd.Series) -> pd.DataFrame:
    """같은 상태가 이어진 구간: state, start, hours.

    라벨 사이에 시간이 비어도 같은 상태면 한 구간으로 본다.
    """
    group = (labels != labels.shift()).cumsum()
    grouped = labels.groupby(group)
    return pd.DataFrame(
        {
            "state": grouped.first().to_numpy(),
            "start": grouped.apply(lambda s: s.index[0]).to_numpy(),
            "hours": grouped.size().to_numpy(),
        }
    )


def switch_ratios(run_table: pd.DataFrame) -> dict[str, dict[str, float]]:
    """상태가 끝났을 때 다음 상태로 간 비율 (자기 자신 제외). 행의 합 = 1."""
    nxt = run_table["state"].shift(-1)
    out: dict[str, dict[str, float]] = {}
    for state in STATES:
        following = nxt[(run_table["state"] == state) & nxt.notna()]
        others = [s for s in STATES if s != state]
        counts = {s: int((following == s).sum()) for s in others}
        total = sum(counts.values())
        out[state] = {s: (counts[s] / total if total else 0.5) for s in others}
    return out
