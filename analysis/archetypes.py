"""성격 분류 (F-09, D-71): 일 거래대금 중앙값 순위 구간. 변동성은 결과로 따라온다."""

import math

ARCHETYPES = ("leader", "large", "mid", "small")


def classify(
    volume_medians: dict[str, float],
    leader_count: int,
    large_share: float,
    mid_share: float,
) -> dict[str, str]:
    """거래대금 내림차순으로 상위 leader_count개 = leader, 다음 ceil(n·large_share)개 = large,
    다음 ceil(n·mid_share)개 = mid, 나머지 = small. 같은 거래대금이면 마켓 코드 순."""
    ordered = sorted(volume_medians, key=lambda m: (-volume_medians[m], m))
    n = len(ordered)
    large_end = leader_count + math.ceil(n * large_share)
    mid_end = large_end + math.ceil(n * mid_share)
    result: dict[str, str] = {}
    for rank, market in enumerate(ordered):
        if rank < leader_count:
            result[market] = "leader"
        elif rank < large_end:
            result[market] = "large"
        elif rank < mid_end:
            result[market] = "mid"
        else:
            result[market] = "small"
    return result
