# core/admin.py
from django.contrib import admin
from .models import TextDocument, Tag


@admin.register(TextDocument)
class TextDocumentAdmin(admin.ModelAdmin):
    list_display = ('id', 'title', 'author', 'created_at', 'is_organized')
    list_filter = ('is_organized', 'created_at')
    search_fields = ('title', 'content')


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ('id', 'tag_name')
    search_fields = ('tag_name',)