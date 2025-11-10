from __future__ import annotations
from typing import Dict, List


def compute_cleanliness(
    total_documents: int,
    classified_documents: int,
    linked_documents: int = 0,
    tagged_documents: int = 0,
    w_classified: float = 0.6,
    w_linked: float = 0.25,
    w_tagged: float = 0.15,
) -> float:
    """
    깔끔지수 = 분류율 + 연결성 + 태그 활용도를 가중합으로 계산.
    - total_documents: 전체 문서 수
    - classified_documents: hasType 붙은 문서 수
    - linked_documents: refersTo 등 관계가 있는 문서 수
    - tagged_documents: 태그 하나 이상 가진 문서 수
    """
    if total_documents <= 0:
        return 0.0

    classified_ratio = classified_documents / total_documents
    linked_ratio = linked_documents / total_documents
    tagged_ratio = tagged_documents / total_documents

    score = (
        w_classified * classified_ratio
        + w_linked * linked_ratio
        + w_tagged * tagged_ratio
    )
    # 0.0 ~ 1.0 범위로 제한
    return max(0.0, min(1.0, score))


def build_buckets(
    category_counts: Dict[str, int],
    labels: Dict[str, str],
) -> List[Dict]:
    """
    Fuseki에서 가져온 {카테고리 IRI: 문서 수}를
    /api/dashboard의 buckets 형식으로 변환.

    category_counts 예시:
        {
          "sseukssak:DevPlanning": 10,
          "sseukssak:StuLearning": 5
        }
    """
    buckets: List[Dict] = []
    for category, count in category_counts.items():
        buckets.append(
            {
                "category": category,
                "label": labels.get(category, category),
                "count": int(count),
            }
        )

    # 보기 좋게 라벨 기준 정렬
    buckets.sort(key=lambda x: x["label"])
    return buckets


def build_category_distribution(category_counts: Dict[str, int]) -> Dict[str, float]:
    """
    buckets를 기반으로 0~1 사이의 비율 분포 생성.
    페르소나 유사도 계산 등에 사용.
    """
    total = sum(category_counts.values())
    if total <= 0:
        return {}
    return {cat: count / total for cat, count in category_counts.items() if count > 0}


def build_radar_main_mode(category_counts: Dict[str, int]) -> List[Dict]:
    """
    mode=main 일 때 레이더 축 값 생성.
    Dev / Student / Office / Default / Hobby 를 축으로 사용.
    """
    groups = {
        "Main_Dev": [
            "sseukssak:DevPlanning",
            "sseukssak:DevDevelopment",
            "sseukssak:DevDeployment",
            "sseukssak:DevDebugging",
            "sseukssak:DevCollaboration",
            "sseukssak:DevLearning",
        ],
        "Main_Student": [
            "sseukssak:StuLearning",
            "sseukssak:StuResearch",
            "sseukssak:StuAssignment",
            "sseukssak:StuCollaboration",
            "sseukssak:StuSchedule",
        ],
        "Main_Office": [
            "sseukssak:OfficePlan",
            "sseukssak:OfficeCommunication",
            "sseukssak:OfficeWorkLogs",
            "sseukssak:OfficeInvestigation",
            "sseukssak:OfficeAdministration",
        ],
        "Main_Default": [
            "sseukssak:DefaultSchedule",
            "sseukssak:DefaultReports",
            "sseukssak:DefaultData",
            "sseukssak:DefaultEducation",
            "sseukssak:DefaultExternal",
        ],
        "Hobby_Total": [
            "sseukssak:HobbyMainJob",
            "sseukssak:HobbyLeisure",
            "sseukssak:HobbyTravel",
            "sseukssak:HobbyCreation",
        ],
    }

    axis_values: Dict[str, int] = {}
    for axis, cats in groups.items():
        axis_values[axis] = sum(category_counts.get(c, 0) for c in cats)

    total = sum(axis_values.values()) or 1

    labels = {
        "Main_Dev": "개발자",
        "Main_Student": "학생",
        "Main_Office": "회사원",
        "Main_Default": "일반",
        "Hobby_Total": "취미",
    }

    radar: List[Dict] = []
    for axis, value in axis_values.items():
        radar.append(
            {
                "axis": axis,
                "label": labels.get(axis, axis),
                "value": round(value / total, 3),
            }
        )
    return radar
