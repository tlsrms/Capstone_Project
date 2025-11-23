from __future__ import annotations
from typing import Dict, List
import json
import math
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


def load_persona_rules() -> Dict:
    with open(BASE_DIR / "personas.json", encoding="utf-8") as f:
        return json.load(f)


def cosine_similarity(a: Dict[str, float], b: Dict[str, float]) -> float:
    keys = set(a.keys()) | set(b.keys())
    if not keys:
        return 0.0

    num = sum(a.get(k, 0.0) * b.get(k, 0.0) for k in keys)
    den_a = math.sqrt(sum(a.get(k, 0.0) ** 2 for k in keys))
    den_b = math.sqrt(sum(b.get(k, 0.0) ** 2 for k in keys))

    if den_a == 0.0 or den_b == 0.0:
        return 0.0

    return num / (den_a * den_b)


def score_personas(category_dist: Dict[str, float]) -> List[Dict]:
    """
    category_dist: 카테고리 IRI -> 비율(0~1)
    personas.json에 정의된 weights와 코사인 유사도로 유사도 계산.
    """
    rules = load_persona_rules()
    results: List[Dict] = []

    for p in rules.get("personas", []):
        weights = p.get("weights", {})
        score = cosine_similarity(category_dist, weights)
        results.append(
            {
                "id": p["id"],
                "label": p["label"],
                "score": round(score, 3),
            }
        )

    # 높은 순으로 정렬
    results.sort(key=lambda x: x["score"], reverse=True)
    return results
