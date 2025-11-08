import requests 
import json      
from SPARQLWrapper import SPARQLWrapper, POST, JSON

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
    
# ---------------------------------------------------
# 2.3 BE: "정리하기" 기능 뷰 (AI 호출 로직 추가)
# ---------------------------------------------------
class OrganizeView(APIView):
    """
    "정리하기" 실행
    POST /api/organize/
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    # ---------------------------------------------------
    # 2.1 티켓을 위한 35개 Type 리스트 (LLM 프롬프트용)
    # (나중에 별도 파일로 분리하는 것이 좋습니다.)
    # ---------------------------------------------------
    SSEUKSSAK_TYPES = [
        "PlanningDocument", "Schedule", "ResearchMaterial", "AnalysisResult", 
        "Report", "Draft", "PresentationMaterial", "FinancialDocument", 
        "LegalDocument", "HRDocument", "CommunicationDocument", "SourceCode", 
        "BuildFile", "DebuggingMaterial", "StudyNote", "ProblemSolvingMaterial", 
        "Summary", "LogDocument", "ManagementDocument", "MarketingMaterial", 
        "StudentCollaboration", "ResearchPaper", "DeveloperCollaborationLog", 
        "MovieDrama", "Reading", "Music", "Game", "Exercise", "Pet", 
        "TravelLog", "TravelPhoto", "TravelPlan", "Blog", "Writing", "Diary"
    ]

    def build_prompt(self, document_content):
        """
        Ollama에 보낼 영문 프롬프트를 생성합니다.
        """
        # Type 리스트를 콤마로 구분된 문자열로 변환
        type_list_str = ", ".join(self.SSEUKSSAK_TYPES)

        # 2-Step 검증을 위해 "reference_strings"를 요청합니다.
        return f"""
Analyze the following text.
Respond ONLY in JSON format with three keys: "summary", "type_label", and "reference_strings".

1. "summary": Provide a concise summary of the text.
2. "type_label": Choose ONLY ONE `type_label` from this exact list: [{type_list_str}]
3. "reference_strings": Extract a list of strings that appear to be other document titles or file names. If none, return [].

--- TEXT TO ANALYZE ---
{document_content}
"""

    def call_ollama(self, prompt, model_name="llama3"):
        """
        Ollama 서버에 API 요청을 보내고 JSON 응답을 파싱합니다.
        """
        OLLAMA_ENDPOINT = "http://localhost:11434/api/chat"
        
        try:
            payload = {
                "model": model_name,
                "format": "json",  # Ollama의 JSON 모드 사용 
                "stream": False,
                "messages": [
                    {
                        "role": "user",
                        "content": prompt
                    }
                ]
            }
            
            # AI 응답은 오래 걸릴 수 있습니다 (예: 5~10초)
            response = requests.post(OLLAMA_ENDPOINT, json=payload, timeout=60) 
            response.raise_for_status()  # 4xx, 5xx 에러 발생 시 예외 발생

            # Ollama 응답 구조에서 실제 JSON 내용(str)을 파싱
            response_json = response.json()
            message_content_str = response_json.get('message', {}).get('content', '{}')
            
            # message_content_str 자체가 JSON 형식의 '문자열'이므로, 
            # 이것을 'Python 딕셔너리'로 한번 더 파싱합니다.
            ai_result = json.loads(message_content_str) 

            # 설계한 규격(Contract)대로 왔는지 확인
            if not all(k in ai_result for k in ["summary", "type_label", "reference_strings"]):
                 print(f"[Ollama Error] AI가 규격에 맞지 않는 JSON을 반환했습니다: {ai_result}")
                 return None

            return ai_result

        except requests.exceptions.ConnectionError:
            print("[Ollama Error] Ollama 서버에 연결할 수 없습니다. (서버 실행 확인)")
            return None
        except requests.exceptions.RequestException as e:
            print(f"[Ollama Error] API 요청 중 에러 발생: {e}")
            return None
        except json.JSONDecodeError:
            print(f"[Ollama Error] AI가 반환한 응답이 JSON 형식이 아닙니다: {message_content_str}")
            return None


    # ---------------------------------------------------
    # 2.2 - Fuseki 저장(Write) 함수
    # ---------------------------------------------------
    def save_to_fuseki(self, user, doc, ai_result):
        """
        AI 분석 결과를 '안전한 트리플'로 변환하여 Fuseki에 저장합니다.
        """
        FUSEKI_UPDATE_ENDPOINT = "http://localhost:3030/sseukssak/update" 
        SCHEMA_URI = "http://api.sseukssak.com/ontology#"
        
        # 1. 트리플 생성을 위한 URI 정의
        doc_uri = f"{SCHEMA_URI}Document_{doc.id}"
        user_uri = f"{SCHEMA_URI}User_{user.id}"
        type_uri = f"{SCHEMA_URI}{ai_result['type_label']}" # 예: sseukssak:PlanningDocument

        # 2. 'SPARQL UPDATE' 쿼리 생성
        query = f"""
        PREFIX sseukssak: <{SCHEMA_URI}>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

        INSERT DATA {{
            <{doc_uri}> sseukssak:hasOwner <{user_uri}> .
            <{doc_uri}> sseukssak:hasType <{type_uri}> .
            <{type_uri}> rdfs:label "{ai_result['type_label']}" . 
        """
        
        # 3. [2-Step 검증] refersTo 관계 추가 (RDB 검색)
        safe_references = []
        for ref_string in ai_result.get('reference_strings', []):
            # (RDB 검색) 제목이 일치하고, '본인 소유'인 문서를 찾음
            referred_doc = TextDocument.objects.filter(
                author=user, 
                title__icontains=ref_string # 간단한 '포함' 검색
            ).exclude(id=doc.id).first() # 자기 자신은 제외
            
            if referred_doc:
                ref_doc_uri = f"{SCHEMA_URI}Document_{referred_doc.id}"
                # '검증된' 트리플을 쿼리에 추가
                query += f"    <{doc_uri}> sseukssak:refersTo <{ref_doc_uri}> .\n"
                safe_references.append(referred_doc.title)

        query += " }" # 쿼리 닫기
        
        # 4. Fuseki에 SPARQL 'UPDATE' 요청 전송
        try:
            sparql = SPARQLWrapper(FUSEKI_UPDATE_ENDPOINT)
            sparql.setMethod(POST)
            sparql.setQuery(query)
            sparql.query() # 쿼리 실행
            
            print(f"[Fuseki 성공] {doc_uri} -> {type_uri}")
            if safe_references:
                print(f"[Fuseki 성공] {doc_uri} -> refersTo {safe_references}")
            return True

        except Exception as e:
            print(f"[Fuseki Error] 트리플 저장 실패 (doc_id: {doc.id}): {e}")
            return False
        
    def post(self, request):
        user = request.user
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

        print(f"--- {doc_count}개 문서 정리 시작 ---")
        
        organized_count = 0
        for doc in documents_to_organize:
            print(f"[AI 분석 시작] 문서 ID: {doc.id} ({doc.title})")
            prompt = self.build_prompt(doc.content)
            ai_result = self.call_ollama(prompt)

            if ai_result:
                print(f"[AI 분석 성공] Type: {ai_result.get('type_label')}")
                
                # ---------------------------------------------------
                # [수정] "TODO" 부분을 실제 함수 호출로 변경
                # ---------------------------------------------------
                
                # 3. (신규) 2.2 티켓 - Fuseki에 트리플 저장
                fuseki_success = self.save_to_fuseki(user, doc, ai_result)
                
                # 4. (신규) 작업 완료 '깃발' 설정
                if fuseki_success:
                    doc.summary = ai_result.get('summary', '') # 👈 RDB에 요약본 저장
                    doc.is_organized = True
                    doc.save() 
                    organized_count += 1
                else:
                    # Fuseki 저장이 실패하면(DB 다운 등), 
                    # 'is_organized'를 False로 남겨두어 다음번에 재시도
                    print(f"[Fuseki 실패] 문서 ID: {doc.id} 처리 중단")
                # ---------------------------------------------------

            else:
                print(f"[AI 분석 실패] 문서 ID: {doc.id} 처리 중단")

        print(f"--- 총 {organized_count}개 문서 처리 완료 ---")

        return Response(
            {"message": f"새로운 {doc_count}개 문서 중 {organized_count}개 처리를 완료했습니다."},
            status=status.HTTP_202_ACCEPTED
        )