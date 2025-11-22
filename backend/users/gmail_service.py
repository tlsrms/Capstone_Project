import base64
import os
import pickle
import re

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from django.conf import settings
from html import unescape
from bs4 import BeautifulSoup  


def get_gmail_service_for_user(user):

    refresh_token = user.google_refresh_token  # ← 여기 꼭 이 이름으로!

    if not refresh_token:
        raise Exception("Gmail token not found. User must re-authenticate.")

    creds = Credentials(
        None,  # access_token은 None, refresh_token으로 새 토큰 받게 함
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.GOOGLE_OAUTH_CLIENT_ID,
        client_secret=settings.GOOGLE_OAUTH_CLIENT_SECRET,
        scopes=settings.GOOGLE_OAUTH2_SCOPES,
    )

    service = build("gmail", "v1", credentials=creds)
    return service


def list_messages_for_user(user, label_ids=None, max_results=10):
    service = get_gmail_service_for_user(user)
    label_ids = label_ids or ["INBOX"]

    results = (
        service.users()
        .messages()
        .list(
            userId="me",
            labelIds=label_ids,
            maxResults=max_results,
        )
        .execute()
    )
    return results.get("messages", [])


def get_message_detail_for_user(user, message_id):
    service = get_gmail_service_for_user(user)

    msg = (
        service.users()
        .messages()
        .get(userId="me", id=message_id, format="full")
        .execute()
    )
    return msg


def _decode_gmail_body(payload: dict) -> str:
    if "parts" in payload:
        for part in payload["parts"]:
            if part.get("mimeType") == "text/plain":
                data = part.get("body", {}).get("data")
                if data:
                    return base64.urlsafe_b64decode(data + "===").decode(
                        "utf-8", errors="ignore"
                    )

        for part in payload["parts"]:
            data = part.get("body", {}).get("data")
            if data:
                return base64.urlsafe_b64decode(data + "===").decode(
                    "utf-8", errors="ignore"
                )

    else:
        data = payload.get("body", {}).get("data")
        if data:
            return base64.urlsafe_b64decode(data + "===").decode(
                "utf-8", errors="ignore"
            )

    return ""


# users/gmail_service.py
import base64
import re
from html import unescape
from bs4 import BeautifulSoup  # 설치 필요: pip install beautifulsoup4

def extract_subject_and_body(message_data):
    """
    Gmail API 응답에서 제목(subject)과 본문(body)을 추출
    HTML을 텍스트로 변환
    """
    headers = message_data.get("payload", {}).get("headers", [])
    subject = ""
    
    # 제목 추출
    for header in headers:
        if header["name"].lower() == "subject":
            subject = header["value"]
            break
    
    # 본문 추출
    body_text = ""
    payload = message_data.get("payload", {})
    
    # 재귀적으로 part를 탐색하여 본문 찾기
    def get_body_from_parts(parts):
        body = ""
        for part in parts:
            mime_type = part.get("mimeType", "")
            
            # text/plain 우선
            if mime_type == "text/plain":
                data = part.get("body", {}).get("data", "")
                if data:
                    decoded = base64.urlsafe_b64decode(data).decode("utf-8", errors="ignore")
                    body += decoded
            
            # text/html (plain이 없을 경우)
            elif mime_type == "text/html":
                data = part.get("body", {}).get("data", "")
                if data:
                    decoded = base64.urlsafe_b64decode(data).decode("utf-8", errors="ignore")
                    # HTML을 텍스트로 변환
                    body += html_to_text(decoded)
            
            # multipart인 경우 재귀
            elif "multipart" in mime_type:
                sub_parts = part.get("parts", [])
                if sub_parts:
                    body += get_body_from_parts(sub_parts)
        
        return body
    
    # payload에 parts가 있으면
    if "parts" in payload:
        body_text = get_body_from_parts(payload["parts"])
    
    # parts가 없으면 body에서 직접 추출
    else:
        mime_type = payload.get("mimeType", "")
        data = payload.get("body", {}).get("data", "")
        
        if data:
            decoded = base64.urlsafe_b64decode(data).decode("utf-8", errors="ignore")
            
            if mime_type == "text/plain":
                body_text = decoded
            elif mime_type == "text/html":
                body_text = html_to_text(decoded)
    
    return subject, body_text.strip()


def html_to_text(html_content):
    """
    HTML을 읽기 쉬운 텍스트로 변환
    """
    try:
        # BeautifulSoup으로 HTML 파싱
        soup = BeautifulSoup(html_content, "html.parser")
        
        # script, style 태그 제거
        for script in soup(["script", "style"]):
            script.decompose()
        
        # 텍스트 추출
        text = soup.get_text()
        
        # 여러 줄바꿈을 하나로
        lines = (line.strip() for line in text.splitlines())
        chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
        text = '\n'.join(chunk for chunk in chunks if chunk)
        
        return text
        
    except Exception as e:
        print(f"[HTML to Text] Error: {e}")
        # 실패하면 HTML 태그만 제거
        return re.sub('<[^<]+?>', '', html_content)