from django.db import models
from django.conf import settings

class Tag(models.Model):
    tag_name = models.CharField(max_length=100, unique=True)

    def __str__(self):
        return self.tag_name
    
class TextDocument(models.Model):
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.CASCADE, 
        related_name='documents')
    
    title = models.CharField(max_length=200, blank=True)
    content = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    tags = models.ManyToManyField(
        Tag,
        related_name='documents', # (Tag 입장에서 문서를 부를 때: tag.documents.all())
        blank=True
    )

    is_organized = models.BooleanField(default=False)
    summary = models.TextField(blank=True, default='') # AI 요약본

    file_path = models.CharField(max_length=1024, blank=True, db_index=True) # (파편화/깊이 계산)을 위한 file_path 필드

    # 실제 파일 저장 필드
    uploaded_file = models.FileField(upload_to='documents/%Y/%m/%d/', blank=True, null=True)
    
    def __str__(self):
        return self.title