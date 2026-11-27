"""수집 원본(data/raw/) 읽기. 형식은 data-spec 2.4."""

from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
INTERIM_DIR = ROOT / "data" / "interim"

CSV_COLUMNS = ["time", "open", "high", "low", "close", "volume", "quote_volume"]


def candle_dir(raw_dir: Path) -> Path:
    return raw_dir / "candles" / "1h"


def list_markets(raw_dir: Path) -> list[str]:
    """CSV가 있는 마켓 코드, 오름차순. 상장 폐지로 목록에서 빠진 마켓의 CSV도 포함한다."""
    folder = candle_dir(raw_dir)
    if not folder.is_dir():
        return []
    return sorted(path.stem for path in folder.glob("*.csv"))


def read_candles(path: Path) -> pd.DataFrame:
    """캔들 CSV를 읽는다. time은 UTC datetime, 나머지는 float64. 헤더가 다르면 예외."""
    with path.open(encoding="utf-8") as file:
        header = file.readline().strip()
    if header != ",".join(CSV_COLUMNS):
        raise ValueError(f"{path.name}: 헤더가 다르다")
    candles = pd.read_csv(
        path,
        dtype={column: "float64" for column in CSV_COLUMNS[1:]},
        parse_dates=["time"],
    )
    candles["time"] = pd.to_datetime(candles["time"], utc=True)
    return candles
