import json
import requests
from SPARQLWrapper import SPARQLWrapper, POST

from django.db import transaction
from django.shortcuts import get_object_or_404

from rest_framework import viewsets, mixins, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import TextDocument, Tag
from .serializers import (
    DocumentListSerializer,
    DocumentDetailSerializer,
    DocumentWriteSerializer,
    TagSerializer,
)


# -------------------------------
# 문서 CRUD
# -------------------------------
class DocumentViewSet(viewsets.ModelViewSet):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # N+1 방지
        return (
            TextDocument.objectsRegisterView
            .filter(author=self.request.user)
            .select_related("author")
            .prefetch_related("tags")
            .order_by("-created_at")
        )

    def get_serializer_class(self):
        # 액션별로 다른 serializer
        if self.action == "list":
            return DocumentListSerializer
        if self.action == "retrieve":
            return DocumentDetailSerializer
        # create / update / partial_update
        return DocumentWriteSerializer

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)


# -------------------------------
# 태그 생성/목록
# -------------------------------
class TagViewSet(mixins.CreateModelMixin,
                 mixins.ListModelMixin,
                 viewsets.GenericViewSet):
    queryset = Tag.objects.all().order_by("tag_name")
    serializer_class = TagSerializer
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]


# -------------------------------
# 문서-태그 연결 추가/삭제
# -------------------------------
class DocumentTagView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def post(self, request, doc_id):
        document = get_object_or_404(TextDocument, id=doc_id, author=request.user)
        tag_id = request.data.get("tag_id")
        if not tag_id:
            return Response({"detail": "tag_id is required."}, status=400)
        tag = get_object_or_404(Tag, id=tag_id)
        document.tags.add(tag)  # idempotent
        return Response({"document_id": document.id, "tag_id": tag.id}, status=201)


class DocumentTagDetailView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def delete(self, request, doc_id, tag_id):
        document = get_object_or_404(TextDocument, id=doc_id, author=request.user)
        tag = get_object_or_404(Tag, id=tag_id)
        document.tags.remove(tag)  # idempotent
        return Response(status=204)


# -------------------------------
# 정리하기 (Ollama 호출 + Fuseki 저장)
#   - 화이트리스트 검증
#   - SPARQL literal escape
#   - 실패 시 재시도 가능하도록 플래그 유지
# -------------------------------
class OrganizeView(APIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

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

    # ---------- Utilities ----------
    def _esc(self, s: str) -> str:
        # SPARQL literal escape
        return (s or "").replace("\\", "\\\\").replace('"', '\\"')

    def _valid_type(self, label: str) -> bool:
        return label in self.SSEUKSSAK_TYPES

    # ---------- Prompt ----------
    def build_prompt(self, document_content):
        type_list_str = ", ".join(self.SSEUKSSAK_TYPES)
        return f"""
Analyze the following text.
Respond ONLY in JSON format with three keys: "summary", "type_label", and "reference_strings".

1. "summary": Provide a concise summary of the text.
2. "type_label": Choose ONLY ONE `type_label` from this exact list: [{type_list_str}]
3. "reference_strings": Extract a list of strings that appear to be other document titles or file names. If none, return [].

--- TEXT TO ANALYZE ---
{document_content}
"""

    # ---------- LLM Call ----------
    def call_ollama(self, prompt, model_name="llama3"):
        OLLAMA_ENDPOINT = "http://localhost:11434/api/chat"
        try:
            payload = {
                "model": model_name,
                "format": "json",
                "stream": False,
                "messages": [{"role": "user", "content": prompt}],
            }
            resp = requests.post(OLLAMA_ENDPOINT, json=payload, timeout=60)
            resp.raise_for_status()

            outer = resp.json()
            content = outer.get("message", {}).get("content", "{}").strip()

            # 코드블록 가드 (```json ... ``` 형태 방지)
            if content.startswith("```"):
                content = content.strip("`")
                if content.startswith("json"):
                    content = content[4:].strip()

            ai_result = json.loads(content)
            needed = {"summary", "type_label", "reference_strings"}
            if not needed.issubset(ai_result.keys()):
                print(f"[Ollama Error] invalid JSON keys: {ai_result}")
                return None
            if not self._valid_type(ai_result.get("type_label", "")):
                print(f"[Ollama Error] invalid type_label: {ai_result.get('type_label')}")
                return None
            return ai_result

        except requests.exceptions.ConnectionError:
            print("[Ollama Error] cannot connect to Ollama (is it running?)")
            return None
        except requests.RequestException as e:
            print(f"[Ollama Error] request failed: {e}")
            return None
        except json.JSONDecodeError:
            print(f"[Ollama Error] non-JSON content: {content[:200]}")
            return None

    # ---------- Fuseki Write ----------
    def save_to_fuseki(self, user, doc: TextDocument, ai_result) -> bool:
        FUSEKI_UPDATE_ENDPOINT = "http://localhost:3030/sseukssak/update"
        SCHEMA_URI = "http://api.sseukssak.com/ontology#"

        label = ai_result.get("type_label", "")
        if not self._valid_type(label):
            return False

        doc_uri = f"{SCHEMA_URI}Document_{doc.id}"
        user_uri = f"{SCHEMA_URI}User_{user.id}"
        type_uri = f"{SCHEMA_URI}{label}"

        # 기본 트리플
        query = f"""
        PREFIX sseukssak: <{SCHEMA_URI}>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        INSERT DATA {{
            <{doc_uri}> sseukssak:hasOwner <{user_uri}> .
            <{doc_uri}> sseukssak:hasType <{type_uri}> .
            <{type_uri}> rdfs:label "{self._esc(label)}" .
        """

        # reference_strings → RDB로 검증한 것만 추가
        safe_titles = []
        for ref in ai_result.get("reference_strings", []):
            q = TextDocument.objects.filter(
                author=user,
                title__icontains=ref
            ).exclude(id=doc.id)
            referred = q.first()
            if referred:
                ref_uri = f"{SCHEMA_URI}Document_{referred.id}"
                query += f'    <{doc_uri}> sseukssak:refersTo <{ref_uri}> .\n'
                safe_titles.append(referred.title)

        query += " }"

        try:
            sparql = SPARQLWrapper(FUSEKI_UPDATE_ENDPOINT)
            sparql.setMethod(POST)
            sparql.setQuery(query)
            sparql.query()
            print(f"[Fuseki OK] {doc_uri} -> {type_uri}")
            if safe_titles:
                print(f"[Fuseki OK] refersTo {safe_titles}")
            return True
        except Exception as e:
            print(f"[Fuseki Error] update failed for doc_id={doc.id}: {e}")
            return False

    # ---------- Entry ----------
    def post(self, request):
        user = request.user
        docs = (
            TextDocument.objects
            .filter(author=user, is_organized=False)
            .only("id", "title", "content")  # 필요한 필드만
        )
        total = docs.count()
        if total == 0:
            return Response({"message": "새로 정리할 문서가 없습니다."}, status=200)

        print(f"--- 정리 시작: {total}개 ---")
        done = 0

        for doc in docs:
            prompt = self.build_prompt(doc.content)
            ai = self.call_ollama(prompt)
            if not ai:
                print(f"[AI Fail] doc_id={doc.id}")
                continue

            success = self.save_to_fuseki(user, doc, ai)
            if not success:
                print(f"[Fuseki Fail] doc_id={doc.id}")
                continue

            # Fuseki 저장 성공 시에만 요약/플래그 갱신
            with transaction.atomic():
                doc.summary = ai.get("summary", "")
                doc.is_organized = True
                doc.save(update_fields=["summary", "is_organized"])
            done += 1

        print(f"--- 정리 완료: {done}/{total} ---")
        return Response(
            {"message": f"새로운 {total}개 문서 중 {done}개 처리를 완료했습니다."},
            status=202
        )
