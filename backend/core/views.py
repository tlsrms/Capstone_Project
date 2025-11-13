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

import os 
from django.db.models import Q
from analytics.metrics import compute_cleanliness 
from analytics.utils import calculate_fragmentation 

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
    
    def perform_update(self, serializer):
        """
        (PUT/PATCH) 문서가 업데이트될 때 호출됩니다.
        """
        print(f"[Trigger] Document {serializer.instance.id} updated. Flagging for re-organization.")
        serializer.save(is_organized=False, summary="")

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
    - 2.1(Ollama) AI 엔진을 호출하여 문서를 분석합니다.
    - 2.2(Fuseki) 온톨로지 DB에 '필수' 트리플과 '발견된' 트리플을 저장합니다.
    - 1.4(RDB) 문서에 'summary'와 'is_organized=True' 플래그를 저장합니다.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    # 35개 공식 Type 리스트 (LLM 객관식 보기)
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

    # '발견 가능 관계' 목록 재구성 (명확성 확보)
    DISCOVERABLE_PREDICATES = [
        # 1. 내용 (추상적 개념)
        "sseukssak:discussesTopic",  # "이 문서는 ... 주제를 다룹니다" (예: "온톨로지", "4분기 예산")
        
        # 2. 개체 (구체적 실체)
        "sseukssak:mentionsNamedEntity", # "이 문서는 ... 고유명사를 언급합니다" (예: "KOSMOS", "Django", "Postman")
        "sseukssak:mentionsPerson",      # "이 문서는 ... 사람을 언급합니다" (예: "김철수 팀장")
        "sseukssak:mentionsPlace",       # "이 문서는 ... 장소를 언급합니다" (예: "제주도")
        "sseukssak:referencesDate",      # "이 문서는 ... 날짜/시간을 참조합니다" (예: "2025년 2학기", "2025-12-31")

        # 3. 문서 자체의 속성 (메타데이터)
        "sseukssak:requestsAction",  # "이 문서는 ... 행동을 요청합니다" (예: "서명 필요", "검토 바람")
        "sseukssak:documentStatus",  # "이 문서의 상태는 ... 입니다" (예: "Final", "Draft_v2")
    ]

    def build_prompt(self, document_content):
        """
        Ollama에 보낼 3-Key JSON 프롬프트를 생성합니다.
        """
        type_list_str = ", ".join(self.SSEUKSSAK_TYPES)
        predicate_list_str = ", ".join(self.DISCOVERABLE_PREDICATES)

        # "reference_strings" 키 제거, "discovered_triples"로 통합
        return f"""
Analyze the following text.
Respond ONLY in JSON format with three keys: "summary", "type_label", and "discovered_triples".

1. "summary" (str): Provide a concise summary of the text. The summary should be written in Korean.
2. "type_label" (str): Choose ONLY ONE `type_label` from this exact list: [{type_list_str}]
3. "discovered_triples" (list[list[str]]):
   Generate a list of (predicate, object) pairs you discover.
   The subject is the document itself. 
   Use predicates from this list ONLY: [{predicate_list_str}].
   The object should be a simple string literal (e.g., "종합설계프로젝트", "Django", "Postman", "2025년").
   If no triples are discovered, return [].
   
   Example:
   "discovered_triples": [
       ["sseukssak:discussesTopic", "종합설계프로젝트"],
       ["sseukssak:mentionsNamedEntity", "Django"],
       ["sseukssak:mentionsNamedEntity", "Postman"],
       ["sseukssak:referencesDate", "2025년 2학기"]
   ]

--- TEXT TO ANALYZE ---
{document_content}
"""

    def call_ollama(self, prompt, model_name="gemma3:4b"):
        """
        Ollama 서버(2.1)에 API 요청을 보내고 3-Key JSON을 파싱합니다.
        """
        OLLAMA_ENDPOINT = "http://localhost:11434/api/chat"
        
        try:
            payload = {
                "model": model_name,
                "format": "json",
                "stream": False,
                "messages": [{"role": "user", "content": prompt}]
            }
            
            response = requests.post(OLLAMA_ENDPOINT, json=payload, timeout=60) 
            response.raise_for_status() 

            response_json = response.json()
            message_content_str = response_json.get('message', {}).get('content', '{}')
            
            ai_result = json.loads(message_content_str) 

            # 3-Key 규격(Contract) 확인
            if not all(k in ai_result for k in ["summary", "type_label", "discovered_triples"]):
                 print(f"[Ollama Error] AI did not return the expected 3-Key JSON: {ai_result}")
                 return None

            return ai_result

        except requests.exceptions.ConnectionError:
            print("[Ollama Error] Cannot connect to Ollama server.")
            return None
        except requests.exceptions.RequestException as e:
            print(f"[Ollama Error] API request failed: {e}")
            return None
        except json.JSONDecodeError:
            print(f"[Ollama Error] AI response was not valid JSON: {message_content_str}")
            return None

    def save_to_fuseki(self, user, doc, ai_result):
        """
        (1)기존 트리플을 삭제하고, (2)새 트리플을 Fuseki에 저장합니다.
        """
        FUSEKI_UPDATE_ENDPOINT = "http://localhost:3030/sseukssak/update" 
        SCHEMA_URI = "http://api.sseukssak.com/ontology#"
        
        doc_uri = f"{SCHEMA_URI}Document_{doc.id}"
        user_uri = f"{SCHEMA_URI}User_{user.id}"
        type_uri = f"{SCHEMA_URI}{ai_result['type_label']}"

        # ---------------------------------------------------
        # 1. (DELETE) 이 문서에 연결된 '모든' 트리플 삭제
        # ---------------------------------------------------
        # (hasOwner, hasType, discovered_triples 모두 삭제)
        delete_query = f"""
        PREFIX sseukssak: <{SCHEMA_URI}>

        DELETE WHERE {{
          # 이 문서 ID를 '주어(Subject)'로 갖는 모든 트리플을 삭제합니다.
          <{doc_uri}> ?predicate ?object .
        }}
        """

        try:
            sparql_delete = SPARQLWrapper(FUSEKI_UPDATE_ENDPOINT)
            sparql_delete.setMethod(POST)
            sparql_delete.setQuery(delete_query)
            sparql_delete.query()
            print(f"[Fuseki Cleansing] All old triples for {doc_uri} deleted.")
        except Exception as e:
            print(f"[Fuseki Error] Failed to DELETE triples (doc_id: {doc.id}): {e}")
            return False # 삭제에 실패하면 '쓰기'를 진행하지 않음

        # ---------------------------------------------------
        # 2. (INSERT) 새 트리플 생성 (기존 로직과 동일)
        # ---------------------------------------------------
        query_lines = [] 
        # hasOwner를 '다시' 추가합니다.
        query_lines.append(f"<{doc_uri}> sseukssak:hasOwner <{user_uri}> .") 
        query_lines.append(f"<{doc_uri}> sseukssak:hasType <{type_uri}> .")
        query_lines.append(f"<{type_uri}> rdfs:label \"{ai_result['type_label']}\" .")
        
        # 발견된 트리플을 '다시' 추가합니다.
        for triple_pair in ai_result.get('discovered_triples', []):
            if isinstance(triple_pair, list) and len(triple_pair) == 2:
                predicate_raw = str(triple_pair[0]).strip()
                obj = str(triple_pair[1]).strip().replace('"', '\\"') 
                predicate = predicate_raw if predicate_raw.startswith("sseukssak:") else f"sseukssak:{predicate_raw}"
                
                if predicate in self.DISCOVERABLE_PREDICATES:
                     query_lines.append(f"<{doc_uri}> <{SCHEMA_URI}{predicate.split(':')[-1]}> \"{obj}\" .")
                else:
                    print(f"[Fuseki Warn] LLM generated a non-allowed predicate: {predicate}")

        query_body = "\n".join(query_lines)
        insert_query = f"""
        PREFIX sseukssak: <{SCHEMA_URI}>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        INSERT DATA {{ {query_body} }}
        """
        
        # 3. Fuseki에 SPARQL 'INSERT' 요청 전송
        try:
            sparql_insert = SPARQLWrapper(FUSEKI_UPDATE_ENDPOINT)
            sparql_insert.setMethod(POST)
            sparql_insert.setQuery(insert_query)
            sparql_insert.query()
            
            print(f"[Fuseki Success] {doc_uri} -> {type_uri} (New triples saved)")
            return True

        except Exception as e:
            print(f"[Fuseki Error] Failed to INSERT new triples (doc_id: {doc.id}): {e}")
            return False
            
    def post(self, request):
        user = request.user
        
        # 1. RDB에서 '할 일' 찾기 (is_organized=False)
        documents_to_organize = TextDocument.objects.filter(
            author=user,
            is_organized=False
        )
        
        doc_count = documents_to_organize.count()
        if doc_count == 0:
            return Response(
                {"message": "No new documents to organize."},
                status=status.HTTP_200_OK
            )

        print(f"--- Starting organization for {doc_count} documents ---")
        
        organized_count = 0
        
        # (TODO: 이 for 루프는 'Celery' 비동기 태스크로 분리해야 함)
        for doc in documents_to_organize:
            print(f"[AI Processing Start] Doc ID: {doc.id} ({doc.title})")
            
            # 2. (2.1) 프롬프트 생성
            prompt = self.build_prompt(doc.content)
            
            # 3. (2.1) Ollama AI 엔진 호출
            ai_result = self.call_ollama(prompt)

            if ai_result:
                print(f"[AI Success] Type: {ai_result.get('type_label')}")
                
                # 4. (2.2) Fuseki에 트리플 저장 (하이브리드)
                fuseki_success = self.save_to_fuseki(user, doc, ai_result)
                
                # 5. (1.4) RDB에 '완료' 상태 업데이트
                if fuseki_success:
                    doc.summary = ai_result.get('summary', '') # 요약본 저장
                    doc.is_organized = True                    # '정리 완료' 깃발
                    doc.save() 
                    organized_count += 1
                else:
                    print(f"[Fuseki Fail] Aborting for Doc ID: {doc.id}")
            else:
                print(f"[AI Fail] Aborting for Doc ID: {doc.id}")

        print(f"--- Finished processing. {organized_count} documents completed ---")

        return Response(
            {"message": f"Organization complete for {organized_count} out of {doc_count} new documents."},
            status=status.HTTP_202_ACCEPTED
        )
    
# ---------------------------------------------------
# 2.4 BE: 깔끔지수 계산 API 뷰 
# ---------------------------------------------------
class NeatnessScoreView(APIView):
    """
    "깔끔지수" 계산
    GET /api/neatness-score/
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        
        # 1. RDB에서 사용자의 모든 문서 정보(RDB) 가져오기
        user_docs = TextDocument.objects.filter(author=user, file_path__isnull=False).exclude(file_path="")
        total_files = user_docs.count()

        if total_files == 0:
            return Response({"score": 0.0, "details": {}}, status=status.HTTP_200_OK)

        # 2. BE가 RDB 기반으로 3대 지표 계산
        meaningless_count = 0 # R_title
        too_shallow_count = 0 # R_shallow
        too_deep_count = 0    # R_deep

        # A) R_title (무의미 제목)
        meaningless_count = user_docs.filter(
                    Q(title__exact="") |                 # 1. 제목이 아예 없음
                    Q(title__icontains="제목 없음") |     # 2. "제목 없음"
                    Q(title__icontains="Untitled") |      # 3. "Untitled" (기존)
                    Q(title__icontains="untitled") |      # 4. "untitled" (신규)
                    Q(title__icontains="document") |      # 5. "document" (신규)
                    Q(title__icontains="새 문서")         # 6. "새 문서" (신규)
                ).count()
        
        for doc in user_docs.only("file_path"):
            try:
                path_str = os.path.normpath(doc.file_path)
                dir_str = os.path.dirname(path_str) # "C:\Users\Me"
                
                # (예) "C:\" -> ["C:"] -> len=1 -> depth=0
                # (예) "C:\Users" -> ["C:", "Users"] -> len=2 -> depth=1
                depth = len(dir_str.rstrip(os.sep).split(os.sep)) - 1 
                
                if depth <= 1: # 논문 정의
                    too_shallow_count += 1
                elif depth >= 5: # 논문 정의 (C:\a\b\c\d\e\file.txt -> dir_depth=5)
                    too_deep_count += 1
            except Exception:
                pass

        # 3. B) BE가 (RDB + Fuseki) 기반으로 R_frag 지표 계산
        # (이 함수는 RDB의 file_path와 Fuseki의 hasType을 둘 다 사용)
        fragmented_count = calculate_fragmentation(user) 

        # 4. (analytics) 팀원이 만든 함수로 4개 지표를 합산
        score = compute_cleanliness(
            total_files=total_files,
            meaningless_count=meaningless_count,
            fragmented_count=fragmented_count,
            too_shallow_count=too_shallow_count,
            too_deep_count=too_deep_count
        )
        
        return Response(
            {
                "score": round(score, 2),
                "details": {
                    "total_files": total_files,
                    "meaningless_count": meaningless_count,
                    "fragmented_count": fragmented_count,
                    "too_shallow_count": too_shallow_count,
                    "too_deep_count": too_deep_count,
                }
            },
            status=status.HTTP_200_OK
        )