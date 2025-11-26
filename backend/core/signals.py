import os
from django.db.models.signals import post_delete
from django.dispatch import receiver
from SPARQLWrapper import SPARQLWrapper, POST
from .models import TextDocument

FUSEKI_UPDATE_ENDPOINT = "http://localhost:3030/sseukssak/update"
SCHEMA_URI = "http://api.sseukssak.com/ontology#"

@receiver(post_delete, sender=TextDocument)
def cleanup_document_artifacts(sender, instance, **kwargs):
    """
    TextDocument가 삭제될 때 자동으로 실행되는 '청소부' 함수
    1. Fuseki에 저장된 관련 트리플 삭제
    2. Media 폴더에 저장된 실제 파일 삭제
    """
    print(f"[Signal] Cleaning up artifacts for Document ID: {instance.id}...")

    # 1. Fuseki 데이터 삭제 (고아 트리플 방지)
    doc_uri = f"{SCHEMA_URI}Document_{instance.id}"
    
    delete_query = f"""
    PREFIX sseukssak: <{SCHEMA_URI}>
    DELETE WHERE {{
        <{doc_uri}> ?predicate ?object .
    }}
    """
    
    try:
        sparql = SPARQLWrapper(FUSEKI_UPDATE_ENDPOINT)
        sparql.setMethod(POST)
        sparql.setQuery(delete_query)
        sparql.query()
        print(f"[Signal] Fuseki triples deleted for {doc_uri}")
    except Exception as e:
        print(f"[Signal Error] Failed to delete Fuseki triples: {e}")

    # 2. Media 원본 파일 삭제 (용량 낭비 방지)
    if instance.uploaded_file:
        if os.path.isfile(instance.uploaded_file.path):
            os.remove(instance.uploaded_file.path)
            print(f"[Signal] Media file deleted: {instance.uploaded_file.path}")
        else:
            print(f"[Signal] Media file not found (already deleted?): {instance.uploaded_file.path}")