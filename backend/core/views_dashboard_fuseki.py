# core/views_dashboard_fuseki.py
import json
from pathlib import Path

from django.conf import settings
from django.utils.translation import gettext_lazy as _

from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework import status

from SPARQLWrapper import SPARQLWrapper, JSON

from analytics.metrics import (
    compute_cleanliness,
    build_category_distribution,
    build_radar_main_mode,
    build_radar_hobby_mode,
    build_buckets,
)
from analytics.personas import score_personas


def _load_category_labels() -> dict:
    """
    categories.json 로딩: { "categories": { "sseukssak:DevPlanning": { "label": "..." }, ... } }
    실패 시 빈 dict 반환.
    """
    path = Path(settings.CATEGORY_TEMPLATE_PATH)
    try:
        with path.open(encoding="utf-8") as f:
            data = json.load(f)
        return data.get("categories", {})
    except Exception:
        return {}


def _pref(ns_local: str) -> str:
    """ 'sseukssak:DevPlanning' → 풀 URI 문자열 """
    if ":" not in ns_local:
        return ns_local
    prefix, local = ns_local.split(":", 1)
    base = settings.SSEUKSSAK_SCHEMA_URI  # "http://api.sseukssak.com/ontology#"
    if prefix == "sseukssak":
        return f"{base}{local}"
    return ns_local  # 확장 여지


def _user_uri(django_user_id: int) -> str:
    """ User_{id} URI 구성 규칙 """
    return f"{settings.SSEUKSSAK_SCHEMA_URI}User_{django_user_id}"


def _select_category_counts(user_id: int) -> dict:
    """
    Fuseki에서 로그인 사용자의 문서 타입(카테고리) 집계를 가져와 dict 로 반환.
    { 'sseukssak:DevPlanning': 10, ... }
    """
    endpoint = settings.FUSEKI_QUERY_ENDPOINT
    default_graph = settings.FUSEKI_DEFAULT_GRAPH
    schema = settings.SSEUKSSAK_SCHEMA_URI

    user_uri = _user_uri(user_id)

    # 사용자 문서의 타입(카테고리)별 카운트 집계
    # ?type 은 풀 URI로 나오므로, 응답 파싱 후 prefix 붙여서 반환.
    sparql = SPARQLWrapper(endpoint)
    if default_graph:
        sparql.addDefaultGraph(default_graph)
    sparql.setReturnFormat(JSON)

    query = f"""
    PREFIX sseukssak: <{schema}>
    SELECT ?type (COUNT(?doc) AS ?count)
    WHERE {{
        ?doc sseukssak:hasOwner <{user_uri}> ;
             sseukssak:hasType ?type .
    }}
    GROUP BY ?type
    """
    sparql.setQuery(query)

    out = {}
    try:
        res = sparql.query().convert()
        for b in res.get("results", {}).get("bindings", []):
            type_uri = b["type"]["value"]  # 풀 URI
            count = int(b["count"]["value"])
            # prefix 복원
            if type_uri.startswith(schema):
                local = type_uri[len(schema):]
                key = f"sseukssak:{local}"
            else:
                key = type_uri
            out[key] = count
        return out
    except Exception as e:
        # Fuseki 실패 시 빈 dict 반환 (상위에서 폴백)
        print(f"[Fuseki SELECT Error] {e}")
        return {}


@api_view(["GET"])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def dashboard_view_fuseki(request):
    """
    GET /api/dashboard
    - Fuseki 연동으로 사용자별 문서 타입 집계
    - 라벨/버킷/레이더/페르소나/깔끔지수 포함
    쿼리파라미터:
      - mode=main|hobby (radar 축 선택, 기본 main)
      - wt,wfrag,wsh,wdp (깔끔지수 가중치, 기본 0.25)
    """
    user = request.user
    mode = (request.query_params.get("mode") or "main").lower()

    # 가중치 파라미터 파싱 (유효하지 않으면 400)
    def _fget(name, default):
        v = request.query_params.get(name)
        if v is None:
            return default
        try:
            return float(v)
        except ValueError:
            raise ValueError(name)

    try:
        w_title   = _fget("wt",   0.25)
        w_frag    = _fget("wfrag",0.25)
        w_shallow = _fget("wsh",  0.25)
        w_deep    = _fget("wdp",  0.25)
    except ValueError as bad:
        return Response({"detail": f"invalid weight parameter: {bad}"}, status=status.HTTP_400_BAD_REQUEST)

    # 1) Fuseki에서 카테고리 카운트 가져오기
    category_counts = _select_category_counts(user.id)

    # Fuseki가 비어있으면 안전한 폴백(더미)
    if not category_counts:
        category_counts = {
            "sseukssak:DevPlanning": 5,
            "sseukssak:StuLearning": 3,
            "sseukssak:OfficePlan": 2,
        }

    # 2) 레이블 매핑 로드 → buckets 구성
    cat_labels_def = _load_category_labels()  # { "sseukssak:DevPlanning": {"label":"..."} }
    label_map = {k: v.get("label", k) for k, v in cat_labels_def.items()}

    buckets = build_buckets(category_counts, label_map)

    # 3) 레이더 (main/hobby)
    if mode == "hobby":
        radar = build_radar_hobby_mode(category_counts)
    else:
        radar = build_radar_main_mode(category_counts)

    # 4) 페르소나
    dist = build_category_distribution(category_counts)
    personas = score_personas(dist)

    # 5) 깔끔지수 (초기엔 더미/정책 확정 전)
    cleanliness = compute_cleanliness(
        total_files=100,
        meaningless_count=10,
        fragmented_count=5,
        too_shallow_count=20,
        too_deep_count=3,
        w_title=w_title,
        w_frag=w_frag,
        w_shallow=w_shallow,
        w_deep=w_deep,
    )

    return Response({
        "summary": {
            "cleanliness": round(cleanliness, 2),
            "radar_mode": mode,
            "radar": radar,
            "personas": personas,
        },
        "buckets": buckets,
        "raw_counts": category_counts,
    }, status=status.HTTP_200_OK)
