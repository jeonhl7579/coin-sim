"""게임용 통계 내보내기와 가공 기준 검사 (F-04, data-spec 4장, D-56·D-80).

data/stats/stats.json은 배포하면 공개된다. 가공 기준(data-spec 4.3)을 하나라도 어기면 쓰지 않는다.
같은 원본이면 바이트 단위로 같은 파일이 나와야 한다 (D-62): 키 정렬, 유효숫자 고정, 고정 시드.
"""

import gzip
import json
import math
from typing import Any

SCHEMA_VERSION = 1
SOURCE = "upbit-krw-1h"
SIGNIFICANT_DIGITS = 4  # [임시값] (D-80)
MAX_GZIP_BYTES = 2_000_000  # NFR-07
MIN_GROUP_COINS = 3  # 가공 기준 5 (D-71)
FIXTURE_SEGMENTS = 2

STATES = ("bull", "bear", "sideways")
ARCHETYPES = ("leader", "large", "mid", "small")
EXCLUDE_KEYS = ("invalidFormat", "minPeriod", "pegged", "minQuoteVolume", "maxMissingRatio")

# 시각 문자열이 있어도 되는 곳 (가공 기준 3)
TIME_PATHS = {"meta.dataFrom", "meta.dataUntil", "meta.analysisParams.clean.start"}
# 문자열 값이 있어도 되는 곳 (가공 기준 2)
STRING_PATHS = TIME_PATHS | {"meta.source", "realNames.normalize", "realNames.hash"}


class ExportError(Exception):
    """가공 기준이나 형식 위반. 이 예외가 나면 파일을 쓰지 않는다."""


def round_sig(value: Any, digits: int = SIGNIFICANT_DIGITS) -> Any:
    """실수만 유효숫자 digits자리로. NaN·무한대는 예외."""
    if isinstance(value, bool) or isinstance(value, int):
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ExportError("NaN 또는 무한대가 있다")
        return float(f"{value:.{digits}g}")
    if isinstance(value, list | tuple):
        return [round_sig(v, digits) for v in value]
    if isinstance(value, dict):
        return {k: round_sig(v, digits) for k, v in value.items()}
    return value


# ── 형식 (가공 기준 1·4: 정의한 키만) ─────────────────────────

NUM = "num"
INT = "int"
STR = "str"
NUMS = ("list", NUM)
INTS = ("list", INT)
SEGMENTS = ("list", NUMS)
QUANT = {"p": NUMS, "v": NUMS}


def by_state(sub: Any) -> dict:
    return dict.fromkeys(STATES, sub)


def others(state: str) -> dict:
    return {s: NUM for s in STATES if s != state}


SHOCK = {"relativeFrequency": NUM, "upShare": NUM, "up": QUANT, "down": QUANT}
ARCHETYPE = {
    "beta": QUANT,
    "volatility": by_state(QUANT),
    "segments": by_state(SEGMENTS),
    "shock": SHOCK,
    "wick": by_state(QUANT),
}
SCHEMA: dict = {
    "schemaVersion": INT,
    "meta": {
        "source": STR,
        "dataFrom": STR,
        "dataUntil": STR,
        "markets": {"collected": INT, "used": INT, "excluded": dict.fromkeys(EXCLUDE_KEYS, INT)},
        "archetypeCounts": {**dict.fromkeys(ARCHETYPES, INT), "crash": INT},
        "quantileGrid": NUMS,
        "analysisParams": "any",
    },
    "regimes": {
        "duration": by_state(QUANT),
        "switch": {s: others(s) for s in STATES},
    },
    "market": {"volatility": by_state(NUM), "segments": by_state(SEGMENTS)},
    "archetypes": {
        **dict.fromkeys(ARCHETYPES, ARCHETYPE),
        "crash": {"drawdown": QUANT, "recovery": QUANT, "volatility": QUANT, "segments": SEGMENTS},
    },
    "marketShock": {"ratePer1000h": NUM, "upShare": NUM, "up": QUANT, "down": QUANT},
    # 데이터로 구분된 값만 있다 (D-75). 키 이름 뒤 ?는 선택
    "propagation": {
        "probability?": {f"{a}?": NUM for a in ARCHETYPES},
        "scope?": QUANT,
        "delay?": NUMS,
        "strength?": QUANT,
        "opposite?": NUM,
    },
    "realNames": {"normalize": STR, "hash": STR, "values": INTS},
}


def check_shape(value: Any, schema: Any, path: str = "") -> None:
    if schema == "any":
        return
    if schema == NUM:
        if isinstance(value, bool) or not isinstance(value, int | float):
            raise ExportError(f"{path}: 숫자가 아니다")
        return
    if schema == INT:
        if isinstance(value, bool) or not isinstance(value, int):
            raise ExportError(f"{path}: 정수가 아니다")
        return
    if schema == STR:
        if not isinstance(value, str):
            raise ExportError(f"{path}: 문자열이 아니다")
        return
    if isinstance(schema, tuple) and schema[0] == "list":
        if not isinstance(value, list):
            raise ExportError(f"{path}: 배열이 아니다")
        for i, item in enumerate(value):
            check_shape(item, schema[1], f"{path}[{i}]")
        return
    if not isinstance(value, dict):
        raise ExportError(f"{path}: 객체가 아니다")
    allowed = {k.rstrip("?"): k.endswith("?") for k in schema}
    extra = set(value) - set(allowed)
    if extra:
        raise ExportError(f"{path}: 정의하지 않은 키 {sorted(extra)}")
    for key, optional in allowed.items():
        sub = schema[f"{key}?" if optional else key]
        child = f"{path}.{key}" if path else key
        if key not in value:
            if not optional:
                raise ExportError(f"{child}: 없다")
            continue
        check_shape(value[key], sub, child)


# ── 문자열 (가공 기준 2·3) ────────────────────────────────────


def strings(value: Any, path: str = "") -> list[tuple[str, str]]:
    """(경로, 문자열 값). 배열 원소는 경로에서 인덱스를 뺀다."""
    if isinstance(value, str):
        return [(path, value)]
    if isinstance(value, list):
        return [item for v in value for item in strings(v, path)]
    if isinstance(value, dict):
        return [item for k, v in value.items() for item in strings(v, f"{path}.{k}" if path else k)]
    return []


def check_strings(stats: dict, real_names: set[str]) -> None:
    from analysis.realnames import normalize

    for path, text in strings(stats):
        if path not in STRING_PATHS:
            raise ExportError(f"{path}: 문자열이 있으면 안 되는 곳")
        if normalize(text) in real_names:
            raise ExportError(f"{path}: 실제 코인 이름·티커와 같은 문자열")


# ── 그룹·조각 출처 (가공 기준 5·6) ────────────────────────────


def check_groups(report: dict) -> None:
    for archetype, count in report["groupCounts"].items():
        if count < MIN_GROUP_COINS:
            raise ExportError(f"{archetype} 그룹 코인 {count}개 < {MIN_GROUP_COINS}")
    for group, pools in report["pools"].items():
        if group == "market":
            continue  # 시장 지수는 여러 코인을 합친 값
        for state, pool in pools.items():
            if pool["sources"] < MIN_GROUP_COINS:
                raise ExportError(f"{group}.{state} 조각 출처 {pool['sources']}개")
    crash = report["crash"]
    if crash["sources"] < MIN_GROUP_COINS or crash["pool"]["sources"] < MIN_GROUP_COINS:
        raise ExportError(f"crash 출처 {crash['sources']}개")


# ── 조립과 직렬화 ─────────────────────────────────────────────


def assemble(stats: dict, meta: dict, name_hashes: list[int]) -> dict:
    out = {
        "schemaVersion": SCHEMA_VERSION,
        "meta": meta,
        "regimes": stats["regimes"],
        "market": stats["market"],
        "archetypes": stats["archetypes"],
        "marketShock": stats["marketShock"],
        "propagation": stats["propagation"],
        "realNames": {"normalize": "nfkc-lower-alnum", "hash": "fnv1a32", "values": name_hashes},
    }
    return round_sig(out)


def serialize(stats: dict) -> bytes:
    return (
        json.dumps(stats, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n"
    ).encode("utf-8")


def gzip_size(data: bytes) -> int:
    # mtime=0: 크기만 재므로 시각이 들어가지 않게
    return len(gzip.compress(data, compresslevel=9, mtime=0))


def validate(stats: dict, report: dict, real_names: set[str]) -> bytes:
    """가공 기준 1~7을 모두 검사하고 직렬화한 바이트를 돌려준다. 어기면 ExportError."""
    check_shape(stats, SCHEMA)  # 1·4
    check_strings(stats, real_names)  # 2·3
    check_groups(report)  # 5·6
    data = serialize(stats)
    size = gzip_size(data)
    if size > MAX_GZIP_BYTES:  # 7
        raise ExportError(f"gzip {size}바이트 > {MAX_GZIP_BYTES}")
    return data


def make_fixture(stats: dict) -> dict:
    """같은 구조에서 조각 묶음마다 FIXTURE_SEGMENTS개, 이름 해시 10개만 남긴다."""
    fixture = json.loads(json.dumps(stats))

    def cut(pool: Any) -> Any:
        # segments는 조각 배열이거나 상태별 조각 배열
        if isinstance(pool, list):
            return pool[:FIXTURE_SEGMENTS]
        return {state: v[:FIXTURE_SEGMENTS] for state, v in pool.items()}

    def trim(node: Any) -> Any:
        if isinstance(node, dict):
            return {k: (cut(v) if k == "segments" else trim(v)) for k, v in node.items()}
        return node

    fixture = trim(fixture)
    fixture["realNames"]["values"] = fixture["realNames"]["values"][:10]
    return fixture


def key_tree(value: Any) -> Any:
    """구조 비교용: 객체는 키 → 하위 구조, 배열은 첫 원소의 구조, 값은 타입 이름."""
    if isinstance(value, dict):
        return {k: key_tree(v) for k, v in sorted(value.items())}
    if isinstance(value, list):
        return [key_tree(value[0])] if value else []
    return type(value).__name__
