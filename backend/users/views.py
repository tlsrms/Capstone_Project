# users/views.py

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.authentication import JWTAuthentication

from django.conf import settings

from .serializers import RegisterSerializer, LoginSerializer, UserSerializer
from .models import CustomUser

# --- Google OAuth2 ---
from google.oauth2 import id_token
from google.auth.transport import requests as grequests


class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        s = RegisterSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = s.save()
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        s = LoginSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = s.validated_data["user"]
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
        return Response(UserSerializer(request.user).data, status=status.HTTP_200_OK)


class GoogleLoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        # 1) 프론트에서 전달받은 id_token
        idt = request.data.get("id_token")
        if not idt:
            return Response({"detail": "id_token is required"}, status=400)

        # 2) 서버에 설정된 Google OAuth Client ID (settings.py에 반드시 동일한 값으로 설정)
        CLIENT_ID = getattr(settings, "GOOGLE_OAUTH_CLIENT_ID", None)
        if not CLIENT_ID:
            return Response(
                {"detail": "Server is not configured with GOOGLE_OAUTH_CLIENT_ID"},
                status=500,
            )

        # 3) 구글 토큰 검증
        try:
            info = id_token.verify_oauth2_token(
                idt,
                grequests.Request(),
                audience=CLIENT_ID,
            )
            # 권장: 발급처(issuer) 확인
            if info.get("iss") not in (
                "accounts.google.com",
                "https://accounts.google.com",
            ):
                return Response({"detail": "Invalid issuer"}, status=400)
        except Exception as e:
            # 디버깅을 쉽게 하려고 에러 메시지도 함께 반환 (로컬에서만 사용 권장)
            return Response({"detail": "Invalid id_token", "error": str(e)}, status=400)

        # 4) 이메일 검증
        email = info.get("email")
        email_verified = info.get("email_verified", False)
        if not email or not email_verified:
            return Response({"detail": "Unverified Google account"}, status=400)

        # 5) 사용자 조회/생성 (구글 계정은 비밀번호 사용 안 함)
        user, created = CustomUser.objects.get_or_create(email=email, defaults={})
        if created:
            user.set_unusable_password()
            user.save()

        # 6) JWT 발급
        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "user": UserSerializer(user).data,
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "is_new_user": created,
            },
            status=200,
        )
