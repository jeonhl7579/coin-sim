"""정제 테스트. 값을 알고 있는 합성 데이터만 쓴다 (실제 코인 이름 없음)."""

import math
from dataclasses import replace

import numpy as np
import pandas as pd
import pytest

from analysis.clean import (
    CleanParams,
    clean_all,
    clean_market,
    daily_quote_volume_median,
    drop_tick_limited_months,
    exchange_outage_hours,
    format_error,
    hourly_returns,
    missing_ratio,
    price_range,
)

T0 = pd.Timestamp("2024-01-01T00:00:00Z")


def make_candles(
    closes: list[float] | np.ndarray,
    hours: list[int] | None = None,
    quote_volume: float = 1e9,
    start: pd.Timestamp = T0,
) -> pd.DataFrame:
    """hours[i]시간 뒤의 캔들. 시가 = 고가 = 저가 = 종가 (형식 검사 통과)."""
    closes = np.asarray(closes, dtype="float64")
    hours = list(range(len(closes))) if hours is None else hours
    return pd.DataFrame(
        {
            "time": [start + pd.Timedelta(hours=h) for h in hours],
            "open": closes,
            "high": closes,
            "low": closes,
            "close": closes,
            "volume": 1.0,
            "quote_volume": quote_volume,
        }
    )


# 기준을 작게 줄인 매개변수 (최소 기간 10시간)
SMALL = replace(CleanParams(), start="2000-01-01T00:00:00Z", min_returns=10)


def volatile_closes(n: int, step: float = 0.02) -> np.ndarray:
    """번갈아 +step, -step 움직임 → 변동성은 step, 가격 범위는 작다"""
    signs = np.where(np.arange(n) % 2 == 0, 1 + step, 1 - step)
    return 100 * np.cumprod(signs)


def trending_closes(n: int, step: float = 0.05) -> np.ndarray:
    return 100 * (1 + step) ** np.arange(n)


class TestHourlyReturns:
    def test_연속된_시간만_수익률을_만든다(self) -> None:
        candles = make_candles([100, 110, 99, 120, 60], hours=[0, 1, 2, 5, 6])
        returns = hourly_returns(candles)
        # 2시 → 5시는 빈 시간을 넘으므로 없음
        assert list(returns.index) == [T0 + pd.Timedelta(hours=h) for h in (1, 2, 6)]
        assert returns.to_numpy() == pytest.approx([0.1, -0.1, -0.5])

    def test_캔들이_하나면_없음(self) -> None:
        assert len(hourly_returns(make_candles([100]))) == 0


class TestMetrics:
    def test_빈_시간_비율(self) -> None:
        assert missing_ratio(make_candles([1, 1, 1], hours=[0, 1, 9])) == pytest.approx(0.7)
        assert missing_ratio(make_candles([1, 1])) == 0

    def test_일_거래대금_중앙값은_UTC_날짜별_합의_중앙값(self) -> None:
        # 첫날 24시간 × 1, 둘째 날 2시간 × 10, 셋째 날 1시간 × 100
        hours = [*range(24), 24, 25, 48]
        candles = make_candles([1] * 27, hours=hours)
        candles["quote_volume"] = [1.0] * 24 + [10.0, 10.0, 100.0]
        assert daily_quote_volume_median(candles) == 24

    def test_가격_범위는_상위_1퍼센트_나누기_하위_1퍼센트(self) -> None:
        candles = make_candles(np.linspace(1, 3, 1001))
        assert price_range(candles) == pytest.approx(2.98 / 1.02)

    @pytest.mark.parametrize(
        ("column", "value", "message"),
        [
            ("low", 0.0, "0 이하"),
            ("high", 0.5, "고가 < 저가"),
            ("close", 9.0, "close이 고가·저가 범위 밖"),
            ("open", 0.9, "open이 고가·저가 범위 밖"),
        ],
    )
    def test_형식_오류(self, column: str, value: float, message: str) -> None:
        candles = make_candles([1.0, 1.0])
        candles.loc[1, column] = value
        assert message in (format_error(candles) or "")

    def test_형식이_맞으면_None(self) -> None:
        assert format_error(make_candles([1.0, 2.0])) is None


class TestCleanMarket:
    def test_기준을_모두_통과하면_수익률을_돌려준다(self) -> None:
        result = clean_market("KRW-AAA", make_candles(volatile_closes(20)), SMALL)
        assert result.excluded is None
        assert result.returns is not None and len(result.returns) == 19
        assert result.metrics["annualVol"] == pytest.approx(0.02 * math.sqrt(8760), rel=0.01)

    def test_시작_시각_이전은_버린다(self) -> None:
        params = replace(SMALL, start=str(T0 + pd.Timedelta(hours=10)))
        result = clean_market("KRW-AAA", make_candles(volatile_closes(30)), params)
        assert result.metrics["candles"] == 20
        assert result.returns is not None and result.returns.index[0] == T0 + pd.Timedelta(hours=11)

    def test_최소_기간_경계(self) -> None:
        assert clean_market("KRW-AAA", make_candles(volatile_closes(11)), SMALL).excluded is None
        assert (
            clean_market("KRW-AAA", make_candles(volatile_closes(10)), SMALL).excluded
            == "minPeriod"
        )

    def test_변동성도_가격_범위도_작으면_스테이블코인(self) -> None:
        stable = make_candles(volatile_closes(200, step=0.001))
        assert clean_market("KRW-AAA", stable, SMALL).excluded == "stablecoin"

    def test_변동성이_작아도_가격이_크게_움직이면_스테이블코인_아님(self) -> None:
        # 시간당 +0.1%씩 꾸준히 오름: 변동성 0, 가격 범위 큼
        drifting = make_candles(trending_closes(1000, step=0.001))
        assert clean_market("KRW-AAA", drifting, SMALL).excluded is None

    def test_거래대금_경계(self) -> None:
        closes = volatile_closes(48)
        # 하루 24시간 × 시간당 거래대금
        ok = make_candles(closes, quote_volume=1e8 / 24)
        low = make_candles(closes, quote_volume=1e8 / 24 * 0.99)
        assert clean_market("KRW-AAA", ok, SMALL).excluded is None
        assert clean_market("KRW-AAA", low, SMALL).excluded == "minQuoteVolume"

    def test_빈_시간_비율_경계(self) -> None:
        # 100시간 중 5시간이 빔(5%)은 통과, 6시간(6%)은 제외
        def with_missing(n: int) -> pd.DataFrame:
            hours = [h for h in range(100) if h not in range(50, 50 + n)]
            return make_candles(volatile_closes(len(hours)), hours=hours, quote_volume=1e9)

        assert clean_market("KRW-AAA", with_missing(5), SMALL).excluded is None
        assert clean_market("KRW-AAA", with_missing(6), SMALL).excluded == "maxMissingRatio"

    def test_형식_오류가_가장_먼저(self) -> None:
        candles = make_candles(volatile_closes(5))
        candles.loc[2, "high"] = 0.0
        result = clean_market("KRW-AAA", candles, SMALL)
        assert result.excluded == "invalidFormat"
        assert "formatError" in result.metrics


class TestExchangeOutage:
    def test_상장된_마켓이_모두_빈_시간만_센다(self) -> None:
        full = list(range(20))
        frames = {
            # 5~6시는 넷 다 빔(공백 2시간), 10시는 하나만 빔
            "A": make_candles([1] * 18, hours=[h for h in full if h not in (5, 6)]),
            "B": make_candles([1] * 18, hours=[h for h in full if h not in (5, 6)]),
            "C": make_candles([1] * 17, hours=[h for h in full if h not in (5, 6, 10)]),
            "D": make_candles([1] * 18, hours=[h for h in full if h not in (5, 6)]),
        }
        assert exchange_outage_hours(frames) == 2

    def test_상장된_마켓이_적으면_세지_않는다(self) -> None:
        frames = {
            "A": make_candles([1] * 9, hours=[0, 1, 2, 3, 5, 6, 7, 8, 9]),
            "B": make_candles([1] * 9, hours=[0, 1, 2, 3, 5, 6, 7, 8, 9]),
        }
        assert exchange_outage_hours(frames) == 0


def test_clean_all_이유별_제외_수와_사용_목록() -> None:
    frames = {
        "KRW-BBB": make_candles(volatile_closes(5)),
        "KRW-AAA": make_candles(volatile_closes(30)),
        "KRW-CCC": make_candles(volatile_closes(200, step=0.001)),
    }
    summary = clean_all(frames, SMALL)
    assert summary.used == ["KRW-AAA"]
    assert summary.excluded == {
        "invalidFormat": 0,
        "minPeriod": 1,
        "stablecoin": 1,
        "minQuoteVolume": 0,
        "maxMissingRatio": 0,
    }
    assert [r.market for r in summary.results] == ["KRW-AAA", "KRW-BBB", "KRW-CCC"]


class TestTickLimitedMonths:
    def test_가장_작은_움직임이_2퍼센트_이상인_달만_버린다(self) -> None:
        # 1월: ±3%씩만 움직임(칸을 건너뜀), 2월: ±0.5%와 0
        jan = [h for h in range(24 * 31)]
        feb = [h for h in range(24 * 31, 24 * 31 + 48)]
        closes = list(100 * np.cumprod(np.where(np.arange(len(jan)) % 2, 1.03, 1 / 1.03)))
        closes += list(closes[-1] * np.cumprod(np.where(np.arange(48) % 3 == 0, 1.0, 1.005)))
        returns = hourly_returns(make_candles(closes, hours=jan + feb))
        kept, dropped = drop_tick_limited_months(returns, 0.02)
        assert dropped == 1
        assert kept.index.min() >= pd.Timestamp("2024-02-01T00:00:00Z")
        assert len(kept) == 48

    def test_clean_market은_버린_달_수를_남기고_나머지로_판정한다(self) -> None:
        closes = list(100 * np.cumprod(np.where(np.arange(24 * 31) % 2, 1.03, 1 / 1.03)))
        closes += list(closes[-1] * volatile_closes(48, step=0.005) / 100)
        result = clean_market("KRW-AAA", make_candles(closes), SMALL)
        assert result.metrics["tickLimitedMonths"] == 1
        assert result.returns is not None
        assert result.returns.index.min() >= pd.Timestamp("2024-02-01T00:00:00Z")
