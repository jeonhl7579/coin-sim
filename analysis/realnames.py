"""실제 코인 이름·티커 해시 (NFR-12, data-spec 5장, D-61).

읽을 수 있는 목록을 저장소에 두지 않으려고 정규화한 문자열의 FNV-1a 32비트 해시만 내보낸다.
엔진(TypeScript)도 같은 방식으로 해시해 가상 코인 이름 후보를 거른다. 두 구현은 data-spec 5장의
고정 예시로 맞춘다.
"""

import unicodedata
from collections.abc import Iterable

FNV_OFFSET = 0x811C9DC5
FNV_PRIME = 0x01000193


def normalize(text: str) -> str:
    """NFKC → 소문자 → 글자(유니코드 L*)와 숫자(N*)만 남긴다.

    TS: text.normalize('NFKC').toLowerCase().replace(/[^\\p{L}\\p{N}]/gu, '')
    """
    lowered = unicodedata.normalize("NFKC", text).lower()
    return "".join(ch for ch in lowered if unicodedata.category(ch)[0] in ("L", "N"))


def fnv1a32(text: str) -> int:
    """UTF-8 바이트의 FNV-1a 32비트 (부호 없는 정수)."""
    value = FNV_OFFSET
    for byte in text.encode("utf-8"):
        value ^= byte
        value = (value * FNV_PRIME) & 0xFFFFFFFF
    return value


def name_hashes(markets: Iterable[dict]) -> list[int]:
    """마켓마다 티커(KRW-XXX → XXX), 한글 이름, 영문 이름. 정규화 결과가 빈 문자열이면 뺀다."""
    out: set[int] = set()
    for market in markets:
        ticker = str(market["market"]).split("-", 1)[-1]
        for raw in (ticker, market["koreanName"], market["englishName"]):
            normalized = normalize(str(raw))
            if normalized:
                out.add(fnv1a32(normalized))
    return sorted(out)
