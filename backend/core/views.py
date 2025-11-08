from rest_framework import viewsets, mixins, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.authentication import JWTAuthentication 
from django.shortcuts import get_object_or_404
from .models import TextDocument, Tag
from .serializers import DocumentSerializer, TagSerializer

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

# ---------------------------------------------------
# 2.6 BE: 태그 기능 뷰
# ---------------------------------------------------

class TagViewSet(mixins.CreateModelMixin,         # 1. (POST /api/tags/) 태그 생성
                mixins.ListModelMixin,           # 2. (GET /api/tags/) 태그 목록 조회
                viewsets.GenericViewSet):
    """
    태그(Tag) 생성 및 목록 조회를 처리하는 뷰셋
    """
    queryset = Tag.objects.all().order_by('tag_name')
    serializer_class = TagSerializer
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated] # 인증된 사용자만 태그를 만들거나 볼 수 있음


class DocumentTagView(APIView):
    """
    [문서-태그] 관계를 '추가'
    POST /api/documents/<int:doc_id>/tags/
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, doc_id):
        # 1. [보안] 본인 소유의 문서인지 확인
        document = get_object_or_404(
            TextDocument, id=doc_id, author=request.user
        )
        
        # 2. 요청 Body에서 tag_id 가져오기
        tag_id = request.data.get('tag_id')
        if not tag_id:
            return Response(
                {"detail": "tag_id is required."}, 
                status=status.HTTP_400_BAD_REQUEST
            )

        # 3. tag_id로 Tag 객체 찾기
        tag = get_object_or_404(Tag, id=tag_id)

        # 4. 문서에 태그 '추가' (Django M2M 기능)
        document.tags.add(tag)

        # 5. API 명세서 V2에 맞게 응답 반환
        return Response(
            {"document_id": document.id, "tag_id": tag.id},
            status=status.HTTP_201_CREATED
        )


class DocumentTagDetailView(APIView):
    """
    [문서-태그] 관계를 '삭제' (DELETE)
    DELETE /api/documents/<int:doc_id>/tags/<int:tag_id>/
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def delete(self, request, doc_id, tag_id):
        # 1. 본인 소유의 문서인지 확인
        document = get_object_or_404(
            TextDocument, id=doc_id, author=request.user
        )

        # 2. tag_id로 Tag 객체 찾기
        tag = get_object_or_404(Tag, id=tag_id)

        # 3. 문서에서 태그 '제거' (Django M2M 기능)
        document.tags.remove(tag)

        # 4. API 명세서 V2에 맞게 204 응답 반환
        return Response(status=status.HTTP_204_NO_CONTENT)
    
# ---------------------------------------------------
# 2.3 BE: "정리하기" 기능 뷰
# ---------------------------------------------------
class OrganizeView(APIView):
    """
    "정리하기" 실행
    POST /api/organize/
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user

        # "분류 안 된(False)" 문서만 가져오기
        documents_to_organize = TextDocument.objects.filter(
            author=user,
            is_organized=False
        )
        
        doc_count = documents_to_organize.count()
        if doc_count == 0:
            return Response(
                {"message": "새로 정리할 문서가 없습니다."},
                status=status.HTTP_200_OK
            )

        # [비동기 작업 시작]
        # (실제 구현)
        # TODO: 
        # (1) 2.1(Ollama) 호출해서 이 'documents_to_organize'를 분석
        # (2) 2.2(Fuseki)에 트리플 저장
        # (3) 모두 성공하면, 이 문서들의 'is_organized' 깃발을 True로 변경
        #
        # for doc in documents_to_organize:
        #     doc.is_organized = True
        #     doc.save() 
        #
        
        # "202 Accepted" 응답
        return Response(
            {"message": f"새로운 {doc_count}개의 문서에 대한 분석 및 정리를 시작합니다."},
            status=status.HTTP_202_ACCEPTED
        )