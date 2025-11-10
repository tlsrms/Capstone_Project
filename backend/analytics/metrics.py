from __future__ import annotations
from typing import Dict, List


def compute_cleanliness(
    total_files: int,
    meaningless_count: int,
    fragmented_count: int,
    too_shallow_count: int,
    too_deep_count: int,
    w_title: float = 0.25,    # 논문 기본값 (균등 가중치)
    w_frag: float = 0.25,
    w_shallow: float = 0.25,
    w_deep: float = 0.25,
) -> float:
    """
    [파일 구조 기반 깔끔지수 v3: 논문 공식 + 가중치 확장형]

    깔끔지수 = 100 - (w_title*A + w_frag*B + w_shallow*C + w_deep*D)

    - A: 무의미한 제목 비율 (meaningless_count / total_files)
    - B: 파편화된 파일 비율 (fragmented_count / total_files)
    - C: 너무 얕은 깊이의 파일 비율 (too_shallow_count / total_files)
          예: depth == 0 (바탕화면/최상위 폴더 등)
    - D: 너무 깊은 깊이의 파일 비율 (too_deep_count / total_files)
          예: depth >= 5

    total_files가 0이면 0.0 반환.
    반환값은 0.0 ~ 100.0 (점수) 범위.
    """
    if total_files <= 0:
        return 0.0

    # 각 비율 계산 (0~100%)
    A = meaningless_count / total_files * 100
    B = fragmented_count / total_files * 100
    C = too_shallow_count / total_files * 100
    D = too_deep_count / total_files * 100

    # 가중합 계산
    penalty = w_title * A + w_frag * B + w_shallow * C + w_deep * D

    # 최종 점수 (0~100 범위로 제한)
    return max(0.0, min(100.0, 100.0 - penalty))


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


def build_radar_hobby_mode(category_counts: Dict[str, int]) -> List[Dict]:
    """
    mode=hobby 일 때 레이더 축 값 생성.
    취미 관련 타입 비율을 여가 / 여행 / 창작 / 본업으로 나눠서 보여준다.
    """
    groups = {
        "Hobby_Leisure": [
            "sseukssak:MovieDrama",
            "sseukssak:Reading",
            "sseukssak:Music",
            "sseukssak:Game",
            "sseukssak:Exercise",
            "sseukssak:Pet",
        ],
        "Hobby_Travel": [
            "sseukssak:TravelLog",
            "sseukssak:TravelPhoto",
            "sseukssak:TravelPlan",
        ],
        "Hobby_Creation": [
            "sseukssak:Blog",
            "sseukssak:Writing",
            "sseukssak:Drawing",
            "sseukssak:Diary",
        ],
        "Hobby_MainJob": [
            "sseukssak:HobbyMainJob",
        ],
    }

    axis_values: Dict[str, int] = {}
    for axis, cats in groups.items():
        axis_values[axis] = sum(category_counts.get(c, 0) for c in cats)

    total = sum(axis_values.values()) or 1

    labels = {
        "Hobby_Leisure": "여가",
        "Hobby_Travel": "여행",
        "Hobby_Creation": "창작",
        "Hobby_MainJob": "본업",
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


def build_cleanliness_summary(
    before: Dict[str, int],
    after: Dict[str, int],
) -> Dict:
    """
    파일 기반 지표를 사용한 정리 전/후 깔끔지수 비교.

    before/after 예시:
    {
        "total_files": 100,
        "meaningless_count": 10,
        "fragmented_count": 5,
        "too_shallow_count": 20,
        "too_deep_count": 3
    }
    """
    score_before = compute_cleanliness(**before)
    score_after = compute_cleanliness(**after)

    return {
        "before": round(score_before, 2),
        "after": round(score_after, 2),
        "improvement": round(score_after - score_before, 2),
    }
