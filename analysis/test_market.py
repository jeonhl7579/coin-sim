import numpy as np
import pandas as pd
import pytest

from analysis.market import beta, cap_weights, index_weights, leave_one_out, market_index

T = pd.date_range("2024-01-01", periods=5, freq="h", tz="UTC")


class TestCapWeights:
    def test_상한을_넘는_몫을_나머지에_비례해_나눈다(self) -> None:
        # 0.6 → 0.5로 깎고 남는 0.1을 0.2:0.2 비율로 나눔
        assert cap_weights(np.array([6, 2, 2]), 0.5) == pytest.approx([0.5, 0.25, 0.25])

    def test_나눈_뒤_또_넘으면_반복한다(self) -> None:
        w = cap_weights(np.array([50, 30, 10, 10]), 0.3)
        assert w == pytest.approx([0.3, 0.3, 0.2, 0.2])
        assert w.sum() == pytest.approx(1)

    def test_상한_아래면_정규화만(self) -> None:
        assert cap_weights(np.array([1, 1, 2]), 0.6) == pytest.approx([0.25, 0.25, 0.5])


class TestIndexWeights:
    def test_직전_거래대금_비례_최소_코인_수와_상한(self) -> None:
        returns = pd.DataFrame(
            {"A": [0.0] * 5, "B": [0.0] * 5, "C": [0.0, 0.0, np.nan, 0.0, 0.0]}, index=T
        )
        volume = pd.DataFrame({"A": [8.0] * 5, "B": [1.0] * 5, "C": [1.0] * 5}, index=T)
        w = index_weights(returns, volume, window=2, cap=0.5, min_coins=2)
        # 첫 시각은 직전 거래대금이 없어 비중 없음
        assert w.iloc[0].isna().all()
        # A 0.8 → 상한 0.5, 남는 0.3을 B·C가 반씩
        assert w.iloc[1].to_list() == pytest.approx([0.5, 0.25, 0.25])
        # C 수익률이 없는 시각: A·B 둘, 상한 0.5 = 1/2
        assert w.iloc[2].to_list()[:2] == pytest.approx([0.5, 0.5])
        assert np.isnan(w.iloc[2]["C"])

    def test_코인이_적으면_상한을_1_나누기_n으로_올린다(self) -> None:
        returns = pd.DataFrame({"A": [0.0] * 3, "B": [0.0] * 3}, index=T[:3])
        volume = pd.DataFrame({"A": [9.0] * 3, "B": [1.0] * 3}, index=T[:3])
        w = index_weights(returns, volume, window=1, cap=0.15, min_coins=2)
        assert w.iloc[1].to_list() == pytest.approx([0.5, 0.5])

    def test_최소_코인_수_미만이면_NaN(self) -> None:
        returns = pd.DataFrame({"A": [0.0] * 3}, index=T[:3])
        volume = pd.DataFrame({"A": [1.0] * 3}, index=T[:3])
        assert index_weights(returns, volume, 1, 0.5, 2).isna().all().all()


def test_market_index_가중_평균() -> None:
    returns = pd.DataFrame({"A": [0.1, 0.2], "B": [-0.1, np.nan]}, index=T[:2])
    weights = pd.DataFrame({"A": [0.25, 1.0], "B": [0.75, np.nan]}, index=T[:2])
    assert market_index(returns, weights).to_list() == pytest.approx([-0.05, 0.2])


def test_leave_one_out_은_자기를_뺀_재정규화_평균() -> None:
    market = pd.Series([0.25 * 0.4 + 0.75 * 0.1], index=T[:1])
    loo = leave_one_out(market, pd.Series([0.4], index=T[:1]), pd.Series([0.25], index=T[:1]))
    assert loo.iloc[0] == pytest.approx(0.1)


def test_beta는_회귀_기울기를_되찾는다() -> None:
    rng = np.random.default_rng(1)
    m = pd.Series(rng.normal(0, 0.01, 20_000))
    coin = 1.5 * m + pd.Series(rng.normal(0, 0.005, 20_000))
    assert beta(coin, m) == pytest.approx(1.5, abs=0.02)
