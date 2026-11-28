"""정제 (F-02, data-spec 4.4): 통계에 쓸 1시간 수익률을 만들고 기준에 맞지 않는 코인을 뺀다.

원칙: 값을 만들어 채우지 않는다. 빈 시간은 끊김으로 보고, 바로 앞 시간에 캔들이 있을 때만
수익률을 만든다 (D-64). 호가 단위 잡음이 있는 달의 수익률도 버린다 (D-76).

실행: uv run python -m analysis.clean  →  data/interim/clean_report.json (로컬, 실제 이름 포함)
"""

import json
import math
from dataclasses import asdict, dataclass, field

import pandas as pd

from analysis.raw import INTERIM_DIR, RAW_DIR, candle_dir, list_markets, read_candles

HOUR = pd.Timedelta(hours=1)
HOURS_PER_YEAR = 24 * 365


@dataclass(frozen=True)
class CleanParams:
    """정제 기준. [임시값]은 전체 수집 뒤 분포를 보고 다시 정한다 (progress.md)."""

    # 업비트 정식 서비스 시작 2017-10-24 00:00 KST. 이전 데이터는 버린다 (D-64)
    start: str = "2017-10-23T15:00:00Z"
    # 6개월 = 4,380시간 (F-02)
    min_returns: int = 4380
    # [임시값] 가격 고정형 자산(스테이블코인·실물 연동, D-79): 연환산 변동성 < 30% 또는
    # 종가 범위(상위 1% ÷ 하위 1%) < 1.5. 거래가 얇은 스테이블코인은 변동성이 튀어도 범위가 작다
    pegged_max_annual_vol: float = 0.30
    pegged_max_price_range: float = 1.5
    # [임시값] 일 거래대금 중앙값(UTC 날짜 기준, 원). 전체 데이터에서 하위 3개가 걸림 (D-79)
    min_daily_quote_volume: float = 3e8
    # [임시값] 첫~마지막 캔들 사이 빈 시간 비율
    max_missing_ratio: float = 0.05
    # [임시값] 호가 단위 잡음 (D-76): 그 달(UTC)의 0이 아닌 1시간 수익률 중 가장 작은 값이 이 값
    # 이상이면 가격이 호가 칸을 건너뛰는 달로 보고 그 달 수익률을 버린다
    tick_min_move: float = 0.02


# 제외 이유. 순서 = 필터 적용 순서 (data-spec 4.4 meta.markets.excluded의 키)
EXCLUDE_REASONS = (
    "invalidFormat",
    "minPeriod",
    "pegged",
    "minQuoteVolume",
    "maxMissingRatio",
)


@dataclass
class CleanResult:
    market: str
    # 통과하면 1시간 수익률(index = 그 시간 캔들의 time, UTC). 제외되면 None
    returns: pd.Series | None
    excluded: str | None
    metrics: dict[str, float | int | None] = field(default_factory=dict)


def hourly_returns(candles: pd.DataFrame) -> pd.Series:
    """종가 기준 단순 수익률. 바로 앞 시간에 캔들이 있을 때만 만든다 (빈 시간을 넘지 않음)."""
    time = candles["time"]
    close = candles["close"]
    consecutive = time.diff() == HOUR
    returns = (close / close.shift(1) - 1)[consecutive]
    returns.index = pd.DatetimeIndex(time[consecutive])
    return returns.rename("return")


def format_error(candles: pd.DataFrame) -> str | None:
    """형식 오류가 있으면 이유. 가격 0 이하, 고가 < 저가, 시가·종가가 고가·저가 범위 밖."""
    prices = candles[["open", "high", "low", "close"]]
    if (prices <= 0).to_numpy().any():
        return "가격이 0 이하"
    if (candles["high"] < candles["low"]).any():
        return "고가 < 저가"
    for column in ("open", "close"):
        outside = (candles[column] > candles["high"]) | (candles[column] < candles["low"])
        if outside.any():
            return f"{column}이 고가·저가 범위 밖"
    return None


def drop_tick_limited_months(returns: pd.Series, min_move: float) -> tuple[pd.Series, int]:
    """호가 단위가 커서 가격이 칸을 건너뛰는 달의 수익률을 버린다. (남은 수익률, 버린 달 수)"""
    month = pd.Series(returns.index.strftime("%Y-%m"), index=returns.index)
    nonzero = returns != 0
    smallest = returns[nonzero].abs().groupby(month[nonzero]).min()
    bad = smallest[smallest >= min_move].index
    keep = ~month.isin(bad)
    return returns[keep], len(bad)


def missing_ratio(candles: pd.DataFrame) -> float:
    if len(candles) == 0:
        return 0.0
    time = candles["time"]
    # 정수로 센 뒤 나눈다. 1 - 있는/기대 로 계산하면 정확히 5%가 0.05000000000000004가 된다
    expected = int((time.iloc[-1] - time.iloc[0]) // HOUR) + 1
    return (expected - len(candles)) / expected


def daily_quote_volume_median(candles: pd.DataFrame) -> float:
    daily = candles.groupby(candles["time"].dt.floor("D"))["quote_volume"].sum()
    return float(daily.median()) if len(daily) > 0 else 0.0


def annual_volatility(returns: pd.Series) -> float:
    return float(returns.std(ddof=0) * math.sqrt(HOURS_PER_YEAR)) if len(returns) > 1 else 0.0


def price_range(candles: pd.DataFrame) -> float:
    close = candles["close"]
    return float(close.quantile(0.99) / close.quantile(0.01)) if len(close) > 0 else 1.0


def clean_market(market: str, candles: pd.DataFrame, params: CleanParams) -> CleanResult:
    """필터를 EXCLUDE_REASONS 순서로 적용한다. 처음 걸린 이유 하나만 남긴다."""
    candles = candles[candles["time"] >= pd.Timestamp(params.start)].reset_index(drop=True)
    returns, tick_months = drop_tick_limited_months(hourly_returns(candles), params.tick_min_move)
    metrics: dict[str, float | int | None] = {
        "candles": len(candles),
        "returns": len(returns),
        "tickLimitedMonths": tick_months,
        "annualVol": round(annual_volatility(returns), 4),
        "priceRange": round(price_range(candles), 4),
        "dailyQuoteVolumeMedian": round(daily_quote_volume_median(candles)),
        "missingRatio": round(missing_ratio(candles), 4),
    }

    def excluded(reason: str) -> CleanResult:
        return CleanResult(market, None, reason, metrics)

    error = format_error(candles)
    if error is not None:
        return CleanResult(market, None, "invalidFormat", {**metrics, "formatError": error})
    if len(returns) < params.min_returns:
        return excluded("minPeriod")
    if (
        annual_volatility(returns) < params.pegged_max_annual_vol
        or price_range(candles) < params.pegged_max_price_range
    ):
        return excluded("pegged")
    if daily_quote_volume_median(candles) < params.min_daily_quote_volume:
        return excluded("minQuoteVolume")
    if missing_ratio(candles) > params.max_missing_ratio:
        return excluded("maxMissingRatio")
    return CleanResult(market, returns, None, metrics)


def exchange_outage_hours(frames: dict[str, pd.DataFrame], min_listed: int = 4) -> int:
    """그 시각에 상장돼 있던(첫~마지막 캔들 사이) 마켓이 min_listed개 이상이고, 모두 빈 시간 수."""
    listed: pd.Series | None = None
    present: pd.Series | None = None
    for candles in frames.values():
        if len(candles) == 0:
            continue
        time = candles["time"]
        span = pd.date_range(time.iloc[0], time.iloc[-1], freq="h")
        ones = pd.Series(1, index=span)
        has = pd.Series(0, index=span)
        has[pd.DatetimeIndex(time)] = 1
        listed = ones if listed is None else listed.add(ones, fill_value=0)
        present = has if present is None else present.add(has, fill_value=0)
    if listed is None or present is None:
        return 0
    return int(((listed >= min_listed) & (present == 0)).sum())


@dataclass
class CleanSummary:
    params: CleanParams
    used: list[str]
    excluded: dict[str, int]
    outage_hours: int
    results: list[CleanResult]


def clean_all(frames: dict[str, pd.DataFrame], params: CleanParams) -> CleanSummary:
    start = pd.Timestamp(params.start)
    trimmed = {
        market: candles[candles["time"] >= start].reset_index(drop=True)
        for market, candles in frames.items()
    }
    results = [clean_market(market, frames[market], params) for market in sorted(frames)]
    excluded = {reason: 0 for reason in EXCLUDE_REASONS}
    for result in results:
        if result.excluded is not None:
            excluded[result.excluded] += 1
    return CleanSummary(
        params=params,
        used=[r.market for r in results if r.excluded is None],
        excluded=excluded,
        outage_hours=exchange_outage_hours(trimmed),
        results=results,
    )


def report_dict(summary: CleanSummary) -> dict:
    return {
        "params": asdict(summary.params),
        "markets": {
            "collected": len(summary.results),
            "used": len(summary.used),
            "excluded": summary.excluded,
        },
        "exchangeOutageHours": summary.outage_hours,
        "results": [
            {"market": r.market, "excluded": r.excluded, **r.metrics} for r in summary.results
        ],
    }


def main() -> None:
    markets = list_markets(RAW_DIR)
    frames = {market: read_candles(candle_dir(RAW_DIR) / f"{market}.csv") for market in markets}
    summary = clean_all(frames, CleanParams())
    INTERIM_DIR.mkdir(parents=True, exist_ok=True)
    path = INTERIM_DIR / "clean_report.json"
    path.write_text(json.dumps(report_dict(summary), ensure_ascii=False, indent=2) + "\n")

    print(f"[clean] 마켓 {len(markets)}개 → 사용 {len(summary.used)}개, 제외 {summary.excluded}")
    print(f"[clean] 거래소 전체 공백 {summary.outage_hours}시간")
    for r in summary.results:
        m = r.metrics
        volume = (m["dailyQuoteVolumeMedian"] or 0) / 1e8
        print(
            f"[clean]   {r.market:<12} {r.excluded or '사용':<16} 수익률 {m['returns']:>6} "
            f"변동성 {m['annualVol']:.2f} 범위 {m['priceRange']:.2f} "
            f"일 거래대금 {volume:,.1f}억 빈 시간 {m['missingRatio']:.4f}"
        )
    print(f"[clean] → {path.relative_to(RAW_DIR.parent.parent)}")


if __name__ == "__main__":
    main()
