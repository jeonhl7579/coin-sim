from pathlib import Path

import pandas as pd
import pytest

from analysis.raw import CSV_COLUMNS, candle_dir, list_markets, read_candles


def write_csv(raw_dir: Path, market: str, rows: list[str], header: str | None = None) -> Path:
    folder = candle_dir(raw_dir)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{market}.csv"
    path.write_text("\n".join([header or ",".join(CSV_COLUMNS), *rows]) + "\n", encoding="utf-8")
    return path


def test_list_markets_csv만_오름차순(tmp_path: Path) -> None:
    write_csv(tmp_path, "KRW-CCC", [])
    write_csv(tmp_path, "KRW-AAA", [])
    (candle_dir(tmp_path) / "KRW-BBB.csv.tmp-1").write_text("")
    assert list_markets(tmp_path) == ["KRW-AAA", "KRW-CCC"]


def test_list_markets_폴더가_없으면_빈_목록(tmp_path: Path) -> None:
    assert list_markets(tmp_path) == []


def test_read_candles_시각은_UTC_숫자는_float(tmp_path: Path) -> None:
    path = write_csv(
        tmp_path,
        "KRW-AAA",
        ["2024-01-01T00:00:00Z,1,2,0.5,1.5,1e-7,1000", "2024-01-01T01:00:00Z,1.5,2,1,2,3,4"],
    )
    candles = read_candles(path)
    assert list(candles.columns) == CSV_COLUMNS
    assert candles["time"].iloc[0] == pd.Timestamp("2024-01-01T00:00:00Z")
    assert str(candles["time"].dt.tz) == "UTC"
    assert candles["volume"].iloc[0] == 1e-7
    assert candles["close"].dtype == "float64"


def test_read_candles_헤더가_다르면_예외(tmp_path: Path) -> None:
    path = write_csv(tmp_path, "KRW-AAA", [], header="time,close")
    with pytest.raises(ValueError, match="헤더가 다르다"):
        read_candles(path)
