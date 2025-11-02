from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from .models import TextDocument
from .serializers import DocumentSerializer
from rest_framework_simplejwt.authentication import JWTAuthentication 

class DocumentViewSet(viewsets.ModelViewSet): 
    """
    문서(TextDocument)에 대한 CRUD API를 처리하는 뷰셋
    """
    serializer_class = DocumentSerializer
    
    authentication_classes = [JWTAuthentication] 
    permission_classes = [IsAuthenticated]     
    def get_queryset(self):
        """ (GET) '내 글 목록'만 필터링 """
        return TextDocument.objects.filter(author=self.request.user).order_by('-created_at')

    def perform_create(self, serializer):
        """ (POST) '글쓴이'를 나로 자동 지정 """
        serializer.save(author=self.request.user)
