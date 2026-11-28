"""폭락형과 캔들 꼬리. 폭락 구간을 심은 합성 데이터."""

import numpy as np
import pandas as pd
import pytest

from analysis.crash import crash_episodes, wick_ratios

T0 = pd.Timestamp("2024-01-01T00:00:00Z")


def idio_with_crashes(
    hours: int, crashes: list[tuple[int, int, float]], seed: int = 0
) -> pd.Series:
    """작은 잡음 위에 (시작, 길이, 총 하락) 구간을 심는다."""
    rng = np.random.default_rng(seed)
    logr = rng.normal(0, 0.001, hours)
    for start, length, total in crashes:
        logr[start : start + length] += np.log1p(total) / length
    return pd.Series(np.expm1(logr), index=pd.date_range(T0, periods=hours, freq="h"))


def find(idio: pd.Series, **kw) -> list:
    args = {
        "window": 100,
        "threshold": -0.5,
        "recovery_hours": 50,
        "max_per_coin": 3,
        "min_coverage": 0.9,
    }
    return crash_episodes("KRW-AAA", idio, **{**args, **kw})


def test_심은_폭락을_찾고_하락과_회복을_잰다() -> None:
    idio = idio_with_crashes(1000, [(300, 100, -0.6), (400, 50, 0.3)])
    [episode] = find(idio)
    assert episode.drawdown == pytest.approx(-0.6, abs=0.03)
    assert abs((episode.start - (T0 + pd.Timedelta(hours=300))) / pd.Timedelta(hours=1)) <= 3
    # 이후 50시간: 심은 +30%
    assert episode.recovery == pytest.approx(0.3, abs=0.03)


def test_겹치지_않게_나쁜_순서로_최대_개수까지() -> None:
    crashes = [(100, 100, -0.55), (400, 100, -0.8), (700, 100, -0.6), (900, 80, -0.7)]
    idio = idio_with_crashes(2000, crashes)
    episodes = find(idio)
    assert [round(e.drawdown, 1) for e in episodes] == [-0.8, -0.7, -0.6]
    spans = sorted((e.start, e.end) for e in episodes)
    assert all(a_end < b_start for (_, a_end), (b_start, _) in zip(spans, spans[1:], strict=False))


def test_기준보다_얕으면_없음() -> None:
    assert find(idio_with_crashes(1000, [(300, 100, -0.4)])) == []


def test_빈_시간이_많은_구간은_쓰지_않는다() -> None:
    idio = idio_with_crashes(1000, [(300, 100, -0.6)])
    holes = idio.drop(idio.index[310:330])  # 구간 100시간 중 20시간이 빔 (80%)
    assert find(holes) == []


def test_데이터가_끝나면_회복은_None() -> None:
    idio = idio_with_crashes(420, [(300, 100, -0.6)])
    [episode] = find(idio)
    assert episode.recovery is None


def test_wick_ratios는_꼬리_길이를_상태별_변동성으로_나눈다() -> None:
    index = pd.date_range(T0, periods=4, freq="h")
    candles = pd.DataFrame(
        {
            "time": index,
            "open": [100.0, 100, 100, 100],
            "high": [104.0, 101, 103, 100],
            "low": [98.0, 99, 99, 100],
            "close": [102.0, 100, 101, 100],
        }
    )
    returns = pd.Series([0.01, -0.01, 0.02, -0.02], index=index)
    labels = pd.Series(["bull", "bull", "bear", "bear"], index=index)
    out = wick_ratios(candles, returns, labels)
    # 꼬리 = (고가 − 저가 − |종가 − 시가|) / 시가 → 0.04, 0.02, 0.03, 0
    assert out["bull"] == pytest.approx([0.04 / 0.01, 0.02 / 0.01])
    assert out["bear"] == pytest.approx([0.03 / 0.02, 0.0])
