"""내보내기와 가공 기준 검사. 합성 시장으로 전체 흐름을 돌린다 (실제 이름 없음)."""

import gzip
import json
from dataclasses import replace

import pytest

import analysis.export as export
from analysis.export import (
    ExportError,
    assemble,
    check_shape,
    key_tree,
    make_fixture,
    round_sig,
    serialize,
    validate,
)
from analysis.stats import StatsParams, compute_all
from analysis.test_stats import CLEAN, synthetic_frames

PARAMS = replace(
    StatsParams(),
    regime_window=48,
    regime_enter=0.05,
    segment_hours=6,
    segments_per_pool=40,
    weight_window=24,
    weight_cap=0.5,
    leader_count=1,
    large_share=0.1,
    mid_share=0.1,
    crash_window=100,
    crash_threshold=-0.2,
    crash_recovery_hours=50,
    baseline_samples=200,
    bootstrap=50,
)
META = {
    "source": "upbit-krw-1h",
    "dataFrom": "2024-01-01T00:00:00Z",
    "dataUntil": "2024-05-05T00:00:00Z",
    "markets": {
        "collected": 6,
        "used": 6,
        "excluded": dict.fromkeys(export.EXCLUDE_KEYS, 0),
    },
    "archetypeCounts": {"leader": 1, "large": 1, "mid": 1, "small": 3, "crash": 3},
    "quantileGrid": [0, 1],
    "analysisParams": {"clean": {"start": "2000-01-01T00:00:00Z"}},
}


@pytest.fixture(scope="module")
def built():
    result = compute_all(synthetic_frames(), CLEAN, PARAMS)
    # 합성 시장은 코인이 6개라 그룹 크기 검사는 따로 본다
    return assemble(result.stats, META, [3, 1, 2]), result.report


def test_round_sig는_실수만_유효숫자_4자리() -> None:
    assert round_sig({"a": [0.000123456, 12345.678, 7, True]}) == {
        "a": [0.0001235, 12350.0, 7, True]
    }
    with pytest.raises(ExportError, match="NaN"):
        round_sig([float("nan")])


def test_조립한_통계는_스키마를_통과한다(built) -> None:
    stats, _ = built
    check_shape(stats, export.SCHEMA)
    assert stats["schemaVersion"] == 1
    assert stats["realNames"] == {
        "normalize": "nfkc-lower-alnum",
        "hash": "fnv1a32",
        "values": [3, 1, 2],
    }


def test_정의하지_않은_키가_있으면_실패(built) -> None:
    stats = json.loads(json.dumps(built[0]))
    stats["market"]["closePrice"] = 1.0
    with pytest.raises(ExportError, match="정의하지 않은 키"):
        check_shape(stats, export.SCHEMA)


def test_필수_키가_없으면_실패(built) -> None:
    stats = json.loads(json.dumps(built[0]))
    del stats["archetypes"]["crash"]["recovery"]
    with pytest.raises(ExportError, match="archetypes.crash.recovery: 없다"):
        check_shape(stats, export.SCHEMA)


def test_전파_키는_선택(built) -> None:
    stats = json.loads(json.dumps(built[0]))
    stats["propagation"] = {}
    check_shape(stats, export.SCHEMA)


def test_허용하지_않은_곳의_문자열은_실패(built) -> None:
    stats = json.loads(json.dumps(built[0]))
    stats["meta"]["note"] = "x"
    with pytest.raises(ExportError, match="meta.note"):
        export.check_strings(stats, set())


def test_실제_이름과_같은_문자열은_실패(built) -> None:
    stats = json.loads(json.dumps(built[0]))
    stats["meta"]["source"] = "Coin-Sim"
    with pytest.raises(ExportError, match="실제 코인"):
        export.check_strings(stats, {"coinsim"})


def test_그룹_코인이_3개_미만이면_실패(built) -> None:
    _, report = built
    small = {**report, "groupCounts": {**report["groupCounts"], "leader": 2}}
    with pytest.raises(ExportError, match="leader 그룹"):
        export.check_groups(small)


def test_gzip_2MB를_넘으면_실패(built, monkeypatch: pytest.MonkeyPatch) -> None:
    stats, report = built
    big = {**report, "groupCounts": dict.fromkeys(report["groupCounts"], 3)}
    big["pools"] = {"market": report["pools"]["market"]}
    big["crash"] = {"sources": 3, "pool": {"count": 1, "sources": 3}}
    monkeypatch.setattr(export, "MAX_GZIP_BYTES", 10)
    with pytest.raises(ExportError, match="gzip"):
        validate(stats, big, set())


def test_같은_입력이면_같은_바이트() -> None:
    a = compute_all(synthetic_frames(), CLEAN, PARAMS)
    b = compute_all(synthetic_frames(), CLEAN, PARAMS)
    assert serialize(assemble(a.stats, META, [1])) == serialize(assemble(b.stats, META, [1]))


def test_fixture는_구조가_같고_조각만_줄인다(built) -> None:
    stats, _ = built
    fixture = make_fixture(stats)
    assert key_tree(fixture) == key_tree(stats)
    assert all(
        len(pool) <= export.FIXTURE_SEGMENTS
        for a in ("leader", "small")
        for pool in fixture["archetypes"][a]["segments"].values()
    )
    assert len(fixture["archetypes"]["crash"]["segments"]) <= export.FIXTURE_SEGMENTS
    assert len(gzip.compress(serialize(fixture))) < len(gzip.compress(serialize(stats)))
