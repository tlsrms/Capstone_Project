# core/utils/bookmarks_parser.py

from typing import List, Dict, BinaryIO
from bs4 import BeautifulSoup


def extract_bookmarks_from_html(file_obj: BinaryIO) -> List[Dict[str, str]]:
    """
    브라우저에서 export한 북마크 HTML 파일에서
    (url, title) 리스트를 추출한다.

    return 예:
    [
      {"url": "https://example.com", "title": "Example Domain"},
      ...
    ]
    """
    # 파일 핸들을 처음부터 읽도록 위치 초기화
    file_obj.seek(0)
    raw = file_obj.read()

    # 파일이 InMemoryUploadedFile일 수도 있으니 bytes → str 변환
    if isinstance(raw, bytes):
        # 북마크 파일은 보통 utf-8, euc-kr 섞일 수 있어서 errors='ignore'
        text = raw.decode("utf-8", errors="ignore")
    else:
        text = raw

    soup = BeautifulSoup(text, "html.parser")

    items: List[Dict[str, str]] = []

    for a in soup.find_all("a"):
        href = a.get("href")
        if not href:
            continue

        # http(s) 링크만 사용하고 싶다면 필터
        if not (href.startswith("http://") or href.startswith("https://")):
            continue

        title = a.get_text(strip=True) or href

        items.append(
            {
                "url": href,
                "title": title,
            }
        )

    return items
