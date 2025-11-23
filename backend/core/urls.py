from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'documents', views.DocumentViewSet, basename='document')
router.register(r'tags', views.TagViewSet, basename='tag')

urlpatterns = [
    path('', include(router.urls)), 
    path('documents/<int:doc_id>/tags/', views.DocumentTagView.as_view(), name='document-tag-add'),
    path('documents/<int:doc_id>/tags/<int:tag_id>/', views.DocumentTagDetailView.as_view(), name='document-tag-remove'),
    path('organize/', views.OrganizeView.as_view(), name='document-organize'),
    path('neatness-score/', views.NeatnessScoreView.as_view(), name='neatness-score'),
    path('dashboard/', views.DashboardView.as_view(), name='dashboard'),
    path('search/', views.SearchView.as_view(), name='search'),
    path('sync-gmail/', views.sync_gmail_to_documents, name='sync-gmail'),
    path('gmail/<str:message_id>/', views.gmail_message_detail, name='gmail-detail'),
]
