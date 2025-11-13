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