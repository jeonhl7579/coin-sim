"""6.2a 통계 전체 흐름. 정해진 β로 만든 합성 시장 (실제 코인 이름 없음)."""

import json
from dataclasses import replace

import numpy as np
import pandas as pd
import pytest

from analysis.clean import CleanParams, clean_all
from analysis.regimes import STATES
from analysis.stats import StatsParams, build_core, quantiles

HOURS = 3000
BETAS = {"KRW-A": 0.5, "KRW-B": 0.8, "KRW-C": 1.0, "KRW-D": 1.2, "KRW-E": 1.5, "KRW-F": 2.0}
VOLUMES = {"KRW-A": 6e9, "KRW-B": 5e9, "KRW-C": 4e9, "KRW-D": 3e9, "KRW-E": 2e9, "KRW-F": 1e9}


def synthetic_frames() -> dict[str, pd.DataFrame]:
    rng = np.random.default_rng(42)
    # 시장: 500시간씩 상승 → 횡보 → 하락 반복
    drift = np.tile(np.repeat([0.004, 0.0, -0.004], 500), 2)
    market = drift + rng.normal(0, 0.005, HOURS)
    time = pd.date_range("2024-01-01", periods=HOURS, freq="h", tz="UTC")
    frames = {}
    for name, b in BETAS.items():
        r = b * market + rng.normal(0, 0.004, HOURS)
        close = 100 * np.cumprod(1 + r)
        frames[name] = pd.DataFrame(
            {
                "time": time,
                "open": close,
                "high": close,
                "low": close,
                "close": close,
                "volume": 1.0,
                "quote_volume": VOLUMES[name] / 24,
            }
        )
    return frames


CLEAN = replace(CleanParams(), start="2000-01-01T00:00:00Z", min_returns=100)
PARAMS = replace(
    StatsParams(),
    regime_window=48,
    regime_enter=0.05,
    segment_hours=6,
    segments_per_pool=40,
    weight_window=24,
    weight_cap=0.5,
    leader_count=2,
    large_share=0.1,
    mid_share=0.1,
    min_group_coins=1,
)


def test_quantiles_격자와_빈_입력() -> None:
    assert quantiles([1.0, 2.0, 3.0, np.nan], (0.0, 0.5, 1.0)) == {
        "p": [0.0, 0.5, 1.0],
        "v": [1.0, 2.0, 3.0],
    }
    assert quantiles([], (0.5,)) == {"p": [0.5], "v": []}


@pytest.fixture(scope="module")
def core():
    frames = synthetic_frames()
    return build_core(clean_all(frames, CLEAN), frames, PARAMS)


def test_data_spec_4_2_모양(core) -> None:
    stats = core.stats
    assert set(stats) == {"regimes", "market", "archetypes"}
    assert set(stats["regimes"]["duration"]) == set(STATES)
    for state, nxt in stats["regimes"]["switch"].items():
        assert state not in nxt and sum(nxt.values()) == pytest.approx(1)
    assert set(stats["archetypes"]) == {"leader", "large", "mid", "small"}
    for group in stats["archetypes"].values():
        for state in STATES:
            for seg in group["segments"][state]:
                assert len(seg) == PARAMS.segment_hours
            assert len(group["segments"][state]) <= PARAMS.segments_per_pool


def test_상태를_구분하고_상승장_평균이_가장_높다(core) -> None:
    mean = core.report["regimeMeanReturn"]
    assert mean["bull"] > mean["sideways"] > mean["bear"]


def test_β를_되찾고_거래대금_순으로_분류한다(core) -> None:
    coins = core.report["coins"]
    # 지수가 β 평균(약 1.1)쯤의 시장이라 상대 β는 원래 β의 순서를 지킨다
    estimated = [coins[m]["beta"] for m in BETAS]
    assert estimated == sorted(estimated)
    assert coins["KRW-A"]["archetype"] == "leader"
    assert coins["KRW-F"]["archetype"] == "small"


def test_같은_입력과_시드면_같은_결과(core) -> None:
    frames = synthetic_frames()
    again = build_core(clean_all(frames, CLEAN), frames, PARAMS)
    assert json.dumps(again.stats) == json.dumps(core.stats)
