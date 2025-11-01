# core/models.py
from django.db import models
from django.conf import settings # 👈 1. Django 설정 파일(settings.py)을 가져와야 해

# 우리가 설계한 '메모 보관함' 테이블
class TextDocument(models.Model):
    # '글쓴이' 필드:
    # 'users.CustomUser'를 직접 쓰는 대신,
    # settings.py에 선포했던 'AUTH_USER_MODEL'을 쓰는 게 표준 방식이야.
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,  # 👈 '우리가 공식 지정한 User 모델'과 연결!
        on_delete=models.CASCADE,  # User가 삭제되면, 이 사람이 쓴 글도 다 삭제
        related_name='documents'   # (나중에 User를 통해 문서를 찾을 때 쓸 이름)
    )
    
    # 우리가 설계한 나머지 필드들
    title = models.CharField(max_length=200, blank=True) # 제목 (빈칸 허용)
    content = models.TextField(blank=True)             # 내용 (빈칸 허용)
    created_at = models.DateTimeField(auto_now_add=True) # 처음 생성 시간
    updated_at = models.DateTimeField(auto_now=True)     # 수정 시간

    def __str__(self):
        return self.title if self.title else f"Document {self.id}"