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
from analytics.metrics import compute_cleanliness, calculate_fragmentation, build_category_distribution
from analytics.personas import score_personas

from collections import defaultdict, Counter 

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
    "깔끔지수" 계산 (논문 기반) + 감점 파일 목록 반환
    GET /api/neatness-score/
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def _format_doc_details(self, doc: TextDocument) -> dict:
        """Helper: 응답용으로 문서 정보를 간단히 포맷합니다."""
        return {
            "id": doc.id,
            "title": doc.title,
            "path": doc.file_path
        }

    def get(self, request):
        user = request.user
        
        # 1. RDB에서 모든 문서 정보를 '한 번만' 가져옴 
        user_docs_qs = TextDocument.objects.filter(
            author=user, file_path__isnull=False
        ).exclude(file_path="")
        
        # 빠른 조회를 위해 {id: doc} 딕셔너리로 변환
        user_docs_map = {doc.id: doc for doc in user_docs_qs}
        total_files = len(user_docs_map)

        if total_files == 0:
            return Response({"score": 0.0, "details": {}}, status=status.HTTP_200_OK)

        # 2. BE가 RDB 기반으로 3대 지표 계산 + 감점 파일 목록 생성
        meaningless_files = []
        too_shallow_files = []
        too_deep_files = []

        meaningless_keywords = ["제목 없음", "Untitled", "untitled", "document", "새 문서"]

        for doc in user_docs_map.values():
            # A) R_title (무의미 제목)
            is_meaningless = False
            if doc.title == "":
                is_meaningless = True
            else:
                # 'untitled.txt' 같은 케이스를 잡기 위해 파일명(경로)도 검사
                filename = os.path.basename(doc.file_path)
                if any(keyword.lower() in doc.title.lower() or keyword.lower() in filename.lower() for keyword in meaningless_keywords):
                    is_meaningless = True
                    
            if is_meaningless:
                meaningless_files.append(self._format_doc_details(doc))

            # B) R_shallow / R_deep (깊이)
            try:
                path_str = os.path.normpath(doc.file_path)
                dir_str = os.path.dirname(path_str)
                depth = len(dir_str.rstrip(os.sep).split(os.sep)) - 1 
                
                if depth <= 1: # 얕은 깊이 (depth 0 또는 1)
                    too_shallow_files.append(self._format_doc_details(doc))
                elif depth >= 5: # 깊은 깊이 (논문 정의)
                    too_deep_files.append(self._format_doc_details(doc))
            except Exception:
                pass 

        # 3. BE가 (RDB + Fuseki) 기반으로 R_frag 지표 계산
        fragmented_count, fragmented_doc_ids = calculate_fragmentation(user) 
        
        # 4. R_frag 감점 파일 목록 생성
        fragmented_files = []
        for doc_id in fragmented_doc_ids:
            if doc_id in user_docs_map:
                fragmented_files.append(self._format_doc_details(user_docs_map[doc_id]))

        # 5. (analytics) 4개 지표 '카운트'를 합산
        meaningless_count_val = len(meaningless_files)
        too_shallow_count_val = len(too_shallow_files)
        too_deep_count_val = len(too_deep_files)

        score = compute_cleanliness(
            total_files=total_files,
            meaningless_count=meaningless_count_val,
            fragmented_count=fragmented_count,
            too_shallow_count=too_shallow_count_val,
            too_deep_count=too_deep_count_val
        )
        
        # 6. 최종 응답에 '파일 목록' 포함
        return Response(
            {
                "score": round(score, 2),
                "details": {
                    "total_files": total_files,
                    "meaningless": {"count": meaningless_count_val, "files": meaningless_files},
                    "fragmented": {"count": fragmented_count, "files": fragmented_files},
                    "shallow": {"count": too_shallow_count_val, "files": too_shallow_files},
                    "deep": {"count": too_deep_count_val, "files": too_deep_files},
                }
            },
            status=status.HTTP_200_OK
        )
    
# ---------------------------------------------------
# 2.5 BE: 대시보드 API 뷰 
# ---------------------------------------------------
class DashboardView(APIView):
    """
    [핵심 기능] "대시보드" 데이터 조회 (온톨로지 추론)
    GET /api/dashboard/?mode=developer
    - '본업' 모드: '기타' 없음. 해당 템플릿의 축(e.g., 학생 5축)을 보여줌.
    - '취미' 모드: (본업/여가/여행/창작/기타 5축)
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    SCHEMA_URI = "http://api.sseukssak.com/ontology#"
    FUSEKI_QUERY_ENDPOINT = "http://localhost:3030/sseukssak/query"

    # 2.0 설계: 템플릿 최상위 Class (규칙)
    TEMPLATES_CLASSES = {
        "developer": "DeveloperTemplate",
        "student": "StudentTemplate",
        "office_worker": "OfficeWorkerTemplate",
        "default": "DefaultTemplate",
        "hobby": "HobbyTemplate",
        "work_root": "WorkTemplate",
        "hobby_root": "HobbyTemplate"
    }

    # 2.0 설계: 카테고리 라벨 (FE 매핑용)
    CATEGORY_LABELS = {
        "sseukssak:DevPlanning": "기획",
        "sseukssak:DevDevelopment": "개발",
        "sseukssak:DevDeployment": "배포",
        "sseukssak:DevDebugging": "디버깅",
        "sseukssak:DevCollaboration": "협업",
        "sseukssak:DevLearning": "학습",
        "sseukssak:StuLearning": "학습",
        "sseukssak:StuResearch": "연구",
        "sseukssak:StuAssignment": "과제",
        "sseukssak:StuCollaboration": "협업",
        "sseukssak:StuSchedule": "일정",
        "sseukssak:OfficePlan": "계획",
        "sseukssak:OfficeCommunication": "소통",
        "sseukssak:OfficeWorkLogs": "일정&기록",
        "sseukssak:OfficeInvestigation": "조사",
        "sseukssak:OfficeAdministration": "행정",
        "sseukssak:DefaultSchedule": "스케줄",
        "sseukssak:DefaultReports": "보고서",
        "sseukssak:DefaultData": "자료",
        "sseukssak:DefaultEducation": "교육",
        "sseukssak:DefaultExternal": "외부업무",
        "sseukssak:HobbyMainJob": "본업",
        "sseukssak:HobbyLeisure": "여가",
        "sseukssak:HobbyTravel": "여행",
        "sseukssak:HobbyCreation": "창작",
        "sseukssak:Other": "기타"
    }

    def _execute_sparql_query(self, query: str) -> list:
        """Helper: SPARQL 쿼리를 Fuseki에 전송하고 JSON 결과를 반환합니다."""
        try:
            sparql = SPARQLWrapper(self.FUSEKI_QUERY_ENDPOINT)
            sparql.setQuery(query)
            sparql.setReturnFormat(JSON)
            results = sparql.query().convert()
            return results.get("results", {}).get("bindings", [])
        except Exception as e:
            print(f"[Fuseki Error] Dashboard SPARQL query failed: {e}")
            return []

    def _get_documents_from_rdb(self, doc_ids: set) -> dict:
        """Helper: RDB에서 문서 상세 정보를 한 번의 쿼리로 가져옵니다."""
        if not doc_ids: return {}
        
        docs_qs = TextDocument.objects.filter(id__in=doc_ids)
        
        doc_map = {}
        for doc in docs_qs:
            doc_map[doc.id] = {
                "id": doc.id,
                "title": doc.title,
                "summary": doc.summary,
                "file_path": doc.file_path,
                "updated_at": doc.updated_at.isoformat()
            }
        return doc_map

    def _build_sparql_query(self, user_uri: str, mode: str, user_job_template_uri: str, template_uri: str) -> str:
        """
        [수정] 요청 모드(hobby/developer)와 직업 템플릿에 따라
        '카테고리'와 '문서 ID'를 추론하는 동적 SPARQL 쿼리를 생성합니다.
        """
        
        base_query = f"""
        ?doc sseukssak:hasOwner <{user_uri}> .
        ?doc sseukssak:hasType ?type .
        BIND(STRAFTER(STR(?doc), "Document_") AS ?doc_id_str)
        BIND(xsd:integer(?doc_id_str) AS ?doc_id)
        """
        
        hobby_root_uri = f"<{self.SCHEMA_URI}{self.TEMPLATES_CLASSES['hobby_root']}>"
        work_root_uri = f"<{self.SCHEMA_URI}{self.TEMPLATES_CLASSES['work_root']}>"

        query_parts = []
        
        if mode == 'hobby':
            # [취미 모드]
            query_parts.append(f"{{ {base_query} ?type rdfs:subClassOf* <{self.SCHEMA_URI}HobbyLeisure> . BIND(<{self.SCHEMA_URI}HobbyLeisure> AS ?category_uri) }}")
            query_parts.append(f"{{ {base_query} ?type rdfs:subClassOf* <{self.SCHEMA_URI}HobbyTravel> . BIND(<{self.SCHEMA_URI}HobbyTravel> AS ?category_uri) }}")
            query_parts.append(f"{{ {base_query} ?type rdfs:subClassOf* <{self.SCHEMA_URI}HobbyCreation> . BIND(<{self.SCHEMA_URI}HobbyCreation> AS ?category_uri) }}")
            query_parts.append(f"{{ {base_query} ?type rdfs:subClassOf* {user_job_template_uri} . BIND(<{self.SCHEMA_URI}HobbyMainJob> AS ?category_uri) }}")
            query_parts.append(f"""
            {{
                {base_query}
                ?type rdfs:subClassOf* {work_root_uri} .
                FILTER NOT EXISTS {{ ?type rdfs:subClassOf* {user_job_template_uri} . }}
                BIND(<{self.SCHEMA_URI}Other> AS ?category_uri)
            }}""")
        else:
            # --------------------------------
            # [본업 모드] 
            # --------------------------------
            query_parts.append(f"""
            
                {base_query}
                ?type rdfs:subClassOf* ?category_uri .       
                ?category_uri rdfs:subClassOf {template_uri} . 
            
            """)
            
        # 모든 쿼리를 UNION으로 묶어 Fuseki에 요청
        return f"""
        PREFIX sseukssak: <{self.SCHEMA_URI}>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

        SELECT ?doc_id ?category_uri
        WHERE {{
            { ' UNION '.join(query_parts) }
        }}
        """

    def get(self, request):
        user = request.user
        user_uri = f"{self.SCHEMA_URI}User_{user.id}"
        
        # 1. 'mode'와 'tag' 쿼리 파라미터를 가져옴
        mode = request.query_params.get('mode', 'default') 
        tag_name = request.query_params.get('tag', None) 
        
        user_job_template = user.job_template
        
        template_uri_str = self.TEMPLATES_CLASSES.get(mode)
        if not template_uri_str:
            mode = 'default'
            template_uri_str = self.TEMPLATES_CLASSES['default']
            
        user_job_template_uri_str = self.TEMPLATES_CLASSES.get(user_job_template, self.TEMPLATES_CLASSES['default'])
        
        template_uri = f"<{self.SCHEMA_URI}{template_uri_str}>"
        user_job_template_uri = f"<{self.SCHEMA_URI}{user_job_template_uri_str}>"

        # 2. (Fuseki) 'mode' 기준으로 모든 문서 ID/카테고리 추론 (수정 없음)
        full_query = self._build_sparql_query(user_uri, mode, user_job_template_uri, template_uri)
        sparql_results = self._execute_sparql_query(full_query)
        
        # 3. (RDB) [신규] 태그 필터링 적용
        
        # 3a. Fuseki가 찾은 모든 문서 ID (예: {42, 43, 44, 45, 46})
        all_doc_ids_from_fuseki = {int(res["doc_id"]["value"]) for res in sparql_results}
        
        # 3b. 'tag_name'이 있다면, RDB에서 이 ID 목록을 다시 필터링
        if tag_name:
            # RDB 쿼리: "Fuseki 결과 ID 중에서, 이 태그를 가진 ID만 골라내줘"
            doc_ids_with_tag = set(TextDocument.objects.filter(
                author=user,
                id__in=all_doc_ids_from_fuseki,     
                tags__tag_name__iexact=tag_name   
            ).values_list('id', flat=True))
        else:
            # 태그 필터가 없으면 모든 ID 사용
            doc_ids_with_tag = all_doc_ids_from_fuseki

        # 4. (RDB) '최종 필터링된' ID로만 문서 상세 정보 가져오기
        # (예: {42, 44}만 조회)
        doc_details_map = self._get_documents_from_rdb(doc_ids_with_tag)
        
        # 5. (BE) 데이터 최종 조립
        category_doc_map = defaultdict(list)
        category_counts_map = Counter() 

        for res in sparql_results:
            doc_id = int(res["doc_id"]["value"])
            
            # 이 doc_id가 '태그 필터'에서 살아남았는지 확인
            if doc_id in doc_ids_with_tag: 
                category_uri = res["category_uri"]["value"].replace(self.SCHEMA_URI, "sseukssak:") 
                
                if doc_id in doc_details_map: # (항상 True여야 함)
                    category_doc_map[category_uri].append(doc_details_map[doc_id])
                    category_counts_map[category_uri] += 1
        
        # 6. (BE) 방사형 그래프 및 카테고리 목록 생성 (수정 없음)
        # (이미 필터링된 category_counts_map을 사용하므로 그래프도 자동 필터링됨)
        radar_chart_data = []
        categorized_docs_list = []
        
        current_template_categories = {}
        if mode == 'hobby':
            current_template_categories = {
                "sseukssak:HobbyMainJob": "본업", "sseukssak:HobbyLeisure": "여가",
                "sseukssak:HobbyTravel": "여행", "sseukssak:HobbyCreation": "창작",
                "sseukssak:Other": "기타"
            }
        else:
             prefix = template_uri_str.split(':')[-1].replace('Template', '')[:3]
             current_template_categories = {
                uri: label for uri, label in self.CATEGORY_LABELS.items() 
                if uri.startswith(f"sseukssak:{prefix}")
             }

        for category_uri, category_name in current_template_categories.items():
            docs = category_doc_map.get(category_uri, [])
            docs.sort(key=lambda x: x['updated_at'], reverse=True) 
            count = len(docs)
            
            radar_chart_data.append({"axis": category_uri, "label": category_name, "value": count})
            categorized_docs_list.append({
                "category_label": category_name, "category_uri": category_uri,
                "count": count, "documents": docs
            })

        # 7. 최종 JSON 응답
        response_data = {
            "current_mode": mode,
            "user_job_template": user_job_template,
            "current_tag_filter": tag_name, 
            "radar_chart_data": radar_chart_data,
            "categorized_docs": categorized_docs_list
        }
        
        return Response(response_data, status=status.HTTP_200_OK)
    
class PersonaAnalysisView(APIView):
    """
    [핵심 기능] 사용자 페르소나 분석
    GET /api/persona/
    
    - Fuseki의 온톨로지(문서 타입/카테고리)를 기반으로
      사용자 문서 분포를 계산하고
    - personas.json에 정의된 페르소나들과의 코사인 유사도를 계산하여
      'MBTI 결과'처럼 가장 유사한 페르소나를 알려주는 API.
      
    LLM(ollama)은 사용하지 않고, 수학적 유사도만 사용합니다.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    # DashboardView와 동일 설정 재사용
    SCHEMA_URI = DashboardView.SCHEMA_URI
    FUSEKI_QUERY_ENDPOINT = DashboardView.FUSEKI_QUERY_ENDPOINT
    WORK_TEMPLATE_CLASS = DashboardView.TEMPLATES_CLASSES["work_root"]  # "WorkTemplate"

    # 직업군별 카테고리 IRI prefix 매핑
    JOB_CATEGORY_PREFIXES = {
        "developer": ("sseukssak:Dev",),
        "student": ("sseukssak:Stu",),
        "office_worker": ("sseukssak:Office",),
        "default": ("sseukssak:Default",),
        "hobby": ("sseukssak:Hobby",),
    }

    # 직업군별 페르소나 id prefix 매핑
    JOB_PERSONA_PREFIXES = {
        "developer": ("dev.",),
        "student": ("stu.", "scholarship."),  # 장학금 페르소나는 학생 계열
        "office_worker": ("office.",),
        "default": ("default.",),
        "hobby": ("hobby.",),
    }

    def _execute_sparql_query(self, query: str) -> list:
        """Fuseki에 SPARQL 쿼리를 보내고 bindings 리스트를 반환."""
        try:
            sparql = SPARQLWrapper(self.FUSEKI_QUERY_ENDPOINT)
            sparql.setQuery(query)
            sparql.setReturnFormat(JSON)
            results = sparql.query().convert()
            return results.get("results", {}).get("bindings", [])
        except Exception as e:
            print(f"[Fuseki Error] Persona SPARQL query failed: {e}")
            return []

    def _get_category_counts(self, user_id: int) -> dict:
        """
        Fuseki에서 로그인 사용자의 문서들을
        '작업 카테고리(Dev/Stu/Office/Default/HobbyMainJob 등)' 기준으로 집계.

        반환값 예:
        {
          "sseukssak:DevDevelopment": 10,
          "sseukssak:StuLearning": 3,
          ...
        }
        """
        user_uri = f"{self.SCHEMA_URI}User_{user_id}"
        work_root_uri = f"<{self.SCHEMA_URI}{self.WORK_TEMPLATE_CLASS}>"

        query = f"""
        PREFIX sseukssak: <{self.SCHEMA_URI}>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

        SELECT ?category_uri (COUNT(?doc) AS ?count)
        WHERE {{
            ?doc sseukssak:hasOwner <{user_uri}> ;
                 sseukssak:hasType ?type .
            ?type rdfs:subClassOf* ?category_uri .
            ?category_uri rdfs:subClassOf {work_root_uri} .
        }}
        GROUP BY ?category_uri
        """

        bindings = self._execute_sparql_query(query)
        category_counts: dict = {}

        for b in bindings:
            category_uri_full = b["category_uri"]["value"]  # 예: http://api.sseukssak.com/ontology#DevDevelopment
            count = int(b["count"]["value"])

            # prefix 형태로 변환: sseukssak:DevDevelopment
            if category_uri_full.startswith(self.SCHEMA_URI):
                local = category_uri_full[len(self.SCHEMA_URI):]
                key = f"sseukssak:{local}"
            else:
                key = category_uri_full

            category_counts[key] = category_counts.get(key, 0) + count

        return category_counts

    def get(self, request):
        user = request.user

        # 1) Fuseki에서 카테고리별 문서 수 집계 (전체)
        raw_category_counts = self._get_category_counts(user.id)

        if not raw_category_counts:
            return Response(
                {
                    "message": "사용자 문서에 대한 온톨로지 정보가 충분하지 않아 페르소나를 계산할 수 없습니다.",
                    "category_distribution": {},
                    "personas": [],
                    "top_persona": None,
                },
                status=status.HTTP_200_OK,
            )

        # 2) 유저 직업군 가져오기 (없으면 default로 처리)
        job_template = getattr(user, "job_template", None) or "default"

        # 2-1) 직업군별 카테고리 prefix 결정
        category_prefixes = self.JOB_CATEGORY_PREFIXES.get(job_template, ())

        # 2-2) 해당 prefix로 카테고리 필터링
        if category_prefixes:
            category_counts = {
                iri: cnt
                for iri, cnt in raw_category_counts.items()
                if any(iri.startswith(prefix) for prefix in category_prefixes)
            }
        else:
            category_counts = raw_category_counts

        # 혹시 필터링을 했더니 완전히 비어버리면, 일단 전체를 쓰도록 graceful fallback
        if not category_counts:
            category_counts = raw_category_counts

        # 3) 카테고리 분포(0~1) 계산
        category_dist = build_category_distribution(category_counts)

        # 4) 페르소나 유사도 계산 (전체 퍼소나 대상)
        all_personas = score_personas(category_dist)

        # 5) 직업군별로 "해당되는 퍼소나만" 필터링
        persona_prefixes = self.JOB_PERSONA_PREFIXES.get(job_template, ())
        if persona_prefixes:
            filtered_personas = [
                p for p in all_personas
                if any(p["id"].startswith(pref) for pref in persona_prefixes)
            ]
        else:
            filtered_personas = all_personas

        # 마찬가지로, 필터링 후 아무것도 없으면 전체 리스트로 fallback
        if filtered_personas:
            persona_scores = filtered_personas
        else:
            persona_scores = all_personas

        top_persona = persona_scores[0] if persona_scores else None

        # 6) 응답 생성
        return Response(
            {
                "job_template": job_template,
                "category_distribution": category_dist,  # 이미 직업군 필터 후 분포
                "personas": persona_scores,             # 직업군에 맞는 후보들
                "top_persona": top_persona,             # 그 중 최고점
            },
            status=status.HTTP_200_OK,
        )
