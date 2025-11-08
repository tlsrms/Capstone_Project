from rest_framework import serializers
from .models import TextDocument, Tag

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

    class Meta:
        model = TextDocument
        fields = ['id', 'author_email', 'title', 'content', 'tags', 'created_at', 'updated_at', 'summary']
        read_only_fields = ['id', 'author_email', 'created_at', 'updated_at', 'tags', 'summary']