from rest_framework import serializers
from .models import TextDocument

class DocumentSerializer(serializers.ModelSerializer):
    author_email = serializers.ReadOnlyField(source='author.email')

    class Meta:
        model = TextDocument
        fields = ['id', 'author_email', 'title', 'content', 'created_at', 'updated_at']
        read_only_fields = ['id', 'author_email', 'created_at', 'updated_at']