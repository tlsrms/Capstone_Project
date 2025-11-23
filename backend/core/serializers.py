from rest_framework import serializers
from .models import TextDocument, Tag
from SPARQLWrapper import SPARQLWrapper, JSON

class TagSerializer(serializers.ModelSerializer):
    # 'id' 필드를 'tag_id'라는 이름으로 응답에 포함시킵니다.
    tag_id = serializers.IntegerField(source='id', read_only=True)

    class Meta:
        model = Tag
        # API 명세서에 맞게 'id' 대신 'tag_id'와 'tag_name'을 포함시킵니다.
        fields = ['tag_id', 'tag_name']
    
class DocumentSerializer(serializers.ModelSerializer):
    author_email = serializers.ReadOnlyField(source='author.email')
    
    # 'tag_name'만 간단히 리스트로 보여줄 때:
    tags = serializers.SlugRelatedField(
        many=True,
        read_only=True,
        slug_field='tag_name'
    )

    # 'tag_id'와 'tag_name'을 모두 포함하는 객체 리스트로 보여줄 때:
    tags = TagSerializer(many=True, read_only=True)

    summary = serializers.CharField(read_only=True)

    # 2.6 티켓 - Fuseki에서 '타입'과 '관계'를 가져오는 필드
    semantic_details = serializers.SerializerMethodField()

    class Meta:
        model = TextDocument
        fields = [
            'id', 'author_email', 'title', 'content', 
            'file_path',
            'uploaded_file',
            'tags', 
            'created_at', 'updated_at', 
            'summary',
            'semantic_details'
        ]
        
        # read_only_fields에서 'file_path' 제거
        read_only_fields = [
            'id', 'author_email', 'created_at', 'updated_at', 'tags',
            'summary', 'semantic_details'
        ]
        
        # 'file_path'는 쓰기(POST/PATCH)는 가능하지만, 필수는 아님
        extra_kwargs = {
            'file_path': {'required': False, 'allow_blank': True}
        }

    def get_semantic_details(self, obj: TextDocument) -> dict:
        """
        (2.6) Fuseki에 쿼리하여 이 문서의 'Type'과 '관계'를 가져옵니다.
        (GET /api/documents/<id>/ 호출 시 실행됨)
        """
        SCHEMA_URI = "http://api.sseukssak.com/ontology#"
        FUSEKI_QUERY_ENDPOINT = "http://localhost:3030/sseukssak/query"
        
        doc_uri = f"<{SCHEMA_URI}Document_{obj.id}>"
        
        # 이 문서를 '주어(subject)'로 갖는 모든 트리플(관계)을 조회
        query = f"""
        PREFIX sseukssak: <{SCHEMA_URI}>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

        SELECT ?predicate ?object
        WHERE {{
            {doc_uri} ?predicate ?object .
            
            # hasOwner는 'User_1' URI라 불필요하므로 제외
            FILTER(?predicate != sseukssak:hasOwner)
        }}
        """
        
        type_uri = None
        type_label = None
        relations = []
        
        try:
            sparql = SPARQLWrapper(FUSEKI_QUERY_ENDPOINT)
            sparql.setQuery(query)
            sparql.setReturnFormat(JSON)
            results = sparql.query().convert().get("results", {}).get("bindings", [])
            
            for res in results:
                predicate_uri = res['predicate']['value']
                object_uri_or_literal = res['object']['value']
                
                predicate = predicate_uri.replace(SCHEMA_URI, 'sseukssak:')
                
                if predicate == 'sseukssak:hasType':
                    type_uri = object_uri_or_literal.replace(SCHEMA_URI, 'sseukssak:')
                
                elif predicate == 'rdfs:label':
                    # OrganizeView가 (type_uri rdfs:label "PlanningDocument")로
                    # 저장한 값을 찾습니다.
                    pass # (이 로직은 보강이 필요하지만, 지금은 넘어갑니다)
                
                elif 'sseukssak:' in predicate:
                     relations.append({
                        "predicate": predicate,
                        "object": object_uri_or_literal 
                     })
            
            # type_label을 type_uri에서 직접 파생
            if type_uri:
                type_label = type_uri.split(':')[-1]
                     
        except Exception as e:
            print(f"[Fuseki Error] get_semantic_details failed for doc {obj.id}: {e}")

        return {
            "type_uri": type_uri, 
            "type_label": type_label, # 예: "PlanningDocument"
            "relations": relations
        }