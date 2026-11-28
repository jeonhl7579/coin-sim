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
from analysis.crash import crash_episodes, wick_ratios
from analysis.market import beta, index_weights, leave_one_out, market_index
from analysis.raw import INTERIM_DIR, RAW_DIR, candle_dir, list_markets, read_candles
from analysis.regimes import STATES, centered_trend, label_regimes, runs, switch_ratios
from analysis.segments import Segment, cut_segments, sample_pool, standardize_by_state
from analysis.shocks import (
    PropagationParams,
    baseline_reactions,
    detect_events,
    make_grid,
    propagation_stats,
    react,
    shock_summary,
)


@dataclass(frozen=True)
class StatsParams:
    """[임시값]은 전체 수집 뒤 다시 확인한다 (progress.md)."""

    # 상태 구분 (D-68, D-79) [임시값]: 가운데 7일 창, 진입 ±11% (전체 데이터에서 횡보 약 45%)
    regime_window: int = 168
    regime_enter: float = 0.11
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
    # 급등락 (D-73) [임시값]: 개별 고유 움직임 ±8%, 시장 지수 ±4%, 12시간 안은 같은 사건
    shock_threshold: float = 0.08
    market_shock_threshold: float = 0.04
    event_cooldown_hours: int = 12
    # 전파 (D-74) [임시값]: 평소 변동성 2배 이상이면 반응, 시차 0~3시간, 기준선 표본 3,000개
    follow_z: float = 2.0
    max_lag: int = 3
    baseline_samples: int = 3000
    alpha: float = 0.05
    bootstrap: int = 200
    # 폭락형 (D-72·D-77) [임시값]: 고유 움직임 600시간 누적 −50% 이하, 코인당 최대 3구간,
    # 이후 300시간 회복 기록, 구간 안 수익률이 있는 시간 90% 이상
    crash_window: int = 600
    crash_threshold: float = -0.5
    crash_recovery_hours: int = 300
    crash_max_per_coin: int = 3
    crash_min_coverage: float = 0.9


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
    context: "CoreContext | None" = None


@dataclass
class CoreContext:
    """6.2b·6.2c가 이어서 쓰는 중간 값 (내보내지 않음)."""

    market: pd.Series
    labels: pd.Series
    archetype_of: dict[str, str]
    coin_beta: dict[str, float]
    coin_std: dict[str, dict[str, float]]
    idio: dict[str, pd.Series]
    returns: pd.DataFrame


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
    coin_idio: dict[str, pd.Series] = {}
    for m in used:
        loo = leave_one_out(market, returns[m], weights[m])
        b = beta(returns[m], loo)
        idio = (returns[m] - b * loo).dropna()
        z, std = standardize_by_state(idio, labels)
        coin_beta[m] = b
        coin_std[m] = std
        coin_idio[m] = idio
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
    context = CoreContext(market, labels, archetype_of, coin_beta, coin_std, coin_idio, returns)
    return CoreStats(stats, report, context)


def build_shocks(context: CoreContext, params: StatsParams) -> tuple[dict, dict]:
    """6.2b: 급등락 빈도·크기와 전파. (stats 조각, report) — stats는 data-spec 4.2 경로에 합친다."""
    grid = params.quantile_grid
    rng = np.random.default_rng(params.seed + 1)
    market_events = detect_events(
        context.market, params.market_shock_threshold, params.event_cooldown_hours
    )
    market_shock = shock_summary(market_events.tolist(), len(context.market), grid)

    coin_events: dict[str, pd.Series] = {}
    z: dict[str, pd.Series] = {}
    for coin, idio in context.idio.items():
        quiet = idio.drop(market_events.index, errors="ignore")
        coin_events[coin] = detect_events(
            quiet, params.shock_threshold, params.event_cooldown_hours
        )
        z[coin], _ = standardize_by_state(idio, context.labels)

    shock_by_archetype: dict[str, dict] = {}
    for archetype in ARCHETYPES:
        members = [c for c, a in context.archetype_of.items() if a == archetype]
        sizes = [v for c in members for v in coin_events[c].tolist()]
        hours = sum(len(context.idio[c]) for c in members)
        summary = shock_summary(sizes, hours, grid)
        shock_by_archetype[archetype] = {
            "relativeFrequency": summary["ratePer1000h"],
            "upShare": summary["upShare"],
            "up": summary["up"],
            "down": summary["down"],
        }

    table = make_grid(context.idio, z, context.coin_beta)
    pparams = PropagationParams(
        params.follow_z, params.max_lag, params.baseline_samples, params.alpha, params.bootstrap
    )
    positions: dict[int, set[int]] = {}
    reactions = []
    for col, coin in enumerate(table.coins):
        index = table.index.get_indexer(coin_events[coin].index)
        positions[col] = {int(i) for i in index if i >= 0}
        for pos, size in zip(index, coin_events[coin].tolist(), strict=True):
            if pos < 0:
                continue
            r = react(
                table, int(pos), col, float(np.sign(size)), size, params.follow_z, params.max_lag
            )
            if r.available >= pparams.min_available:
                reactions.append(r)
    baseline = baseline_reactions(table, positions, pparams, rng)
    propagation, propagation_report = propagation_stats(
        reactions, baseline, context.archetype_of, pparams, grid, rng
    )

    stats = {
        "archetypeShock": shock_by_archetype,
        "marketShock": market_shock,
        "propagation": propagation,
    }
    report = {
        "marketEvents": len(market_events),
        "coinEvents": {c: len(e) for c, e in coin_events.items()},
        "propagation": propagation_report,
    }
    return stats, report


def build_crash(
    context: CoreContext, frames: dict[str, pd.DataFrame], params: StatsParams
) -> tuple[dict, dict, dict]:
    """6.2c: (crash 성격 통계, 성격별 꼬리 통계, report)."""
    grid = params.quantile_grid
    rng = np.random.default_rng(params.seed + 2)
    episodes = []
    overall_std: dict[str, float] = {}
    for coin, idio in context.idio.items():
        overall_std[coin] = float(idio.std(ddof=0))
        episodes += crash_episodes(
            coin,
            idio,
            params.crash_window,
            params.crash_threshold,
            params.crash_recovery_hours,
            params.crash_max_per_coin,
            params.crash_min_coverage,
        )
    sources = sorted({e.source for e in episodes})
    pieces: list[Segment] = []
    for e in episodes:
        z = e.returns / overall_std[e.source]
        flat = pd.Series("crash", index=z.index)
        pieces += cut_segments(z, flat, params.segment_hours, e.source).get("crash", [])
    pool = sample_pool(pieces, params.segments_per_pool, rng)
    recoveries = [e.recovery for e in episodes if e.recovery is not None]
    crash = {
        "drawdown": quantiles([e.drawdown for e in episodes], grid),
        "recovery": quantiles(recoveries, grid),
        "volatility": quantiles([overall_std[c] for c in sources], grid),
        "segments": [list(seg.points) for seg in pool],
    }

    wick: dict[str, dict] = {}
    for archetype in ARCHETYPES:
        members = [c for c, a in context.archetype_of.items() if a == archetype]
        by_state: dict[str, list[np.ndarray]] = {s: [] for s in STATES}
        for coin in members:
            for state, values in wick_ratios(
                frames[coin], context.returns[coin].dropna(), context.labels
            ).items():
                by_state[state].append(values)
        wick[archetype] = {
            s: quantiles(np.concatenate(v) if v else np.array([]), grid)
            for s, v in by_state.items()
        }

    report = {
        "episodes": len(episodes),
        "sources": len(sources),
        "recoveryKnown": len(recoveries),
        "recoveryPositiveShare": float(np.mean([r > 0 for r in recoveries])) if recoveries else 0.0,
        "pool": pool_summary(pool),
        "bySource": {c: sum(1 for e in episodes if e.source == c) for c in sources},
        "years": pd.Series([e.end.year for e in episodes]).value_counts().sort_index().to_dict(),
    }
    return crash, wick, report


def merge_shocks(core_stats: dict, shock_stats: dict) -> dict:
    """data-spec 4.2 경로로 합친다: archetypes.<a>.shock, marketShock, propagation."""
    merged = json.loads(json.dumps(core_stats))
    for archetype, shock in shock_stats["archetypeShock"].items():
        merged["archetypes"][archetype]["shock"] = shock
    merged["marketShock"] = shock_stats["marketShock"]
    merged["propagation"] = shock_stats["propagation"]
    return merged


def print_shocks(stats: dict, report: dict) -> None:
    ms = stats["marketShock"]
    print(
        f"[stats] 시장 이벤트 {report['marketEvents']}개 "
        f"(1,000시간당 {ms['ratePer1000h']:.2f}, 상승 {ms['upShare']:.2f})"
    )
    for archetype, shock in stats["archetypeShock"].items():
        up = shock["up"]["v"]
        down = shock["down"]["v"]
        print(
            f"[stats]   {archetype:<7} 급등락 1,000시간당 {shock['relativeFrequency']:.2f} "
            f"상승 {shock['upShare']:.2f} "
            f"크기 중앙값 +{(up[4] if up else 0) * 100:.1f}% "
            f"/ -{(down[4] if down else 0) * 100:.1f}%"
        )
    p = report["propagation"]
    print(
        f"[stats] 전파: 사건 {p['events']}개, 기준선 반응률 {p['baselineReactRate']:.3f}, "
        f"오탐 {p['falsePositive']:.3f}, 전파된 사건 {p.get('propagatedEvents', 0)}"
    )
    for archetype, row in p["probability"].items():
        print(
            f"[stats]   {archetype:<7} 사건 {row['events']:>4} 전파 확률 {row['estimate']:+.3f} "
            f"구간 [{row['ci'][0]:+.3f}, {row['ci'][1]:+.3f}] "
            f"{'구분됨' if row['distinguished'] else '구분 안 됨 → config'}"
        )
    prop = stats["propagation"]
    for key in ("delay", "opposite"):
        if key in prop:
            print(f"[stats]   {key}: {prop[key]}")
    for key in ("scope", "strength"):
        if key in prop:
            print(f"[stats]   {key} 중앙값 {prop[key]['v'][4]:.3f}")
    print(f"[stats]   config로 넘김: {p['toConfig']}")


def print_crash(crash: dict, wick: dict, report: dict) -> None:
    d = crash["drawdown"]["v"]
    r = crash["recovery"]["v"]
    print(
        f"[stats] 폭락 구간 {report['episodes']}개 (코인 {report['sources']}개), "
        f"하락 중앙값 {d[4] * 100:.0f}% (최악 {d[0] * 100:.0f}%), "
        f"이후 300시간 회복 중앙값 {r[4] * 100:+.0f}% "
        f"(양수 비율 {report['recoveryPositiveShare']:.2f}), "
        f"조각 {report['pool']}"
    )
    print(f"[stats]   폭락 구간이 끝난 해 {report['years']}")
    for archetype, by_state in wick.items():
        text = " ".join(f"{s}={q['v'][4]:.2f}" for s, q in by_state.items() if q["v"])
        print(f"[stats]   꼬리 중앙값(÷ 1시간 변동성) {archetype:<7} {text}")


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


@dataclass
class AllStats:
    """6.2 전체 결과. stats는 data-spec 4.2 모양(내보내기 전), report는 로컬 확인용."""

    summary: CleanSummary
    core: CoreStats
    stats: dict
    report: dict


def compute_all(
    frames: dict[str, pd.DataFrame],
    clean_params: CleanParams | None = None,
    params: StatsParams | None = None,
) -> AllStats:
    clean_params = clean_params or CleanParams()
    params = params or StatsParams()
    summary = clean_all(frames, clean_params)
    core = build_core(summary, frames, params)
    if core.context is None:
        raise RuntimeError("build_core가 중간 값을 돌려주지 않았다")
    shock_stats, shock_report = build_shocks(core.context, params)
    stats = merge_shocks(core.stats, shock_stats)
    crash, wick, crash_report = build_crash(core.context, frames, params)
    stats["archetypes"]["crash"] = crash
    for archetype, by_state in wick.items():
        stats["archetypes"][archetype]["wick"] = by_state
    report = {
        **core.report,
        "shocks": shock_report,
        "crash": crash_report,
        "shockPrint": shock_stats,
        "wickPrint": wick,
    }
    return AllStats(summary, core, stats, report)


def read_frames() -> dict[str, pd.DataFrame]:
    return {m: read_candles(candle_dir(RAW_DIR) / f"{m}.csv") for m in list_markets(RAW_DIR)}


def main() -> None:
    result = compute_all(read_frames())
    INTERIM_DIR.mkdir(parents=True, exist_ok=True)
    path = INTERIM_DIR / "stats_preview.json"
    report = {k: v for k, v in result.report.items() if not k.endswith("Print")}
    path.write_text(
        json.dumps({"stats": result.stats, "report": report}, ensure_ascii=False) + "\n"
    )
    print_report(result.core)
    print_shocks(result.report["shockPrint"], result.report["shocks"])
    print_crash(
        result.stats["archetypes"]["crash"], result.report["wickPrint"], result.report["crash"]
    )
    print(f"[stats] → data/interim/{path.name} ({path.stat().st_size / 1e6:.1f}MB)")


if __name__ == "__main__":
    main()
