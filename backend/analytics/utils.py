import os
from collections import Counter
from collections import Counter, defaultdict
from core.models import TextDocument
from users.models import CustomUser
from SPARQLWrapper import SPARQLWrapper, JSON

def calculate_fragmentation(user: CustomUser) -> (int, set): 
    """
    R_frag (파편화) 지표를 계산합니다: sum(n_g - m_g)
    (수정) 파편화된 파일의 ID 목록(set)도 함께 반환합니다.
    """
    SCHEMA_URI = "http://api.sseukssak.com/ontology#"
    FUSEKI_QUERY_ENDPOINT = "http://localhost:3030/sseukssak/query"
    user_uri = f"{SCHEMA_URI}User_{user.id}"

    # 1. (Fuseki)
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
        return 0, set() 

    doc_id_to_type = {
        int(res['doc_id_str']['value']): res['type']['value']
        for res in results['results']['bindings']
    }
    if not doc_id_to_type:
        return 0, set() 

    # 2. (RDB)
    doc_id_to_folder = {
        doc.id: os.path.dirname(os.path.normpath(doc.file_path))
        for doc in TextDocument.objects.filter(
            author=user, 
            id__in=doc_id_to_type.keys()
        ).only("id", "file_path")
    }

    # 3. [수정] '주제 그룹(g)'별로 '(폴더, doc_id)' 튜플 리스트 생성
    topic_to_folder_docs = defaultdict(list)
    for doc_id, topic in doc_id_to_type.items():
        folder = doc_id_to_folder.get(doc_id)
        if not folder or folder == ".": continue
        topic_to_folder_docs[topic].append((folder, doc_id)) # (폴더, doc_id) 저장

    # 4. n_g - m_g (파편화 값) 계산
    total_fragmented_count = 0
    fragmented_doc_ids = set() # 파편화된 ID를 담을 셋

    for topic, folder_docs in topic_to_folder_docs.items():
        n_g = len(folder_docs) # (n_g) 이 주제의 총 파일 수
        if n_g <= 1: continue
            
        # 이 주제에서 가장 빈번하게 등장한 '폴더' 찾기
        folder_list = [fd[0] for fd in folder_docs]
        most_common_folder, m_g = Counter(folder_list).most_common(1)[0]
        
        total_fragmented_count += (n_g - m_g)
        
        # '파편화된' 파일 (가장 큰 그룹에 속하지 않은) ID 수집
        for folder, doc_id in folder_docs:
            if folder != most_common_folder:
                fragmented_doc_ids.add(doc_id)

    return total_fragmented_count, fragmented_doc_ids 