# users/ai_client.py

from django.conf import settings
import requests

def analyze_text_with_ai(text: str):
    """
    text를 Ollama로 보내서 분석/요약 받아오는 함수
    (기존 프로젝트의 core.ai_client 로직이 있으면 그걸 import해서 써도 됨)
    """
    url = f"{settings.OLLAMA_BASE_URL}/api/generate"
    payload = {
        "model": settings.OLLAMA_MODEL_NAME,
        "prompt": text,
        "stream": False,
    }

    res = requests.post(url, json=payload, timeout=60)
    res.raise_for_status()
    return res.json().get("response", "")