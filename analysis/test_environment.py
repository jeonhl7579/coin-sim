import sys


def test_python_version_matches_python_version_file() -> None:
    # .python-version(3.12)과 실제 실행 환경이 같은지 지킨다
    assert sys.version_info[:2] == (3, 12)
