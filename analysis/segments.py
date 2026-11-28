"""수익률 조각 (F-07, D-69): 표준화한 36시간 조각. 빈 시간과 상태 경계를 넘지 않는다.

엔진은 조각마다 12~36시간 길이와 시작 위치를 무작위로 골라 잘라 쓴다 (data-spec 4.2).
"""

from dataclasses import dataclass

import numpy as np
import pandas as pd

HOUR = pd.Timedelta(hours=1)


@dataclass(frozen=True)
class Segment:
    source: str
    points: tuple[float, ...]


def cut_segments(
    z: pd.Series, labels: pd.Series, length: int, source: str
) -> dict[str, list[Segment]]:
    """z(표준화한 수익률)를 상태별로 겹치지 않는 length시간 조각으로 자른다.

    한 조각 안의 시각은 1시간씩 이어지고 상태가 모두 같아야 한다. 남는 꼬리는 버린다.
    """
    joined = pd.concat([z.rename("z"), labels.rename("state")], axis=1, join="inner").dropna()
    out: dict[str, list[Segment]] = {}
    if joined.empty:
        return out
    index = joined.index.to_series()
    breaks = (index.diff() != HOUR) | (joined["state"] != joined["state"].shift())
    block = breaks.cumsum()
    for _, part in joined.groupby(block):
        state = str(part["state"].iloc[0])
        values = part["z"].to_numpy()
        for start in range(0, len(values) - length + 1, length):
            chunk = tuple(float(v) for v in values[start : start + length])
            out.setdefault(state, []).append(Segment(source, chunk))
    return out


def sample_pool(segments: list[Segment], limit: int, rng: np.random.Generator) -> list[Segment]:
    """limit개를 넘으면 고정 시드 난수로 뽑는다. 순서도 섞는다 (출처 코인 순서가 남지 않게)."""
    if len(segments) <= limit:
        order = rng.permutation(len(segments))
    else:
        order = rng.choice(len(segments), size=limit, replace=False)
    return [segments[i] for i in order]


def standardize_by_state(
    series: pd.Series, labels: pd.Series
) -> tuple[pd.Series, dict[str, float]]:
    """상태별 표준편차로 나눈다. 평균은 빼지 않는다 (상태별 흐름을 남김)."""
    joined = pd.concat([series.rename("x"), labels.rename("state")], axis=1, join="inner").dropna()
    std = joined.groupby("state")["x"].std(ddof=0).to_dict()
    scale = joined["state"].map(std)
    z = (joined["x"] / scale).where(scale > 0)
    return z.dropna(), {str(k): float(v) for k, v in std.items()}
