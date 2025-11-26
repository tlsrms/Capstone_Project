# users/views.py

from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import redirect

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.authentication import JWTAuthentication

from google.oauth2 import id_token
from google.auth.transport import requests as grequests
from .google_oauth import create_google_flow

from .models import CustomUser
from .serializers import RegisterSerializer, LoginSerializer, UserSerializer
from .google_oauth import create_google_flow
from .gmail_service import (
    list_messages_for_user,
    get_message_detail_for_user,
    extract_subject_and_body,
)
from .ai_client import analyze_text_with_ai


# --------------------
# 회원가입 / 로그인 / 내 정보
# --------------------

class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data["user"]
        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "user": UserSerializer(user).data,
                "access": str(refresh.access_token),
                "refresh": str(refresh),
            },
            status=status.HTTP_200_OK,
        )


class MeView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request):
        user = request.user
        serializer = UserSerializer(user, data=request.data, partial=True)

        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# --------------------
# Gmail 연동 (목록 / 상세 / 분석)
# --------------------

class GmailMessageDetailView(APIView):
    """
    GET /api/auth/gmail/messages/<message_id>/
    Gmail 메일 한 개의 전체 내용 가져오기
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request, message_id):
        user = request.user
        try:
            msg = get_message_detail_for_user(user, message_id)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(msg, status=status.HTTP_200_OK)

''' 필요없는거 같은디
class GmailMessageAnalyzeView(APIView):
    """
    POST /api/auth/gmail/messages/<message_id>/analyze/
    Gmail 메일(제목 + 본문)을 AI 엔진으로 분석하기
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, message_id):
        user = request.user

        # 1) Gmail 메시지 가져오기
        try:
            msg = get_message_detail_for_user(user, message_id)
        except Exception as e:
            return Response(
                {"detail": "Failed to fetch Gmail message", "error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # 2) 제목 + 본문 추출
        subject, body_text = extract_subject_and_body(msg)

        if not body_text:
            return Response(
                {"detail": "Email body is empty"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 3) 본문 길이 제한 (중요!)
        MAX_BODY_LENGTH = 2000
        original_length = len(body_text)
        
        if len(body_text) > MAX_BODY_LENGTH:
            body_text = body_text[:MAX_BODY_LENGTH]
            print(f"[Analyze] Truncated: {original_length} -> {MAX_BODY_LENGTH}")

        # 4) 프롬프트 작성
        prompt = (
            f"Summarize this email in 3-5 bullet points.\n\n"
            f"Subject: {subject}\n\n"
            f"Body: {body_text}\n\n"
            f"Summary:"
        )

        # 5) AI 호출
        try:
            print(f"[Analyze] Calling AI for message {message_id}")
            analysis = analyze_text_with_ai(prompt, timeout=300)
            print(f"[Analyze] AI response received")
        except Exception as e:
            print(f"[Analyze] AI Error: {str(e)}")
            return Response(
                {"detail": "Failed to call AI engine", "error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # 6) 결과 반환
        return Response(
            {
                "subject": subject,
                "body_preview": body_text[:300],
                "analysis": analysis,
                "truncated": original_length > MAX_BODY_LENGTH,
            },
            status=status.HTTP_200_OK,
        )
'''
        
        
# --------------------
# Google 로그인 
# --------------------
class GoogleLoginView(APIView):
    """
    POST /api/auth/google/
    Body: { "code": "4/0A..." }
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        # 1. 프론트에서 'code'를 받아야 함 (id_token 아님!)
        code = request.data.get("code")
        
        if not code:
            return Response(
                {"detail": "Google Authorization Code is required (key: 'code')."}, 
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            # 2. Flow 객체 생성 및 Code -> Token 교환
            flow = create_google_flow()
            
            # [중요] 프론트엔드가 'postmessage' 방식을 쓴다면 redirect_uri를 이렇게 설정해야 함
            # (React의 useGoogleLogin hook 사용 시 보통 'postmessage'임)
            flow.redirect_uri = 'postmessage' 
            
            flow.fetch_token(code=code)
            credentials = flow.credentials

            # 3. 이메일 정보 획득 (id_token 디코딩)
            id_info = id_token.verify_oauth2_token(
                credentials.id_token,
                grequests.Request(),
                settings.GOOGLE_OAUTH_CLIENT_ID,
            )
            email = id_info["email"]

            # 4. 유저 생성/조회
            user, created = CustomUser.objects.get_or_create(email=email)

            # 5. [핵심] Refresh Token 저장
            # 주의: 사용자가 처음 동의했을 때만 줍니다. (이미 동의했으면 안 옴)
            if credentials.refresh_token:
                user.gmail_refresh_token = credentials.refresh_token
                user.save()
                print(f"✅ Refresh Token Saved for {email}")
            else:
                print(f"⚠️ No Refresh Token for {email}. (User might need to revoke permissions)")

            # 6. 서비스 자체 토큰 발급
            refresh = RefreshToken.for_user(user)

            return Response(
                {
                    "user": UserSerializer(user).data,
                    "access": str(refresh.access_token),
                    "refresh": str(refresh),
                    "is_new_user": created,
                },
                status=status.HTTP_200_OK,
            )

        except Exception as e:
            print(f"[Google Login Error] {e}")
            return Response(
                {"detail": "Login failed", "error": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        

# --------------------
# Google OAuth 서버 리다이렉트 방식 (login / callback)
# --------------------
def google_login(request):
    """
    GET /api/auth/google/login/
    Google 로그인 페이지로 리다이렉트 시켜주는 엔드포인트
    """
    flow = create_google_flow()
    authorization_url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )

    # CSRF 방지를 위해 state를 세션에 저장
    request.session["google_auth_state"] = state

    return redirect(authorization_url)


def google_callback(request):
    """
    GET /api/auth/google/callback/
    Google이 리다이렉트해주는 콜백 URL.
    여기서 토큰 교환 + 유저 생성/조회 + JWT 발급까지 처리하고 JSON으로 응답.
    """
    try:
        # 전체 콜백 URL (code, state 포함)
        authorization_response = request.build_absolute_uri()

        # Google OAuth Flow 생성
        flow = create_google_flow()

        # authorization code → access/refresh token 교환
        flow.fetch_token(authorization_response=authorization_response)
        credentials = flow.credentials  # access_token, refresh_token, id_token 등

        print(f"[Google Login] Access Token: {credentials.token[:10]}...")
        print(f"[Google Login] Refresh Token: {credentials.refresh_token}")

        # id_token 검증해서 구글 계정 정보 얻기
        id_info = id_token.verify_oauth2_token(
            credentials.id_token,
            grequests.Request(),
            settings.GOOGLE_OAUTH_CLIENT_ID,
        )
        email = id_info["email"]

        # 우리 서비스 유저 생성 or 조회
        user, is_new_user = CustomUser.objects.get_or_create(email=email)

        # Gmail용 refresh_token 있으면 유저에 저장 (CustomUser에 필드 있다고 가정)
        refresh_token_google = credentials.refresh_token
        if refresh_token_google:
            user.gmail_refresh_token = refresh_token_google
            user.save()

        # 우리 서비스용 JWT 발급
        refresh = RefreshToken.for_user(user)
        access = refresh.access_token

        # 프론트로 redirect 대신 JSON으로 응답
        return JsonResponse(
            {
                "message": "google oauth callback ok (Gmail scope included)",
                "has_refresh_token": refresh_token_google is not None,
                "user": UserSerializer(user).data,
                "access": str(access),
                "refresh": str(refresh),
                "is_new_user": is_new_user,
            },
            status=200,
        )

    except Exception as e:
        return JsonResponse(
            {
                "detail": "Authentication failed",
                "error": str(e),
            },
            status=400,
        )
