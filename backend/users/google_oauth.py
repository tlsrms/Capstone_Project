# users/google_oauth.py

import os
import pickle

from django.conf import settings
from google_auth_oauthlib.flow import Flow
from google.oauth2 import id_token
from google.auth.transport import requests as grequests

from .models import CustomUser
from rest_framework_simplejwt.tokens import RefreshToken
from django.http import JsonResponse


os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"


def create_google_flow():
    client_id = settings.GOOGLE_OAUTH_CLIENT_ID
    client_secret = settings.GOOGLE_OAUTH_CLIENT_SECRET
    redirect_uri = settings.GOOGLE_OAUTH_REDIRECT_URI

    scopes = [
        "openid",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/gmail.readonly",
    ]

    client_config = {
        "web": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [redirect_uri],
        }
    }

    flow = Flow.from_client_config(
        client_config=client_config,
        scopes=scopes,
        redirect_uri=redirect_uri,
    )

    return flow

def google_login(request):
    flow = create_google_flow()
    auth_url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    request.session["google_oauth_state"] = state
    return redirect(auth_url)


def google_callback(request):
    state = request.session.get("google_oauth_state")
    if not state:
        return JsonResponse({"detail": "Missing OAuth state"}, status=400)

    flow = create_google_flow()

    authorization_response = request.build_absolute_uri()

    flow.fetch_token(authorization_response=authorization_response)

    creds = flow.credentials

    idinfo = id_token.verify_oauth2_token(
        creds.id_token,
        grequests.Request(),
        settings.GOOGLE_OAUTH2_CLIENT_ID,
    )
    email = idinfo.get("email")

    user, created = CustomUser.objects.get_or_create(
        email=email,
        defaults={"is_active": True},
    )

    os.makedirs("tokens", exist_ok=True)
    token_path = f"tokens/gmail_token_user_{user.id}.pickle"
    with open(token_path, "wb") as f:
        pickle.dump(creds, f)

    refresh = RefreshToken.for_user(user)

    return JsonResponse(
        {
            "message": "google oauth callback ok (Gmail scope included)",
            "has_refresh_token": bool(creds.refresh_token),
            "user": {
                "id": user.id,
                "email": user.email,
            },
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "is_new_user": created,
        },
        status=200,
    )
