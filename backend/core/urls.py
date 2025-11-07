from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

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
]