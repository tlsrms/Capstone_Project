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
from analytics.personas import load_persona_rules, score_personas

from collections import defaultdict, Counter 

from .extractors import TextExtractor

class DocumentViewSet(viewsets.ModelViewSet): 
    """
    문서(TextDocument) CRUD API
    - 파일 업로드 시: uploaded_file에서 텍스트 추출 + file_path는 분석용으로 저장
    - 메모장 작성 시: content 직접 저장
    - 수정 시: Fuseki 데이터 초기화 (semantic_details 리셋)
    """
    serializer_class = DocumentSerializer
    authentication_classes = [JWTAuthentication] 
    permission_classes = [IsAuthenticated]     
    
    # Fuseki 설정
    FUSEKI_UPDATE_ENDPOINT = "http://localhost:3030/sseukssak/update"
    SCHEMA_URI = "http://api.sseukssak.com/ontology#"

    def get_queryset(self):
        return TextDocument.objects.filter(author=self.request.user).order_by('-created_at')

    # Fuseki 데이터 삭제 헬퍼 함수
    def _delete_fuseki_data(self, doc_id):
        """
        문서 내용이 변경되었을 때, Fuseki에 저장된 '옛날 지식'을 삭제합니다.
        """
        doc_uri = f"{self.SCHEMA_URI}Document_{doc_id}"
        delete_query = f"""
        PREFIX sseukssak: <{self.SCHEMA_URI}>
        DELETE WHERE {{
            <{doc_uri}> ?predicate ?object .
        }}
        """
        try:
            sparql = SPARQLWrapper(self.FUSEKI_UPDATE_ENDPOINT)
            sparql.setMethod(POST)
            sparql.setQuery(delete_query)
            sparql.query()
            print(f"[Fuseki] Cleared old triples for Document {doc_id}")
        except Exception as e:
            print(f"[Fuseki Error] Failed to clear triples: {e}")

    def perform_create(self, serializer):
        """ (POST) 문서 생성 """
        # 1. 일단 데이터 저장
        instance = serializer.save(author=self.request.user)
        
        # 2. 파일 업로드 -> 텍스트 추출
        if instance.uploaded_file:
            print(f"[Extractor] Uploaded file detected: {instance.uploaded_file.name}")
            extracted_text = TextExtractor.extract(instance.uploaded_file.path)
            
            if extracted_text:
                print(f"[Extractor] Success! Length: {len(extracted_text)}")
                instance.content = extracted_text
                instance.save()
            else:
                print("[Extractor] Failed to extract text or empty result.")
        
        elif instance.content:
            print(f"[Memo] New text memo created: {instance.title}")

    def perform_update(self, serializer):
        """ (PUT/PATCH) 문서 수정 """
        # 1. 변경 전 파일 정보
        old_file = serializer.instance.uploaded_file
        
        # 2. 저장 실행 (RDB 업데이트)
        instance = serializer.save()
        new_file = instance.uploaded_file
        
        # 3. 파일이 '새로' 업로드된 경우 -> 재추출 + 초기화
        if new_file and new_file != old_file:
            print(f"[Extractor] File updated. Re-extracting from: {new_file.path}")
            extracted_text = TextExtractor.extract(new_file.path)
            
            instance.content = extracted_text
            instance.is_organized = False 
            instance.summary = ""
            instance.save()
            
            # Fuseki 데이터 삭제 (semantic_details 초기화)
            self._delete_fuseki_data(instance.id)
            
        # 4. 메타데이터(제목, 내용 등)가 바뀐 경우 -> 초기화
        elif serializer.validated_data:
             print(f"[Trigger] Metadata updated. Flagging for re-organization.")
             instance.is_organized = False
             instance.summary = ""
             instance.save()

             # Fuseki 데이터 삭제 (semantic_details 초기화)
             self._delete_fuseki_data(instance.id)

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
### INSTRUCTION ###
Analyze the provided text and generate a JSON response based on the strict schema defined below.
You must NOT output any other keys than "summary", "type_label", and "discovered_triples".

### CONSTRAINT: type_label ###
You MUST select exactly ONE type from this list:
[{type_list_str}]

### CONSTRAINT: discovered_triples ###
Extract meaningful relationships. Use ONLY these predicates:
[{predicate_list_str}]
Format: [ ["predicate_uri", "object_string"], ... ]

### INPUT TEXT ###
{document_content[:3000]} 
(Text truncated for processing limit...)

### OUTPUT FORMAT (JSON ONLY) ###
{{
    "summary": "Summarize the text in Korean (1-2 sentences).",
    "type_label": "One value from the list above",
    "discovered_triples": [
        ["sseukssak:discussesTopic", "Keyword"],
        ["sseukssak:mentionsNamedEntity", "EntityName"]
    ]
}}
"""

    def call_ollama(self, prompt, model_name="gemma3:4b"):
        """
        Ollama 서버(2.1)에 API 요청을 보내고 3-Key JSON을 파싱합니다.
        """
        OLLAMA_ENDPOINT = "http://localhost:11434/api/generate"
        
        system_instruction = (
            "You are a strict JSON generator. "
            "You output ONLY valid JSON. "
            "Do not explain. Do not include Markdown formatting. "
            "Follow the user's schema exactly."
            "Translate the summary into Korean."
        )

        try:
            payload = {
                "model": model_name,
                "format": "json",
                "stream": False,
                "prompt": prompt,
                "system": system_instruction
            }
            
            response = requests.post(OLLAMA_ENDPOINT, json=payload, timeout=120) 
            response.raise_for_status() 

            response_json = response.json()
            message_content_str = response_json.get('response', '{}')

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
    "깔끔지수" 계산 및 이력 관리
    GET /api/neatness-score/
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def _format_doc_details(self, doc):
        return {
            "id": doc.id,
            "title": doc.title,
            "path": doc.file_path
        }

    def get(self, request):
        user = request.user
        
        # 1. RDB 데이터 조회
        user_docs_qs = TextDocument.objects.filter(
            author=user, file_path__isnull=False
        ).exclude(file_path="")
        
        user_docs_map = {doc.id: doc for doc in user_docs_qs}
        total_files = len(user_docs_map)

        # 파일이 없으면 0점 처리
        if total_files == 0:
            return Response({
                "score": 0.0, 
                "previous_score": user.last_neatness_score, # 기존 점수 유지
                "improvement": 0.0,
                "raw_ratios": {"R_title": 0, "R_frag": 0, "R_shallow": 0, "R_deep": 0},
                "details": {}
            }, status=status.HTTP_200_OK)

        # 2. 감점 요인 집계
        meaningless_files = []
        too_shallow_files = []
        too_deep_files = []
        meaningless_keywords = ["제목 없음", "Untitled", "untitled", "document", "새 문서"]

        for doc in user_docs_map.values():
            # A) R_title
            is_meaningless = False
            if doc.title == "":
                is_meaningless = True
            else:
                filename = os.path.basename(doc.file_path)
                if any(k.lower() in doc.title.lower() or k.lower() in filename.lower() for k in meaningless_keywords):
                    is_meaningless = True
            if is_meaningless:
                meaningless_files.append(self._format_doc_details(doc))

            # B) R_shallow / R_deep
            try:
                path_str = os.path.normpath(doc.file_path)
                dir_str = os.path.dirname(path_str)
                depth = len(dir_str.rstrip(os.sep).split(os.sep)) - 1 
                
                if depth <= 1: too_shallow_files.append(self._format_doc_details(doc))
                elif depth >= 5: too_deep_files.append(self._format_doc_details(doc))
            except Exception:
                pass 

        # C) R_frag
        fragmented_count, fragmented_doc_ids = calculate_fragmentation(user) 
        fragmented_files = []
        for doc_id in fragmented_doc_ids:
            if doc_id in user_docs_map:
                fragmented_files.append(self._format_doc_details(user_docs_map[doc_id]))

        # 3. 점수 및 비율(Ratio) 계산
        cnt_meaningless = len(meaningless_files)
        cnt_shallow = len(too_shallow_files)
        cnt_deep = len(too_deep_files)
        
        # 가중치 적용 전 '순수 비율(0~100)' 계산 (논문의 R 값들)
        # R = (count / total) * 100
        r_title = round((cnt_meaningless / total_files) * 100, 1)
        r_frag = round((fragmented_count / total_files) * 100, 1)
        r_shallow = round((cnt_shallow / total_files) * 100, 1)
        r_deep = round((cnt_deep / total_files) * 100, 1)

        # 최종 점수 계산
        current_score = compute_cleanliness(
            total_files=total_files,
            meaningless_count=cnt_meaningless,
            fragmented_count=fragmented_count,
            too_shallow_count=cnt_shallow,
            too_deep_count=cnt_deep
        )
        current_score = round(current_score, 2)

        # 4. 변화량 계산 및 업데이트
        previous_score = user.last_neatness_score
        improvement = round(current_score - previous_score, 2)

        # (DB 업데이트) 현재 계산된 점수를 '마지막 점수'로 저장
        user.last_neatness_score = current_score
        user.save()

        # 5. 최종 응답
        return Response(
            {
                "score": current_score,              # 현재 점수
                "previous_score": previous_score,    # 이전 점수 (업데이트 전)
                "improvement": improvement,          # 변화량 (+/-)
                
                # 가중치 적용 전 각 요소의 순수 점수 (0~100)
                "raw_ratios": {
                    "R_title": r_title,      # 무의미한 제목 비율
                    "R_frag": r_frag,        # 파편화 비율
                    "R_shallow": r_shallow,  # 얕은 깊이 비율
                    "R_deep": r_deep         # 깊은 깊이 비율
                },
                
                # 상세 파일 목록
                "details": {
                    "total_files": total_files,
                    "meaningless": {"count": cnt_meaningless, "files": meaningless_files},
                    "fragmented": {"count": fragmented_count, "files": fragmented_files},
                    "shallow": {"count": cnt_shallow, "files": too_shallow_files},
                    "deep": {"count": cnt_deep, "files": too_deep_files},
                }
            },
            status=status.HTTP_200_OK
        )
    
# ---------------------------------------------------
# 2.5 BE: 대시보드 API 뷰 
# ---------------------------------------------------
class DashboardView(APIView):
    """
    "대시보드" 데이터 조회 (온톨로지 추론)
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
            file_url = None
            if doc.uploaded_file:
                try:
                    file_url = self.request.build_absolute_uri(doc.uploaded_file.url)
                except Exception:
                    file_url = doc.uploaded_file.url
            doc_map[doc.id] = {
                "id": doc.id,
                "title": doc.title,
                "summary": doc.summary,
                "file_path": doc.file_path,
                "uploaded_file": file_url,
                "updated_at": doc.updated_at.isoformat()
            }
        return doc_map

    def _build_sparql_query(self, user_uri: str, mode: str, user_job_template_uri: str, template_uri: str) -> str:
        """
        요청 모드(hobby/developer)와 직업 템플릿에 따라
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
    
# ---------------------------------------------------
# 2.5 BE: 디지털 페르소나 API 뷰
# ---------------------------------------------------
class PersonaAnalysisView(APIView):
    """
    "디지털 페르소나" 분석
    GET /api/persona/
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    SCHEMA_URI = "http://api.sseukssak.com/ontology#"
    FUSEKI_QUERY_ENDPOINT = "http://localhost:3030/sseukssak/query"
    
    # DashboardView의 상수와 헬퍼 함수 재사용
    TEMPLATES_CLASSES = DashboardView.TEMPLATES_CLASSES
    CATEGORY_LABELS = DashboardView.CATEGORY_LABELS
    _execute_sparql_query = DashboardView._execute_sparql_query
    
    # 직업별 카테고리 접두사 
    JOB_PREFIX_MAP = getattr(DashboardView, 'JOB_PREFIX_MAP', {
        "developer": "sseukssak:Dev", "student": "sseukssak:Stu",
        "office_worker": "sseukssak:Office", "default": "sseukssak:Default",
        "hobby": "sseukssak:Hobby"
    })

    # ---------------------------------------------------
    # 카테고리별 '성향 키워드' 매핑 (User Characteristic)
    # ---------------------------------------------------
    CATEGORY_KEYWORDS = {
        # 개발자
        "sseukssak:DevPlanning": "큰 그림 설계",
        "sseukssak:DevDevelopment": "구현 집착력",
        "sseukssak:DevDeployment": "배포 마스터",
        "sseukssak:DevDebugging": "문제 해결사",
        "sseukssak:DevCollaboration": "팀워크 시너지",
        "sseukssak:DevLearning": "신기술 탐구",
        # 학생
        "sseukssak:StuLearning": "학업 몰입도",
        "sseukssak:StuResearch": "심층 분석력",
        "sseukssak:StuAssignment": "과제 격파력",
        "sseukssak:StuCollaboration": "협업 능력",
        "sseukssak:StuSchedule": "계획 준수",
        # 회사원
        "sseukssak:OfficePlan": "비즈니스 기획",
        "sseukssak:OfficeCommunication": "소통 전문가",
        "sseukssak:OfficeWorkLogs": "기록 강박",
        "sseukssak:OfficeInvestigation": "데이터 기반",
        "sseukssak:OfficeAdministration": "행정 마스터",
        # 일반
        "sseukssak:DefaultSchedule": "시간 관리",
        "sseukssak:DefaultReports": "문서화 능력",
        "sseukssak:DefaultData": "정보 수집광",
        "sseukssak:DefaultEducation": "자기 계발",
        "sseukssak:DefaultExternal": "대외 활동",
        # 취미
        "sseukssak:HobbyMainJob": "워커홀릭",
        "sseukssak:HobbyLeisure": "문화 향유",
        "sseukssak:HobbyTravel": "모험심",
        "sseukssak:HobbyCreation": "창작 몰입도",
        "sseukssak:Other": "호기심 천국"
    }

    def get(self, request):
        user = request.user
        user_uri = f"{self.SCHEMA_URI}User_{user.id}"
        user_job_template = user.job_template 
        
        work_root_uri = f"<{self.SCHEMA_URI}{self.TEMPLATES_CLASSES['work_root']}>"

        # 1. (Fuseki) 전체 문서 카운트 집계
        query = f"""
        PREFIX sseukssak: <{self.SCHEMA_URI}>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

        SELECT ?category_uri (COUNT(?doc) AS ?count)
        WHERE {{
            ?doc sseukssak:hasOwner <{user_uri}> .
            ?doc sseukssak:hasType ?type .
            ?type rdfs:subClassOf* ?category_uri .
            ?category_uri rdfs:subClassOf* {work_root_uri} . 
        }}
        GROUP BY ?category_uri
        """
        
        sparql_results = self._execute_sparql_query(query)

        category_counts_map = {}

        valid_total_docs = 0
        for res in sparql_results:
            uri = res["category_uri"]["value"].replace(self.SCHEMA_URI, "sseukssak:")
            count = int(res["count"]["value"])
            
            # 우리가 '성향 키워드'를 정의해 둔 카테고리만 유효한 데이터로 인정
            if uri in self.CATEGORY_KEYWORDS:
                category_counts_map[uri] = count
                valid_total_docs += count
            
        # 2. (Analytics) 분포 및 페르소나 점수 계산
        category_distribution = build_category_distribution(category_counts_map)
        all_scores = score_personas(category_distribution)
        
        persona_rules_data = load_persona_rules()
        persona_lookup = {p['id']: p for p in persona_rules_data.get('personas', [])}

        # 3. 현재 직업에 맞는 페르소나 필터링
        valid_scores = []
        for p_score in all_scores:
            p_id = p_score['id']
            origin_data = persona_lookup.get(p_id, {})
            target = origin_data.get('target_template')
            if target == user_job_template or target == 'all' or not target:
                valid_scores.append(p_score)
        
        if not valid_scores:
            valid_scores = all_scores

        # ---------------------------------------------------
        # Top 5 카테고리 및 키워드 추출
        # ---------------------------------------------------
        
        # 1. 내 직업에 맞는 prefix 가져오기 (예: "sseukssak:Stu")
        # (JOB_PREFIX_MAP은 클래스 상단에 정의되어 있음)
        target_prefix = self.JOB_PREFIX_MAP.get(user_job_template, "sseukssak:Default")
        
        # 2. 내 직업과 관련된 카테고리만 남기기
        filtered_counts_map = {
            uri: count 
            for uri, count in category_counts_map.items() 
            if uri.startswith(target_prefix) or user_job_template == "default"
        }
        
        # 3. 필터링된 맵으로 정렬 수행
        sorted_categories = sorted(
            filtered_counts_map.items(), 
            key=lambda item: item[1], 
            reverse=True
        )
        
        # 4. 상위 5개 추출 및 데이터 구성
        top_5_types = []
        for uri, count in sorted_categories[:5]:
            percent = round((count / valid_total_docs) * 100, 1) if valid_total_docs > 0 else 0
            label = self.CATEGORY_LABELS.get(uri, uri.split(':')[-1])
            keyword = self.CATEGORY_KEYWORDS.get(uri, label) # 키워드 매핑
            
            top_5_types.append({
                "category": label,      # 예: "창작"
                "ratio": percent,       # 예: 45.5 (%)
                "keyword": keyword      # 예: "창작 몰입도"
            })
        
        # user_keywords를 Top 5 전체로 확장
        user_keywords = [item['keyword'] for item in top_5_types]

        # ---------------------------------------------------
        
        # 상위 4개 페르소나 추출 
        top_4_list = valid_scores[:4]
        enriched_top_4 = []
        for p_score in top_4_list:
            p_id = p_score['id']
            origin_data = persona_lookup.get(p_id, {})
            weights = origin_data.get('weights', {})
            
            # 각 페르소나의 특징 3가지
            features = origin_data.get('keywords', [])
            
            enriched_top_4.append({
                "id": p_id,
                "label": p_score['label'],
                "score": int(p_score['score'] * 100),
                "description": origin_data.get('description', ''),
                "features": features
            })

        # Best Persona 상세 데이터 구성 (1등)
        best_persona_enriched = None
        if enriched_top_4:
            best_persona_enriched = enriched_top_4[0].copy()
            
            # 이상적인 페르소나 모양 (Full Axis)
            p_id = best_persona_enriched['id']
            weights = persona_lookup.get(p_id, {}).get('weights', {})
            
            target_prefix = self.JOB_PREFIX_MAP.get(user_job_template, "sseukssak:Default")
            full_axes_uris = [
                uri for uri in self.CATEGORY_LABELS.keys()
                if uri.startswith(target_prefix)
            ]
            
            ideal_shape = []
            for uri in full_axes_uris:
                value = weights.get(uri, 0.1) # 기본값 0.1
                ideal_shape.append({
                    "axis": uri,
                    "label": self.CATEGORY_LABELS.get(uri, uri.split(':')[-1]),
                    "value": value
                })
            best_persona_enriched['ideal_shape'] = ideal_shape

        # 6. 최종 응답
        return Response({
            "user_job": user_job_template,
            "user_keywords": user_keywords,         # 5개 키워드 반환
            "top_5_types": top_5_types,             # 상위 5개 상세 정보
            "best_persona": best_persona_enriched,  
            "top_4_personas": enriched_top_4,       
        }, status=status.HTTP_200_OK)

# ---------------------------------------------------
# 3.4 BE: 지능형 검색 API 뷰
# ---------------------------------------------------
class SearchView(APIView):
    """
    지능형 검색
    GET /api/search/?q=키워드
    - Fuseki에 저장된 '의미(Semantic) 정보'를 검색합니다.
    """
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    SCHEMA_URI = "http://api.sseukssak.com/ontology#"
    FUSEKI_QUERY_ENDPOINT = "http://localhost:3030/sseukssak/query"
    
    # 검색 대상으로 삼을 '의미적 관계'들 (OrganizeView의 DISCOVERABLE_PREDICATES 참고)
    SEARCH_TARGET_PREDICATES = [
        "sseukssak:discussesTopic",       # 주제
        "sseukssak:mentionsNamedEntity",  # 고유명사 (기술명, 회사명 등)
        "sseukssak:mentionsPerson",       # 인물
        "sseukssak:mentionsPlace",        # 장소
        "sseukssak:mentionsEvent",        # 이벤트
        "sseukssak:referencesDate",       # 날짜
        "sseukssak:requestsAction",       # 행동 요청
    ]
    
    # 헬퍼 함수 재사용 (DashboardView와 동일)
    _execute_sparql_query = DashboardView._execute_sparql_query
    _get_documents_from_rdb = DashboardView._get_documents_from_rdb

    def get(self, request):
        user = request.user
        user_uri = f"{self.SCHEMA_URI}User_{user.id}"
        
        query_keyword = request.query_params.get('q', '').strip()
        
        if not query_keyword:
            return Response(
                {"message": "검색어를 입력해주세요.", "results": []},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 1. (Fuseki) SPARQL 검색 쿼리 생성
        # - 사용자의 문서(?doc) 중에서
        # - 우리가 지정한 관계(?p)를 가지고 있고
        # - 그 대상(?o)이 검색어를 포함(REGEX)하는 경우를 찾음
        
        # 검색 대상 Predicate들을 쿼리용 문자열로 변환 (<...>, <...>)
        predicate_list_str = ", ".join(
            f"<{self.SCHEMA_URI}{p.split(':')[-1]}>" for p in self.SEARCH_TARGET_PREDICATES
        )

        sparql_query = f"""
        PREFIX sseukssak: <{self.SCHEMA_URI}>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

        SELECT DISTINCT ?doc_id ?predicate ?object
        WHERE {{
            ?doc sseukssak:hasOwner <{user_uri}> .
            
            # 지정된 관계(?p)들 중에서만 검색
            ?doc ?predicate ?object .
            FILTER(?predicate IN ({predicate_list_str}))
            
            # 검색어 포함 여부 (대소문자 무시 'i')
            FILTER regex(str(?object), "{query_keyword}", "i")
            
            # 문서 ID 추출
            BIND(STRAFTER(STR(?doc), "Document_") AS ?doc_id_str)
            BIND(xsd:integer(?doc_id_str) AS ?doc_id)
        }}
        """
        
        sparql_results = self._execute_sparql_query(sparql_query)
        
        # 2. (RDB) 문서 상세 정보 가져오기
        found_doc_ids = {int(res["doc_id"]["value"]) for res in sparql_results}
        doc_details_map = self._get_documents_from_rdb(found_doc_ids)
        
        # 3. (BE) 결과 데이터 조립
        # - 단순히 문서만 주는 게 아니라, "왜(Why)" 검색되었는지(매칭된 이유)를 알려줍니다.
        search_results = []
        
        # Fuseki 결과(매칭된 '이유')를 문서별로 그룹화
        # { doc_id: [ {"reason": "mentionsNamedEntity", "match": "Django"}, ... ] }
        match_reasons = defaultdict(list)
        for res in sparql_results:
            doc_id = int(res["doc_id"]["value"])
            predicate = res["predicate"]["value"].replace(self.SCHEMA_URI, "sseukssak:")
            obj_value = res["object"]["value"]
            
            match_reasons[doc_id].append({
                "predicate": predicate, # 예: sseukssak:mentionsNamedEntity
                "match": obj_value      # 예: Django
            })
            
        # 최종 리스트 생성
        for doc_id, details in doc_details_map.items():
            reasons = match_reasons.get(doc_id, [])
            
            search_results.append({
                "document": details,  # RDB의 문서 정보 (id, title, summary...)
                "matched_reasons": reasons # 검색된 이유 (메타데이터 매칭 정보)
            })
            
        return Response({
            "keyword": query_keyword,
            "count": len(search_results),
            "results": search_results
        }, status=status.HTTP_200_OK)

