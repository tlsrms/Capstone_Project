# core/views.py

from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import api_view, permission_classes
from django.db.models import Q
from SPARQLWrapper import SPARQLWrapper, POST, JSON

from .models import TextDocument, Tag
from .serializers import DocumentSerializer, TagSerializer
from users.gmail_service import list_messages_for_user, get_message_detail_for_user, extract_subject_and_body


# ========================================
# Document & Tag ViewSets
# ========================================

class DocumentViewSet(viewsets.ModelViewSet):
    serializer_class = DocumentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return TextDocument.objects.filter(author=self.request.user)

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)


class TagViewSet(viewsets.ModelViewSet):
    serializer_class = TagSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Tag.objects.filter(documents__author=self.request.user).distinct()


# ========================================
# Document Tag Management
# ========================================

class DocumentTagView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, doc_id):
        try:
            doc = TextDocument.objects.get(id=doc_id, author=request.user)
            tag_name = request.data.get('tag_name')
            tag, _ = Tag.objects.get_or_create(tag_name=tag_name)
            doc.tags.add(tag)
            return Response(DocumentSerializer(doc).data, status=status.HTTP_200_OK)
        except TextDocument.DoesNotExist:
            return Response({"detail": "Document not found"}, status=status.HTTP_404_NOT_FOUND)


class DocumentTagDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, doc_id, tag_id):
        try:
            doc = TextDocument.objects.get(id=doc_id, author=request.user)
            tag = Tag.objects.get(id=tag_id)
            doc.tags.remove(tag)
            return Response(status=status.HTTP_204_NO_CONTENT)
        except (TextDocument.DoesNotExist, Tag.DoesNotExist):
            return Response({"detail": "Not found"}, status=status.HTTP_404_NOT_FOUND)


# ========================================
# Organize View (Fuseki Integration)
# ========================================

class OrganizeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        # TODO: Implement Fuseki organization logic
        return Response({"message": "Organize functionality"}, status=status.HTTP_200_OK)


# ========================================
# Neatness Score
# ========================================

class NeatnessScoreView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # TODO: Calculate neatness score
        score = 85.5
        return Response({"score": score}, status=status.HTTP_200_OK)


# ========================================
# Dashboard
# ========================================

class DashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        total_docs = TextDocument.objects.filter(author=user).count()
        organized_docs = TextDocument.objects.filter(author=user, is_organized=True).count()
        
        return Response({
            "total_documents": total_docs,
            "organized_documents": organized_docs,
            "neatness_score": user.last_neatness_score
        }, status=status.HTTP_200_OK)


# ========================================
# Search
# ========================================

class SearchView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        query = request.GET.get('q', '')
        user = request.user
        
        if not query:
            return Response({"results": []}, status=status.HTTP_200_OK)
        
        docs = TextDocument.objects.filter(
            Q(author=user) & (Q(title__icontains=query) | Q(content__icontains=query))
        )
        
        serializer = DocumentSerializer(docs, many=True)
        return Response({"results": serializer.data}, status=status.HTTP_200_OK)


# ========================================
# Gmail Integration
# ========================================

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def sync_gmail_to_documents(request):
    """
    Gmail을 가져와서 TextDocument에 저장
    POST /api/sync-gmail/
    Body: { "max": 10 }
    """
    user = request.user
    
    if not user.gmail_refresh_token:
        return Response(
            {"detail": "Gmail not connected. Please login with Google first."},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        # 1. Gmail 목록 가져오기
        max_results = request.data.get('max', 10)
        messages = list_messages_for_user(user, label_ids=['INBOX'], max_results=max_results)
        
        synced_count = 0
        skipped_count = 0
        synced_list = []
        
        # 2. 각 메일 처리
        for msg_info in messages:
            message_id = msg_info['id']
            gmail_url = f"https://mail.google.com/mail/u/0/#inbox/{message_id}"
            
            # 이미 저장된 메일인지 확인
            if TextDocument.objects.filter(author=user, file_path=gmail_url).exists():
                skipped_count += 1
                continue
            
            # 메일 상세 정보 가져오기
            msg = get_message_detail_for_user(user, message_id)
            subject, body_text = extract_subject_and_body(msg)
            
            # 헤더에서 필요한 정보 추출
            headers = msg.get('payload', {}).get('headers', [])
            sender = ""
            date_str = ""
            
            for header in headers:
                if header['name'].lower() == 'from':
                    sender = header['value']
                elif header['name'].lower() == 'date':
                    date_str = header['value']
            
            # 빈 본문 건너뛰기
            if not body_text or len(body_text.strip()) < 10:
                skipped_count += 1
                continue
            
            # 3. TextDocument에 저장
            doc = TextDocument.objects.create(
                author=user,
                title=f"[Gmail] {subject[:100]}",
                content=body_text[:5000],
                file_path=gmail_url,
                is_organized=False,
                sender=sender,
                email_date=date_str,
            )
            
            synced_count += 1
            synced_list.append({
                "id": message_id,
                "doc_id": doc.id,
                "title": subject[:100],
                "sender": sender,
                "date": date_str
            })
        
        # 4. 간단한 응답 반환
        return Response({
            "message": f"{synced_count}개의 메일을 가져왔습니다",
            "synced": synced_count,
            "skipped": skipped_count,
            "total": len(messages),
            "emails": synced_list
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response(
            {"detail": "Failed to sync Gmail", "error": str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def gmail_message_detail(request, message_id):
    """
    특정 Gmail 메시지 상세 조회
    GET /api/gmail/<message_id>/
    """
    user = request.user
    
    if not user.gmail_refresh_token:
        return Response(
            {"detail": "Gmail not connected"},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        msg = get_message_detail_for_user(user, message_id)
        subject, body_text = extract_subject_and_body(msg)
        
        # 헤더에서 필요한 정보 추출
        headers = msg.get('payload', {}).get('headers', [])
        sender = ""
        date_str = ""
        
        for header in headers:
            if header['name'].lower() == 'from':
                sender = header['value']
            elif header['name'].lower() == 'date':
                date_str = header['value']
        
        return Response({
            "id": message_id,
            "subject": subject,
            "content": body_text,
            "sender": sender,
            "date": date_str,
            "gmail_url": f"https://mail.google.com/mail/u/0/#inbox/{message_id}"
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response(
            {"detail": "Failed to fetch message", "error": str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )