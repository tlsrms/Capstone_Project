from typing import Optional, Dict
import requests
from bs4 import BeautifulSoup


DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0 Safari/537.36"
    )
}


def fetch_html(url: str, timeout: int = 10) -> Optional[str]:
    """
    주어진 URL에서 HTML을 가져온다.
    - 성공: HTML 문자열
    - 실패: None
    """
    try:
        resp = requests.get(url, headers=DEFAULT_HEADERS, timeout=timeout)
        resp.raise_for_status()  # 4xx, 5xx 에러 시 예외
        # encoding이 제대로 지정 안 돼 있는 경우 대비
        resp.encoding = resp.apparent_encoding
        return resp.text
    except requests.RequestException as e:
        print(f"[WebScraper] 요청 실패: {url} ({e})")
        return None


def extract_text_from_html(html: str) -> Dict[str, str]:
    """
    HTML에서 title과 본문 텍스트를 추출한다.
    반환:
      {
        "title": "...",
        "text": "본문 전체 텍스트 ...",
      }
    """
    soup = BeautifulSoup(html, "html.parser")

    # 1) title 추출
    if soup.title and soup.title.string:
        title = soup.title.string.strip()
    else:
        title = ""

    # 2) script, style, nav 등 텍스트에 필요 없는 것 제거
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()

    # (선택) header/footer/nav 같은 레이아웃 태그도 날리고 싶으면:
    # for tag in soup(["header", "footer", "nav", "aside"]):
    #     tag.decompose()

    # 3) body 기준으로 텍스트 추출 (없으면 전체에서 추출)
    body = soup.body if soup.body else soup
    raw_text = body.get_text(separator="\n")

    # 4) 라인 정리 (공백 줄 제거, 양 끝 공백 제거)
    lines = [line.strip() for line in raw_text.splitlines()]
    lines = [line for line in lines if line]  # 빈 줄 제거

    text = "\n".join(lines)

    return {
        "title": title,
        "text": text,
    }


def scrape_url(url: str) -> Optional[Dict[str, str]]:
    """
    URL 하나에 대해 전체 스크레이핑 수행:
    - HTML fetch
    - 텍스트 추출
    - 실패 시 None
    """
    html = fetch_html(url)
    if html is None:
        return None

    data = extract_text_from_html(html)
    data["url"] = url  # 편의를 위해 URL도 같이 넣어줌
    return data
