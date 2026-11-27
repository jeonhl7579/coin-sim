"""급등락과 전파. 전파를 일부러 심은 합성 데이터로 심은 값을 되찾는지 본다."""

import math

import numpy as np
import pandas as pd
import pytest

from analysis.shocks import (
    PropagationParams,
    baseline_reactions,
    binom_sf,
    detect_events,
    make_grid,
    propagation_stats,
    react,
    shock_summary,
)

T0 = pd.Timestamp("2024-01-01T00:00:00Z")
GRID_Q = (0.0, 0.25, 0.5, 0.75, 1.0)


def at(hours: list[int], values: list[float]) -> pd.Series:
    return pd.Series(values, index=[T0 + pd.Timedelta(hours=h) for h in hours], dtype="float64")


def test_detect_events는_기준_이상이고_12시간_안은_같은_사건() -> None:
    x = at([0, 5, 12, 13, 30, 40], [0.1, -0.2, 0.09, 0.3, 0.01, -0.08])
    events = detect_events(x, 0.08, 12)
    assert list(events.index) == [T0 + pd.Timedelta(hours=h) for h in (0, 12, 40)]
    assert events.to_list() == [0.1, 0.09, -0.08]


def test_shock_summary는_빈도_상승비율_방향별_크기() -> None:
    summary = shock_summary([0.1, 0.2, -0.3, 0.1], hours=2000, grid=GRID_Q)
    assert summary["ratePer1000h"] == 2.0
    assert summary["upShare"] == 0.75
    assert summary["up"]["v"] == pytest.approx([0.1, 0.1, 0.1, 0.15, 0.2])
    assert summary["down"]["v"] == pytest.approx([0.3] * 5)


@pytest.mark.parametrize(("k", "n", "p"), [(0, 5, 0.3), (3, 10, 0.2), (10, 10, 0.5), (7, 30, 0.1)])
def test_binom_sf는_직접_합과_같다(k: int, n: int, p: float) -> None:
    expected = sum(math.comb(n, i) * p**i * (1 - p) ** (n - i) for i in range(k, n + 1))
    assert binom_sf(k, n, p) == pytest.approx(expected)


def synthetic(propagate: float, seed: int = 3):
    """코인 30개, 고유 움직임 N(0, 1%). 사건 300개를 심고 propagate 확률로 다른 코인 절반이
    1시간 뒤 같은 방향으로 원래 충격의 40%만큼 움직인다 (β = 1)."""
    rng = np.random.default_rng(seed)
    hours, coins = 20_000, 30
    x = rng.normal(0, 0.01, (hours, coins))
    events = []
    for pos in rng.choice(np.arange(10, hours - 10, 40), size=300, replace=False):
        origin = int(rng.integers(coins))
        sign = 1.0 if rng.random() < 0.5 else -1.0
        x[pos, origin] = sign * 0.1
        if rng.random() < propagate:
            others = [c for c in range(coins) if c != origin]
            for c in rng.choice(others, size=len(others) // 2, replace=False):
                x[pos + 1, c] = sign * 0.04
        events.append((int(pos), origin, sign))
    index = pd.date_range(T0, periods=hours, freq="h")
    names = [f"KRW-{i:02d}" for i in range(coins)]
    idio = {n: pd.Series(x[:, i], index=index) for i, n in enumerate(names)}
    z = {n: s / 0.01 for n, s in idio.items()}
    grid = make_grid(idio, z, dict.fromkeys(names, 1.0))
    return grid, events, names


def run(propagate: float):
    grid, events, names = synthetic(propagate)
    params = PropagationParams(
        follow_z=2.0, max_lag=3, baseline_samples=2000, alpha=0.05, bootstrap=200
    )
    rng = np.random.default_rng(0)
    reactions = [react(grid, p, o, s, s * 0.1, 2.0, 3) for p, o, s in events]
    positions = {o: set() for o in range(len(names))}
    for p, o, _ in events:
        positions[o].add(p)
    baseline = baseline_reactions(grid, positions, params, rng)
    return propagation_stats(
        reactions, baseline, dict.fromkeys(names, "small"), params, GRID_Q, rng
    )


def test_심은_전파를_되찾는다() -> None:
    stats, report = run(propagate=0.6)
    assert report["probability"]["small"]["distinguished"]
    assert stats["probability"]["small"] == pytest.approx(0.6, abs=0.08)
    # 1시간 뒤에 심었으므로 시차 1이 가장 크다
    assert int(np.argmax(stats["delay"])) == 1
    assert stats["strength"]["v"][2] == pytest.approx(0.4, abs=0.05)
    assert stats["opposite"] == pytest.approx(0.0, abs=0.1)
    # 우연한 반응이 섞여도 범위는 심은 절반에 가깝다
    assert stats["scope"]["v"][2] == pytest.approx(0.5, abs=0.1)
    assert "noEffect" in report["toConfig"]


def test_전파가_없으면_구분되지_않아_config로_넘긴다() -> None:
    stats, report = run(propagate=0.0)
    assert not report["probability"]["small"]["distinguished"]
    assert "probability" not in stats
    assert set(report["toConfig"]) >= {"probability", "delay", "strength", "opposite", "noEffect"}
