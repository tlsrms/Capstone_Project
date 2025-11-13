import os
from collections import Counter
from core.models import TextDocument
from users.models import CustomUser
from SPARQLWrapper import SPARQLWrapper, JSON

def calculate_fragmentation(user: CustomUser) -> int:
    """
    R_frag (파편화) 지표를 계산합니다: sum(n_g - m_g)
    BE가 RDB(file_path)와 Fuseki(type)를 조합하여 계산합니다.
    """
    SCHEMA_URI = "http://api.sseukssak.com/ontology#"
    FUSEKI_QUERY_ENDPOINT = "http://localhost:3030/sseukssak/query"
    user_uri = f"{SCHEMA_URI}User_{user.id}"

    # 1. (Fuseki) 모든 문서의 'Type(주제 그룹 g)'를 가져옵니다.
    try:
        query = f"""
        PREFIX sseukssak: <{SCHEMA_URI}>
        SELECT ?doc_id_str ?type
        WHERE {{
          ?doc sseukssak:hasOwner <{user_uri}> .
          ?doc sseukssak:hasType ?type .
          BIND(STRAFTER(STR(?doc), "Document_") AS ?doc_id_str)
        }}
        """
        sparql = SPARQLWrapper(FUSEKI_QUERY_ENDPOINT)
        sparql.setQuery(query)
        sparql.setReturnFormat(JSON)
        results = sparql.query().convert()
    except Exception as e:
        print(f"[calculate_fragmentation Error] Fuseki query failed: {e}")
        return 0 # Fuseki 연결 실패 시 0 반환

    # doc_id -> type 매핑 (예: {18: "PlanningDocument"})
    doc_id_to_type = {
        int(res['doc_id_str']['value']): res['type']['value']
        for res in results['results']['bindings']
    }
    if not doc_id_to_type:
        return 0

    # 2. (RDB) 모든 문서의 '폴더(path)'를 가져옵니다.
    doc_id_to_folder = {
        doc.id: os.path.dirname(os.path.normpath(doc.file_path)) # file_path에서 '폴더'만 추출
        for doc in TextDocument.objects.filter(
            author=user, 
            id__in=doc_id_to_type.keys() # Fuseki에 있는 문서들만
        ).only("id", "file_path")
    }

    # 3. '주제 그룹(g)'별로 '폴더' 카운트
    topic_to_folders = {}
    for doc_id, topic in doc_id_to_type.items():
        folder = doc_id_to_folder.get(doc_id)
        if not folder or folder == ".": continue
            
        if topic not in topic_to_folders:
            topic_to_folders[topic] = []
        topic_to_folders[topic].append(folder)

    # 4. n_g - m_g (파편화 값) 계산
    total_fragmented_count = 0
    for topic, folders in topic_to_folders.items():
        n_g = len(folders) # (n_g) 이 주제의 총 파일 수
        if n_g <= 1: continue
            
        m_g = Counter(folders).most_common(1)[0][1] # (m_g) 가장 많은 파일이 모인 폴더의 개수
        
        total_fragmented_count += (n_g - m_g)

    return total_fragmented_count