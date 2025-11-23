from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from .views import PersonaAnalysisView, BookmarkImportView

router = DefaultRouter()

# /api/documents/
router.register(r'documents', views.DocumentViewSet, basename='document')

# /api/tags/
router.register(r'tags', views.TagViewSet, basename='tag')

urlpatterns = [
    # router가 생성한 URL 목록을 포함
    # (/api/documents/, /api/documents/<id>/, /api/tags/)
    path('', include(router.urls)), 
    
    # 문서에 태그 '추가'용 커스텀 URL
    path(
        'documents/<int:doc_id>/tags/', 
        views.DocumentTagView.as_view(), 
        name='document-tag-add'
    ),
    # 문서에서 태그 '삭제'용 커스텀 URL
    path(
        'documents/<int:doc_id>/tags/<int:tag_id>/', 
        views.DocumentTagDetailView.as_view(), 
        name='document-tag-remove'
    ),

    # "정리하기" URL
    path(
        'organize/', 
        views.OrganizeView.as_view(), 
        name='document-organize'
    ),

    path(
        'neatness-score/', 
        views.NeatnessScoreView.as_view(), 
        name='neatness-score'
    ),

    # 2.5 BE: 대시보드 API URL
    path(
        'dashboard/', 
        views.DashboardView.as_view(), 
        name='dashboard'
    ),

    # 3.4 BE: 지능형 검색 API
    path(
        'search/', 
        views.SearchView.as_view(), 
        name='search'
    ),

    path("bookmarks/import/", 
         BookmarkImportView.as_view(), 
         name="bookmark-import"),

    path("persona/", 
         PersonaAnalysisView.as_view(), 
         name="persona-analysis"),

    path('sync-gmail/', 
         views.sync_gmail_to_documents, 
         name='sync-gmail'),

    path('gmail/<str:message_id>/', 
         views.gmail_message_detail, 
         name='gmail-detail'),
]