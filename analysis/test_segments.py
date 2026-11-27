import numpy as np
import pandas as pd
import pytest

from analysis.segments import Segment, cut_segments, sample_pool, standardize_by_state

T0 = pd.Timestamp("2024-01-01T00:00:00Z")


def at(hours: list[int], values: list[float]) -> pd.Series:
    return pd.Series(values, index=[T0 + pd.Timedelta(hours=h) for h in hours])


def test_빈_시간과_상태_경계를_넘지_않고_겹치지_않게_자른다() -> None:
    # 0~6시 bull, 7~12시 bear, 4시는 빈 시간. 길이 3
    hours = [h for h in range(13) if h != 4]
    z = at(hours, [float(h) for h in hours])
    labels = at(list(range(13)), ["bull"] * 7 + ["bear"] * 6)
    out = cut_segments(z, labels, length=3, source="A")
    # bull: 0~3 → (0,1,2) 하나 (3은 남음), 5~6은 2개라 부족 / bear: 7~12 → 두 조각
    assert [s.points for s in out["bull"]] == [(0.0, 1.0, 2.0)]
    assert [s.points for s in out["bear"]] == [(7.0, 8.0, 9.0), (10.0, 11.0, 12.0)]
    assert all(s.source == "A" for s in out["bear"])


def test_상태별_표준편차로_나누고_평균은_남긴다() -> None:
    x = at(list(range(4)), [1.0, 3.0, 10.0, 10.0])
    labels = at(list(range(4)), ["bull", "bull", "bear", "bear"])
    z, std = standardize_by_state(x, labels)
    assert std == {"bear": 0.0, "bull": 1.0}
    # bull 표준편차 1 → 값 그대로, bear 표준편차 0 → 버림
    assert z.to_list() == pytest.approx([1.0, 3.0])


def test_sample_pool은_시드가_같으면_같고_상한을_지킨다() -> None:
    pool = [Segment(str(i), (float(i),)) for i in range(10)]
    a = sample_pool(pool, 4, np.random.default_rng(7))
    b = sample_pool(pool, 4, np.random.default_rng(7))
    assert a == b and len(a) == 4 and len(set(a)) == 4
    assert sorted(s.source for s in sample_pool(pool, 20, np.random.default_rng(7))) == sorted(
        str(i) for i in range(10)
    )
