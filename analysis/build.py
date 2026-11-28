"""원본(data/raw/)에서 게임용 통계까지 한 번에 다시 만든다 (data-spec 7장).

실행: npm run stats  (= uv run --env-file .env python -m analysis.build)
쓰는 파일: data/stats/stats.json, tests/fixtures/stats.small.json
가공 기준(data-spec 4.3)을 하나라도 어기면 아무 파일도 쓰지 않고 종료 코드 1로 끝난다.
"""

import hashlib
import json
import sys
from dataclasses import asdict
from pathlib import Path

import pandas as pd

from analysis.clean import CleanParams
from analysis.export import (
    SCHEMA,
    SOURCE,
    ExportError,
    assemble,
    check_shape,
    gzip_size,
    make_fixture,
    serialize,
    validate,
)
from analysis.raw import RAW_DIR, ROOT
from analysis.realnames import name_hashes, normalize
from analysis.stats import AllStats, StatsParams, compute_all, read_frames

STATS_PATH = ROOT / "data" / "stats" / "stats.json"
FIXTURE_PATH = ROOT / "tests" / "fixtures" / "stats.small.json"


def iso(t: pd.Timestamp) -> str:
    return t.tz_convert("UTC").strftime("%Y-%m-%dT%H:%M:%SZ")


def build_meta(
    result: AllStats, frames: dict[str, pd.DataFrame], clean: CleanParams, params: StatsParams
) -> dict:
    start = pd.Timestamp(clean.start)
    used = result.summary.used
    firsts, lasts = [], []
    for market in used:
        times = frames[market]["time"]
        times = times[times >= start]
        firsts.append(times.iloc[0])
        lasts.append(times.iloc[-1])
    counts = result.report["groupCounts"]
    return {
        "source": SOURCE,
        "dataFrom": iso(min(firsts)),
        "dataUntil": iso(max(lasts)),
        "markets": {
            "collected": len(result.summary.results),
            "used": len(used),
            "excluded": result.summary.excluded,
        },
        "archetypeCounts": {**counts, "crash": result.report["crash"]["sources"]},
        "quantileGrid": list(params.quantile_grid),
        "analysisParams": {"clean": asdict(clean), "stats": asdict(params)},
    }


def write_atomic(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f"{path.name}.tmp")
    tmp.write_bytes(data)
    tmp.replace(path)


def build(frames: dict[str, pd.DataFrame], markets: list[dict]) -> tuple[bytes, bytes, dict]:
    """(stats.json 바이트, fixture 바이트, 요약). 가공 기준 위반이면 ExportError."""
    clean, params = CleanParams(), StatsParams()
    result = compute_all(frames, clean, params)
    real_names = {normalize(n) for m in markets for n in _names(m)} - {""}
    stats = assemble(result.stats, build_meta(result, frames, clean, params), name_hashes(markets))
    data = validate(stats, result.report, real_names)
    fixture = make_fixture(stats)
    check_shape(fixture, SCHEMA)
    return data, serialize(fixture), {"used": len(result.summary.used), "names": len(real_names)}


def _names(market: dict) -> list[str]:
    return [str(market["market"]).split("-", 1)[-1], market["koreanName"], market["englishName"]]


def main() -> int:
    markets = json.loads((RAW_DIR / "markets.json").read_text(encoding="utf-8"))["markets"]
    try:
        data, fixture, info = build(read_frames(), markets)
    except ExportError as error:
        print(f"[build] 가공 기준 위반으로 쓰지 않음: {error}", file=sys.stderr)
        return 1
    write_atomic(STATS_PATH, data)
    write_atomic(FIXTURE_PATH, fixture)
    digest = hashlib.sha256(data).hexdigest()[:16]
    print(
        f"[build] data/stats/stats.json {len(data) / 1e6:.2f}MB "
        f"(gzip {gzip_size(data) / 1e6:.2f}MB) "
        f"sha256 {digest}… · 사용 코인 {info['used']}개 · 실제 이름 {info['names']}개와 대조"
    )
    print(f"[build] tests/fixtures/stats.small.json {len(fixture) / 1e3:.0f}KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
