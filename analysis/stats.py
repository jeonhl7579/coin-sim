"""통계 추출 6.2a: 시장 지수, 상태, β, 변동성, 수익률 조각, 성격 분류 (data-spec 4.2).

실행: uv run python -m analysis.stats  →  data/interim/stats_preview.json (로컬, 실제 이름 포함)
게임용 data/stats/stats.json 내보내기와 가공 기준 검사는 7단계에서 한다.
"""

import json
from dataclasses import asdict, dataclass, field

import numpy as np
import pandas as pd

from analysis.archetypes import ARCHETYPES, classify
from analysis.clean import CleanParams, CleanSummary, clean_all
from analysis.market import beta, index_weights, leave_one_out, market_index
from analysis.raw import INTERIM_DIR, RAW_DIR, candle_dir, list_markets, read_candles
from analysis.regimes import STATES, centered_trend, label_regimes, runs, switch_ratios
from analysis.segments import Segment, cut_segments, sample_pool, standardize_by_state


@dataclass(frozen=True)
class StatsParams:
    """[임시값]은 전체 수집 뒤 다시 확인한다 (progress.md)."""

    # 상태 구분 (D-68) [임시값]: 가운데 7일 창, 진입 ±9% (데이터상 횡보 약 45%)
    regime_window: int = 168
    regime_enter: float = 0.09
    # 수익률 조각 (D-69) [임시값]: 36시간 저장, 엔진이 12~36시간으로 잘라 씀
    segment_hours: int = 36
    segments_per_pool: int = 770
    # 시장 지수 (D-70) [임시값]: 직전 30일 거래대금 가중, 코인당 15% 상한, 최소 3개
    weight_window: int = 720
    weight_cap: float = 0.15
    min_index_coins: int = 3
    # 성격 분류 (D-71) [임시값]: 상위 3개 / 다음 10% / 다음 30% / 나머지
    leader_count: int = 3
    large_share: float = 0.10
    mid_share: float = 0.30
    # 가공 기준 5 (data-spec 4.3) [임시값]: 그룹과 조각 묶음마다 출처 코인 최소 수
    min_group_coins: int = 3
    quantile_grid: tuple[float, ...] = (0.0, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 1.0)
    seed: int = 20261128


def quantiles(values: list[float] | np.ndarray, grid: tuple[float, ...]) -> dict:
    arr = np.asarray(values, dtype="float64")
    arr = arr[~np.isnan(arr)]
    if arr.size == 0:
        return {"p": list(grid), "v": []}
    return {"p": list(grid), "v": [float(v) for v in np.quantile(arr, grid)]}


@dataclass
class CoreStats:
    """6.2a 결과. stats는 data-spec 4.2 모양, report는 로컬 확인용 (실제 이름 포함)."""

    stats: dict
    report: dict = field(default_factory=dict)


def quote_volume_frame(
    frames: dict[str, pd.DataFrame], markets: list[str], start: str
) -> pd.DataFrame:
    begin = pd.Timestamp(start)
    columns = {}
    for market in markets:
        candles = frames[market]
        candles = candles[candles["time"] >= begin]
        columns[market] = candles.set_index("time")["quote_volume"]
    return pd.DataFrame(columns)


def pool_summary(pool: list[Segment]) -> dict:
    return {"count": len(pool), "sources": len({s.source for s in pool})}


def build_core(
    summary: CleanSummary, frames: dict[str, pd.DataFrame], params: StatsParams
) -> CoreStats:
    used = summary.used
    by_market = {r.market: r for r in summary.results}
    returns = pd.DataFrame({m: by_market[m].returns for m in used})
    volume = quote_volume_frame(frames, used, summary.params.start)
    rng = np.random.default_rng(params.seed)
    grid = params.quantile_grid

    # 시장 지수와 상태
    weights = index_weights(
        returns, volume, params.weight_window, params.weight_cap, params.min_index_coins
    )
    market = market_index(returns, weights)
    labels = label_regimes(centered_trend(market, params.regime_window), params.regime_enter)
    run_table = runs(labels)
    durations = {
        s: quantiles(run_table.loc[run_table["state"] == s, "hours"].to_numpy(), grid)
        for s in STATES
    }

    # 시장 조각
    market_z, market_std = standardize_by_state(market, labels)
    market_cut = cut_segments(market_z, labels, params.segment_hours, "market")
    market_pools = {
        s: sample_pool(market_cut.get(s, []), params.segments_per_pool, rng) for s in STATES
    }

    # 성격 분류와 코인별 β·고유 움직임
    medians = {m: float(by_market[m].metrics["dailyQuoteVolumeMedian"] or 0) for m in used}
    archetype_of = classify(medians, params.leader_count, params.large_share, params.mid_share)
    coin_beta: dict[str, float] = {}
    coin_std: dict[str, dict[str, float]] = {}
    coin_segments: dict[str, dict[str, list[Segment]]] = {}
    for m in used:
        loo = leave_one_out(market, returns[m], weights[m])
        b = beta(returns[m], loo)
        idio = (returns[m] - b * loo).dropna()
        z, std = standardize_by_state(idio, labels)
        coin_beta[m] = b
        coin_std[m] = std
        coin_segments[m] = cut_segments(z, labels, params.segment_hours, m)

    archetypes: dict[str, dict] = {}
    pool_report: dict[str, dict] = {}
    for a in ARCHETYPES:
        members = [m for m in used if archetype_of[m] == a]
        pools = {
            s: sample_pool(
                [seg for m in members for seg in coin_segments[m].get(s, [])],
                params.segments_per_pool,
                rng,
            )
            for s in STATES
        }
        archetypes[a] = {
            "beta": quantiles([coin_beta[m] for m in members], grid),
            "volatility": {
                s: quantiles([coin_std[m].get(s, np.nan) for m in members], grid) for s in STATES
            },
            "segments": {s: [list(seg.points) for seg in pools[s]] for s in STATES},
        }
        pool_report[a] = {s: pool_summary(pools[s]) for s in STATES}

    stats = {
        "regimes": {"duration": durations, "switch": switch_ratios(run_table)},
        "market": {
            "volatility": {s: market_std.get(s, float("nan")) for s in STATES},
            "segments": {s: [list(seg.points) for seg in market_pools[s]] for s in STATES},
        },
        "archetypes": archetypes,
    }
    shares = labels.value_counts(normalize=True).to_dict()
    group_counts = {a: sum(1 for m in used if archetype_of[m] == a) for a in ARCHETYPES}
    report = {
        "params": asdict(params),
        "marketIndex": {
            "hours": len(market),
            "annualVol": float(market.std(ddof=0) * np.sqrt(24 * 365)),
        },
        "regimeShare": {s: float(shares.get(s, 0)) for s in STATES},
        "regimeMeanReturn": {
            s: float(market.reindex(labels.index)[labels == s].mean()) for s in STATES
        },
        "runs": int(len(run_table)),
        "groupCounts": group_counts,
        "groupViolations": [a for a, n in group_counts.items() if n < params.min_group_coins],
        "pools": {
            "market": {s: pool_summary(market_pools[s]) for s in STATES},
            **pool_report,
        },
        "coins": {
            m: {"archetype": archetype_of[m], "beta": coin_beta[m], "idioStd": coin_std[m]}
            for m in used
        },
    }
    return CoreStats(stats, report)


def print_report(core: CoreStats) -> None:
    r = core.report
    s = core.stats
    print(
        f"[stats] 시장 지수 {r['marketIndex']['hours']}시간, "
        f"연환산 변동성 {r['marketIndex']['annualVol']:.2f}, 상태 구간 {r['runs']}개"
    )
    for state in STATES:
        d = s["regimes"]["duration"][state]["v"]
        print(
            f"[stats]   {state:<9} 비율 {r['regimeShare'][state]:.3f} "
            f"평균 {r['regimeMeanReturn'][state] * 100:+.3f}%/h "
            f"변동성 {s['market']['volatility'][state] * 100:.2f}%/h "
            f"지속 중앙값 {d[4]:.0f}h (최소 {d[0]:.0f}, 최대 {d[-1]:.0f}) "
            f"다음 {s['regimes']['switch'][state]}"
        )
    print(f"[stats] 그룹 코인 수 {r['groupCounts']}, 최소 미달 {r['groupViolations']}")
    for market, c in r["coins"].items():
        std = " ".join(f"{k}={v * 100:.2f}%" for k, v in sorted(c["idioStd"].items()))
        print(f"[stats]   {market:<10} {c['archetype']:<7} β {c['beta']:.2f}  고유 변동성 {std}")
    for group, pools in r["pools"].items():
        text = " ".join(f"{st}={p['count']}({p['sources']}개)" for st, p in pools.items())
        print(f"[stats]   조각 {group:<7} {text}")


def main() -> None:
    markets = list_markets(RAW_DIR)
    frames = {m: read_candles(candle_dir(RAW_DIR) / f"{m}.csv") for m in markets}
    summary = clean_all(frames, CleanParams())
    core = build_core(summary, frames, StatsParams())
    INTERIM_DIR.mkdir(parents=True, exist_ok=True)
    path = INTERIM_DIR / "stats_preview.json"
    path.write_text(
        json.dumps({"stats": core.stats, "report": core.report}, ensure_ascii=False) + "\n"
    )
    print_report(core)
    print(f"[stats] → data/interim/{path.name} ({path.stat().st_size / 1e6:.1f}MB)")


if __name__ == "__main__":
    main()
