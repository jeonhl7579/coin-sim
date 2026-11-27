import numpy as np
import pandas as pd
import pytest

from analysis.regimes import centered_trend, label_regimes, runs, switch_ratios


def series(values: list[float]) -> pd.Series:
    index = pd.date_range("2024-01-01", periods=len(values), freq="h", tz="UTC")
    return pd.Series(values, index=index)


def test_centered_trend는_앞뒤_반창_누적_로그수익률() -> None:
    trend = centered_trend(series([0.0, 0.1, 0.1, 0.0, 0.0]), window=2)
    # 창 2시간 = t=1, t=2 수익률의 로그 합
    assert trend.iloc[1] == pytest.approx(2 * np.log(1.1))
    assert np.isnan(trend.iloc[0]) and np.isnan(trend.iloc[-1])


def test_label_regimes_히스테리시스() -> None:
    trend = series([0.0, 0.12, 0.05, 0.01, -0.02, -0.15, -0.05, 0.03, 0.2, -0.2])
    labels = label_regimes(trend, enter=0.1)
    assert labels.to_list() == [
        "sideways",  # 0.00
        "bull",  # 0.12 > 0.1 진입
        "bull",  # 0.05 유지 (0을 지나지 않음)
        "bull",  # 0.01
        "sideways",  # -0.02 0을 지나 이탈
        "bear",  # -0.15 진입
        "bear",  # -0.05
        "sideways",  # 0.03 이탈
        "bull",  # 0.20
        "bear",  # -0.20 반대쪽 진입 기준을 넘으면 바로 반대 상태
    ]


def test_label_regimes_NaN은_뺀다() -> None:
    labels = label_regimes(series([np.nan, 0.2, np.nan]), enter=0.1)
    assert labels.to_list() == ["bull"]


def test_runs와_switch_ratios() -> None:
    labels = series([0.0] * 7).map(lambda _: "x")
    labels[:] = ["sideways", "sideways", "bull", "bull", "bull", "sideways", "bear"]
    table = runs(labels)
    assert table["state"].to_list() == ["sideways", "bull", "sideways", "bear"]
    assert table["hours"].to_list() == [2, 3, 1, 1]
    ratios = switch_ratios(table)
    assert ratios["sideways"] == {"bull": 0.5, "bear": 0.5}
    assert ratios["bull"] == {"bear": 0.0, "sideways": 1.0}
    # 다음 상태가 없으면 반반
    assert ratios["bear"] == {"bull": 0.5, "sideways": 0.5}
