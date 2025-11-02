from rest_framework import serializers
from .models import TextDocument

class DocumentSerializer(serializers.ModelSerializer):
    # 'author' 필드는, DB에서 자동으로 채워줄 거고(읽기 전용),
    # 보여줄 때는 'email'로 보여줌
    author_email = serializers.ReadOnlyField(source='author.email')

    class Meta:
        model = TextDocument
        # API로 보여줄 필드들
        fields = ['id', 'author_email', 'title', 'content', 'created_at', 'updated_at']
        # API로 '읽기만' 가능하게 할 필드들 (Create/Update 시 사용자가 못바꾸게)
        read_only_fields = ['id', 'author_email', 'created_at', 'updated_at']