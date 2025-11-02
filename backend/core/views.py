from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated # '로그인한 사람만' 통행증
from rest_framework.response import Response
from .models import TextDocument
from .serializers import DocumentSerializer

class DocumentViewSet(viewsets.ModelViewSet):
    """
    문서(TextDocument)에 대한 CRUD API를 처리하는 뷰셋
    """
    serializer_class = DocumentSerializer  
    permission_classes = [IsAuthenticated] 

    def get_queryset(self):
        """
        (GET /api/documents/)
        이 함수는 '목록'을 조회할 때만 실행된다.
        '내가 쓴 글'만 필터링해서 보여준다.
        """
        # 요청을 보낸 사용자(request.user)가 쓴 글(author)만 골라서
        return TextDocument.objects.filter(author=self.request.user).order_by('-created_at')

    def perform_create(self, serializer):
        """
        (POST /api/documents/)
        이 함수는 '새 글'을 작성할 때만 실행된다.
        '글쓴이'를 현재 로그인한 사용자로 자동 지정한다.
        """
        # serializer.save()를 호출할 때, author 필드에 request.user를 강제로 끼워넣음
        serializer.save(author=self.request.user)