from rest_framework.decorators import api_view
from rest_framework.response import Response

from analytics.metrics import (
    compute_cleanliness,
    build_category_distribution,
    build_radar_main_mode,
)
from analytics.personas import score_personas


@api_view(["GET"])
def dashboard_view(request):
    """
    Fuseki 없이 mock 데이터 기반 대시보드 API
    """
    #임시 카테고리 데이터 (나중에 Fuseki 연동 시 대체)
    category_counts = {
        "sseukssak:DevPlanning": 5,
        "sseukssak:StuLearning": 3,
        "sseukssak:OfficePlan": 2,
    }

    #깔끔지수 계산 (테스트용)
    cleanliness_score = compute_cleanliness(
        total_files=100,
        meaningless_count=10,
        fragmented_count=5,
        too_shallow_count=20,
        too_deep_count=3,
    )

    #Radar (Main 모드)
    radar = build_radar_main_mode(category_counts)

    #Persona 유사도 계산
    dist = build_category_distribution(category_counts)
    personas = score_personas(dist)

    #최종 JSON 반환
    return Response({
        "summary": {
            "cleanliness": cleanliness_score,
            "radar": radar,
            "personas": personas,
        },
        "raw_counts": category_counts
    })
