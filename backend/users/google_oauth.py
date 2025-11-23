# users/google_oauth.py
import os
os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'
from google_auth_oauthlib.flow import Flow
from django.conf import settings


def create_google_flow():
    """
    Google OAuth2 flow     
    """
    client_config = {
        "web": {
            "client_id": settings.GOOGLE_OAUTH_CLIENT_ID,
            "client_secret": settings.GOOGLE_OAUTH_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }
    
    scopes = [
        'openid',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/gmail.readonly',
    ]
    
    flow = Flow.from_client_config(
        client_config,
        scopes
    )
    
    #    ⸦     ! GOOGLE_OAUTH2_REDIRECT_URI       
    flow.redirect_uri = settings.GOOGLE_OAUTH2_REDIRECT_URI
    
    return flow