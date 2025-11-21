from django.urls import path
from .views import (
    RegisterView,
    LoginView,
    MeView,
    GoogleLoginView,
    google_login,
    google_callback,
    GmailMessageListView,
    GmailMessageDetailView,
    GmailMessageAnalyzeView,
)


urlpatterns = [
    path("register/", RegisterView.as_view()),
    path("login/", LoginView.as_view()),
    path("me/", MeView.as_view()),
    path("google/", GoogleLoginView.as_view()),
    path("google/login/", google_login, name="google-login"),
    path("google/callback/", google_callback, name="google-callback"),

    path("gmail/messages/", GmailMessageListView.as_view(), name="gmail-messages"),
    path(
        "gmail/messages/<str:message_id>/",
        GmailMessageDetailView.as_view(),
        name="gmail-message-detail",
    ),
    path(
        "gmail/messages/<str:message_id>/analyze/",
        GmailMessageAnalyzeView.as_view(),
        name="gmail-message-analyze",
    ),
]

