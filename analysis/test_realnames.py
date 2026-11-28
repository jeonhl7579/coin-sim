"""실제 이름 해시. 고정 예시는 data-spec 5장과 같고, TS 구현(3번 작업)도 같은 값을 내야 한다."""

import pytest

from analysis.realnames import fnv1a32, name_hashes, normalize

VECTORS = [
    ("Coin Sim", "coinsim", 1311849331),
    ("가상 코인-1", "가상코인1", 1208305740),
    ("ＡＢＣ²", "abc2", 2553554107),
    ("Ünïcode Café", "ünïcodecafé", 548853471),
]


@pytest.mark.parametrize(("text", "normalized", "hashed"), VECTORS)
def test_고정_예시(text: str, normalized: str, hashed: int) -> None:
    assert normalize(text) == normalized
    assert fnv1a32(normalized) == hashed


def test_fnv1a32_표준값() -> None:
    # FNV-1a 32비트 공개 테스트 값
    assert fnv1a32("") == 0x811C9DC5
    assert fnv1a32("a") == 0xE40C292C


def test_name_hashes는_티커_한글_영문을_중복_없이_정렬() -> None:
    markets = [
        {"market": "KRW-AAA", "koreanName": "에이", "englishName": "Aaa"},
        {"market": "KRW-BBB", "koreanName": "  ", "englishName": "B-b b"},
    ]
    hashes = name_hashes(markets)
    # AAA와 Aaa는 정규화하면 같다. "  "는 빈 문자열이라 뺀다
    assert hashes == sorted({fnv1a32("aaa"), fnv1a32("에이"), fnv1a32("bbb")})
