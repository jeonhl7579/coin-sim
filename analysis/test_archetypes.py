from analysis.archetypes import classify


def test_거래대금_순위_구간() -> None:
    volumes = {f"KRW-{i:02d}": float(100 - i) for i in range(20)}
    result = classify(volumes, leader_count=3, large_share=0.10, mid_share=0.30)
    counts = {
        a: sum(1 for v in result.values() if v == a) for a in ("leader", "large", "mid", "small")
    }
    # 상위 3 / ceil(2.0)=2 / ceil(6.0)=6 / 나머지 9
    assert counts == {"leader": 3, "large": 2, "mid": 6, "small": 9}
    assert result["KRW-00"] == "leader" and result["KRW-03"] == "large"
    assert result["KRW-05"] == "mid" and result["KRW-11"] == "small"


def test_같은_거래대금이면_마켓_코드_순() -> None:
    result = classify({"KRW-B": 1.0, "KRW-A": 1.0}, leader_count=1, large_share=0, mid_share=0)
    assert result == {"KRW-A": "leader", "KRW-B": "small"}
