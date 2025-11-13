# users/models.py

from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.utils import timezone

# 1. '매니저' 클래스: User를 '어떻게' 만들지 정의
class CustomUserManager(BaseUserManager):
    
    # 일반 유저 만드는 함수
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('이메일은 필수 항목입니다.')
        
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password) # 비밀번호는 '암호화'해서 저장!
        user.save(using=self._db)
        return user

    # 관리자(superuser) 유저 만드는 함수
    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        
        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')
        
        return self.create_user(email, password, **extra_fields)

# 2. '커스텀 유저' 모델 (우리가 설계한 테이블)
class CustomUser(AbstractBaseUser, PermissionsMixin):
    # 우리가 설계한 필드들
    email = models.EmailField(unique=True) # 이게 바로 '우리의 아이디'
    
    # Django가 기본적으로 필요로 하는 필드들 (설계도에 있던 것)
    is_staff = models.BooleanField(default=False)    # 관리자 페이지 접근 권한
    is_active = models.BooleanField(default=True)   # 활성 사용자 여부 (로그인 가능 여부)
    date_joined = models.DateTimeField(default=timezone.now) # 가입일

    # 2.5 티켓을 위한 '직업 템플릿' 필드
    job_template = models.CharField(
        max_length=50, 
        blank=True, 
        default='default' # 기본값 '일반'
    )

    # 이 모델을 관리할 '매니저'를 위에서 만든 CustomUserManager로 지정
    objects = CustomUserManager()
    
    # '아이디'로 사용할 필드를 'email'로 지정 (가장 중요!)
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = [] # (슈퍼유저 만들 때 email 외에 추가로 물어볼 필드, 지금은 없음)

    def __str__(self):
        return self.email