"""급등락과 전파 (F-11, D-73~D-75).

- 개별 코인 급등락: 고유 움직임(코인 − β × 자기를 뺀 지수)이 ±threshold 이상.
  시장 이벤트 시각은 뺀다.
- 시장 이벤트: 시장 지수가 ±market_threshold 이상.
- 같은 대상에서 cooldown시간 안의 급등락은 같은 사건 (크기 = 첫 시간 값).
- 전파: 사건 뒤 시차 0~max_lag시간에 다른 코인의 고유 움직임이 평소 변동성의
  follow_z배 이상이면 반응.
  급등락이 없는 무작위 시각의 반응률(기준선)을 빼서 순수 전파만 남긴다. 부트스트랩 95% 구간이
  0을 넘지 않는 값은 데이터로 구분되지 않은 것으로 보고 통계에 넣지 않는다 (config [임시값]).
"""

import math
from dataclasses import dataclass

import numpy as np
import pandas as pd

HOUR = pd.Timedelta(hours=1)


def detect_events(x: pd.Series, threshold: float, cooldown_hours: int) -> pd.Series:
    """|x| ≥ threshold인 시각. 앞 사건 뒤 cooldown시간 안은 같은 사건이라 건너뛴다."""
    hits = x[x.abs() >= threshold].sort_index()
    cooldown = pd.Timedelta(hours=cooldown_hours)
    times: list[pd.Timestamp] = []
    values: list[float] = []
    for t, v in hits.items():
        if times and t - times[-1] < cooldown:
            continue
        times.append(t)
        values.append(float(v))
    return pd.Series(values, index=pd.DatetimeIndex(times, tz="UTC"), dtype="float64")


def shock_summary(sizes: list[float], hours: int, grid: tuple[float, ...]) -> dict:
    """빈도(1,000시간당 사건 수), 상승 비율, 방향별 크기(절댓값) 분위수."""
    arr = np.asarray(sizes, dtype="float64")
    up = arr[arr > 0]
    down = -arr[arr < 0]

    def q(values: np.ndarray) -> dict:
        v = [float(x) for x in np.quantile(values, grid)] if values.size else []
        return {"p": list(grid), "v": v}

    return {
        "ratePer1000h": float(arr.size / hours * 1000) if hours else 0.0,
        "upShare": float(up.size / arr.size) if arr.size else 0.5,
        "up": q(up),
        "down": q(down),
    }


def binom_sf(k: int, n: int, p: float) -> float:
    """P(X ≥ k), X ~ Binomial(n, p). 정확한 합 (n이 수백 이하)."""
    if k <= 0:
        return 1.0
    if k > n:
        return 0.0
    if p <= 0:
        return 0.0
    if p >= 1:
        return 1.0
    log_p, log_q = math.log(p), math.log1p(-p)
    lg = math.lgamma
    terms = [
        lg(n + 1) - lg(i + 1) - lg(n - i + 1) + i * log_p + (n - i) * log_q for i in range(k, n + 1)
    ]
    top = max(terms)
    return float(min(1.0, math.exp(top) * sum(math.exp(t - top) for t in terms)))


@dataclass
class Reaction:
    """사건 하나에서 다른 코인들의 반응."""

    origin: str
    sign: float
    size: float
    available: int
    reacted: int
    # 시차별 반응 코인 수 (첫 반응이 아니라 그 시차에 넘은 코인 수)
    by_lag: np.ndarray
    same: int
    opposite: int
    # 같은 방향 반응의 세기 = 반응 크기 ÷ (원래 충격 × 받는 코인 β)
    strengths: list[float]


@dataclass
class Grid:
    """시간 격자 위의 z(표준화한 고유 움직임)와 x(고유 움직임). 행 = 시각, 열 = 코인."""

    index: pd.DatetimeIndex
    coins: list[str]
    z: np.ndarray
    x: np.ndarray
    betas: np.ndarray


def make_grid(idio: dict[str, pd.Series], z: dict[str, pd.Series], betas: dict[str, float]) -> Grid:
    coins = sorted(idio)
    start = min(s.index.min() for s in idio.values())
    end = max(s.index.max() for s in idio.values())
    index = pd.date_range(start, end, freq="h")
    zf = pd.DataFrame({c: z[c] for c in coins}).reindex(index)
    xf = pd.DataFrame({c: idio[c] for c in coins}).reindex(index)
    return Grid(
        index,
        coins,
        zf.to_numpy(dtype="float64"),
        xf.to_numpy(dtype="float64"),
        np.array([betas[c] for c in coins], dtype="float64"),
    )


def react(
    grid: Grid, pos: int, origin: int, sign: float, size: float, follow_z: float, max_lag: int
) -> Reaction:
    lags = max_lag + 1
    block = grid.z[pos : pos + lags]
    xblock = grid.x[pos : pos + lags]
    if block.shape[0] < lags:
        pad = np.full((lags - block.shape[0], block.shape[1]), np.nan)
        block = np.vstack([block, pad])
        xblock = np.vstack([xblock, pad])
    others = np.ones(block.shape[1], dtype=bool)
    others[origin] = False
    available = others & ~np.isnan(block[0])
    hit = (np.abs(np.nan_to_num(block, nan=0.0)) >= follow_z) & available
    any_hit = hit.any(axis=0)
    first = np.argmax(hit, axis=0)
    cols = np.nonzero(any_hit)[0]
    first_z = block[first[cols], cols]
    first_x = xblock[first[cols], cols]
    same_mask = np.sign(first_z) == sign
    strengths = [
        float(fx / (size * b))
        for fx, b in zip(first_x[same_mask], grid.betas[cols][same_mask], strict=True)
        if size * b != 0
    ]
    return Reaction(
        origin=grid.coins[origin],
        sign=sign,
        size=size,
        available=int(available.sum()),
        reacted=int(any_hit.sum()),
        by_lag=hit.sum(axis=1).astype("float64"),
        same=int(same_mask.sum()),
        opposite=int((~same_mask).sum()),
        strengths=strengths,
    )


@dataclass(frozen=True)
class PropagationParams:
    follow_z: float
    max_lag: int
    baseline_samples: int
    alpha: float
    bootstrap: int
    min_available: int = 3


def baseline_reactions(
    grid: Grid,
    event_positions: dict[int, set[int]],
    params: PropagationParams,
    rng: np.random.Generator,
) -> list[Reaction]:
    """급등락이 없는 조용한 시각(원래 코인 |z| < follow_z)을 무작위로 골라 같은 계산을 한다."""
    out: list[Reaction] = []
    rows, cols = grid.z.shape
    tries = 0
    while len(out) < params.baseline_samples and tries < params.baseline_samples * 50:
        tries += 1
        pos = int(rng.integers(0, rows))
        col = int(rng.integers(0, cols))
        value = grid.z[pos, col]
        if np.isnan(value) or abs(value) >= params.follow_z:
            continue
        near = event_positions.get(col, set())
        if any(abs(pos - p) <= params.max_lag for p in near):
            continue
        sign = 1.0 if rng.random() < 0.5 else -1.0
        r = react(grid, pos, col, sign, sign * 0.1, params.follow_z, params.max_lag)
        if r.available >= params.min_available:
            out.append(r)
    return out


def propagated_flags(reactions: list[Reaction], base_rate: float, alpha: float) -> np.ndarray:
    """기준선보다 반응 코인이 유의하게 많은 사건 (한쪽 이항 검정)."""
    return np.array(
        [binom_sf(r.reacted, r.available, base_rate) < alpha for r in reactions], dtype=bool
    )


def bootstrap_interval(
    values: np.ndarray, rng: np.random.Generator, reps: int, shift: float = 0.0
) -> tuple[float, float]:
    if values.size == 0:
        return (float("nan"), float("nan"))
    means = [float(values[rng.integers(0, values.size, values.size)].mean()) for _ in range(reps)]
    return (float(np.quantile(means, 0.025) - shift), float(np.quantile(means, 0.975) - shift))


def propagation_stats(
    events: list[Reaction],
    baseline: list[Reaction],
    archetype_of: dict[str, str],
    params: PropagationParams,
    grid_q: tuple[float, ...],
    rng: np.random.Generator,
) -> tuple[dict, dict]:
    """(stats, report). stats에는 데이터로 구분된 값만 넣는다."""
    base_reacted = sum(r.reacted for r in baseline)
    base_avail = sum(r.available for r in baseline)
    base_rate = base_reacted / base_avail if base_avail else 0.0
    base_by_lag = (
        sum((r.by_lag for r in baseline), np.zeros(params.max_lag + 1)) / base_avail
        if base_avail
        else np.zeros(params.max_lag + 1)
    )
    false_positive = (
        float(propagated_flags(baseline, base_rate, params.alpha).mean()) if baseline else 0.0
    )
    flags = propagated_flags(events, base_rate, params.alpha)

    report: dict = {
        "events": len(events),
        "baselineSamples": len(baseline),
        "baselineReactRate": base_rate,
        "baselineByLag": [float(v) for v in base_by_lag],
        "falsePositive": false_positive,
        "probability": {},
    }
    stats: dict = {}

    # 전파 확률: 충격 발생 코인의 성격별 (사건 비율 − 기준선 오탐 비율)
    probability: dict[str, float] = {}
    for archetype in sorted({archetype_of[e.origin] for e in events}):
        mask = np.array([archetype_of[e.origin] == archetype for e in events])
        sample = flags[mask].astype("float64")
        estimate = float(sample.mean() - false_positive)
        low, high = bootstrap_interval(sample, rng, params.bootstrap, false_positive)
        report["probability"][archetype] = {
            "events": int(mask.sum()),
            "estimate": estimate,
            "ci": [low, high],
            "distinguished": bool(low > 0),
        }
        if low > 0:
            probability[archetype] = max(0.0, estimate)
    if probability:
        stats["probability"] = probability

    chosen = [e for e, f in zip(events, flags, strict=True) if f]
    report["propagatedEvents"] = len(chosen)
    if not probability or not chosen:
        report["toConfig"] = ["probability", "scope", "delay", "strength", "opposite", "noEffect"]
        return stats, report

    # 범위: 기준선을 뺀 반응 비율
    scopes = np.clip(
        [((e.reacted / e.available) - base_rate) / (1 - base_rate) for e in chosen], 0, 1
    )
    stats["scope"] = {"p": list(grid_q), "v": [float(v) for v in np.quantile(scopes, grid_q)]}

    # 시점: 시차별 반응률에서 기준선을 뺀 몫의 비율
    avail = sum(e.available for e in chosen)
    by_lag = sum((e.by_lag for e in chosen), np.zeros(params.max_lag + 1)) / avail
    excess = np.clip(by_lag - base_by_lag, 0, None)
    if excess.sum() > 0:
        stats["delay"] = [float(v) for v in excess / excess.sum()]
    report["delayRaw"] = {"byLag": [float(v) for v in by_lag], "excess": [float(v) for v in excess]}

    # 세기: 같은 방향 반응의 크기 비율
    strengths = np.array([s for e in chosen for s in e.strengths])
    if strengths.size:
        stats["strength"] = {
            "p": list(grid_q),
            "v": [float(v) for v in np.quantile(strengths, grid_q)],
        }

    # 반대 방향: 우연한 반응(기준선, 방향 반반)을 뺀 반응 중 반대 방향 비율
    reacted = sum(e.reacted for e in chosen)
    opposite = sum(e.opposite for e in chosen)
    noise = base_rate * avail
    true_reacted = reacted - noise
    if true_reacted > 0:
        stats["opposite"] = float(np.clip((opposite - noise / 2) / true_reacted, 0, 1))
    report["opposite"] = {"reacted": reacted, "opposite": opposite, "noise": noise}
    # 전파 대상이 되었지만 영향이 없는 경우는 "대상이 아님"과 데이터로 구분할 수 없다
    report["toConfig"] = ["noEffect"] + [
        k for k in ("delay", "strength", "opposite") if k not in stats
    ]
    return stats, report
