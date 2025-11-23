import React, { useState, useRef, useEffect } from 'react';

// ============================================
// API 설정
// ============================================
const API_BASE_URL = 'http://localhost:8000/api';

const getAuthToken = () => localStorage.getItem('access_token');

const getHeaders = () => {
    const headers = { 'Content-Type': 'application/json' };
    const token = getAuthToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
};

const handleResponse = async (response) => {
    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'An error occurred' }));
        throw new Error(error.detail || 'API request failed');
    }
    return response.json();
};

// 백엔드 → 프론트엔드 데이터 변환
const transformMemoFromBackend = (backendMemo) => {
    const lines = (backendMemo.content || '').split('\n');
    const todos = [];
    let regularContent = [];

    lines.forEach(line => {
        const completedMatch = line.match(/^☑\s*(.+)$/);
        const uncompletedMatch = line.match(/^☐\s*(.+)$/);
        
        if (completedMatch) {
            todos.push({ text: completedMatch[1].trim(), completed: true });
        } else if (uncompletedMatch) {
            todos.push({ text: uncompletedMatch[1].trim(), completed: false });
        } else if (line.trim()) {
            regularContent.push(line);
        }
    });

    return {
        id: backendMemo.id,
        title: backendMemo.title || '제목 없음',
        content: regularContent.join('\n'),
        tags: backendMemo.tags ? backendMemo.tags.map(tag => tag.tag_name) : [],
        todos: todos,
        created_at: backendMemo.created_at,
        updated_at: backendMemo.updated_at,
    };
};

// 프론트엔드 → 백엔드 데이터 변환
const transformMemoToBackend = (frontendMemo) => {
    let fullContent = frontendMemo.content || '';
    
    if (frontendMemo.todos && frontendMemo.todos.length > 0) {
        const todoLines = frontendMemo.todos.map(todo => 
            `${todo.completed ? '☑' : '☐'} ${todo.text}`
        ).join('\n');
        fullContent = fullContent ? `${fullContent}\n${todoLines}` : todoLines;
    }

    return {
        title: frontendMemo.title || '',
        content: fullContent
        // 태그는 별도 API로 처리하므로 여기서 제외
    };
};

function MemoMainPage() {
    const [quickInput, setQuickInput] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [showTagFilter, setShowTagFilter] = useState(false);
    const [selectedTags, setSelectedTags] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [editingMemo, setEditingMemo] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [newMemo, setNewMemo] = useState({
        title: '',
        content: '',
        tags: ''
    });
    const [memos, setMemos] = useState([]);
    const contentEditableRef = useRef(null);

    // 컴포넌트 마운트 시 메모 불러오기
    useEffect(() => {
        fetchMemos();
    }, []);

    // ============================================
    // API 함수들
    // ============================================
    const fetchMemos = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await fetch(`${API_BASE_URL}/documents/`, {
                method: 'GET',
                headers: getHeaders(),
            });
            const data = await handleResponse(response);
            const transformedData = data.map(transformMemoFromBackend);
            setMemos(transformedData);
        } catch (err) {
            setError('메모를 불러오는데 실패했습니다: ' + err.message);
            console.error('Error fetching memos:', err);
        } finally {
            setLoading(false);
        }
    };

    const createMemo = async (memoData) => {
        try {
            const backendData = transformMemoToBackend(memoData);
            
            // 1. 메모만 생성 (태그 없이)
            const response = await fetch(`${API_BASE_URL}/documents/`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify(backendData),
            });
            const data = await handleResponse(response);
            
            // 2. 태그가 있으면 추가
            if (memoData.tags && memoData.tags.length > 0) {
                await addTagsToDocument(data.id, memoData.tags);
            }
            
            // 3. 최종 메모 조회 (태그 포함)
            const updatedResponse = await fetch(`${API_BASE_URL}/documents/${data.id}/`, {
                method: 'GET',
                headers: getHeaders(),
            });
            const updatedData = await handleResponse(updatedResponse);
            return transformMemoFromBackend(updatedData);
        } catch (err) {
            console.error('Error in createMemo:', err);
            throw err;
        }
    };

    const updateMemo = async (id, memoData) => {
        try {
            const backendData = transformMemoToBackend(memoData);
            
            // 1. 메모 내용만 수정 (태그 없이)
            const response = await fetch(`${API_BASE_URL}/documents/${id}/`, {
                method: 'PUT',
                headers: getHeaders(),
                body: JSON.stringify(backendData),
            });
            await handleResponse(response);
            
            // 2. 현재 메모의 태그 정보 가져오기
            const currentMemoResponse = await fetch(`${API_BASE_URL}/documents/${id}/`, {
                method: 'GET',
                headers: getHeaders(),
            });
            const currentMemoData = await handleResponse(currentMemoResponse);
            const currentMemo = transformMemoFromBackend(currentMemoData);
            
            // 3. 기존 태그 모두 삭제
            if (currentMemo.tags && currentMemo.tags.length > 0) {
                const currentTagIds = await getTagIdsFromNames(currentMemo.tags);
                for (const tagId of currentTagIds) {
                    await removeTagFromDocument(id, tagId);
                }
            }
            
            // 4. 새 태그 추가
            if (memoData.tags && memoData.tags.length > 0) {
                await addTagsToDocument(id, memoData.tags);
            }
            
            // 5. 최종 메모 조회
            const updatedResponse = await fetch(`${API_BASE_URL}/documents/${id}/`, {
                method: 'GET',
                headers: getHeaders(),
            });
            const updatedData = await handleResponse(updatedResponse);
            return transformMemoFromBackend(updatedData);
        } catch (err) {
            console.error('Error in updateMemo:', err);
            throw err;
        }
    };

    const deleteMemoAPI = async (id) => {
        const response = await fetch(`${API_BASE_URL}/documents/${id}/`, {
            method: 'DELETE',
            headers: getHeaders(),
        });
        
        if (response.status === 204) {
            return { success: true };
        }
        return handleResponse(response);
    };
// ============================================
// 태그 관련 헬퍼 함수들 (최종 수정)
// ============================================

    const getOrCreateTagId = async (tagName) => {
        try {
            console.log('🔍 태그 조회/생성:', tagName);
            
            const response = await fetch(`${API_BASE_URL}/tags/`, {
                method: 'GET',
                headers: getHeaders(),
            });
            const tags = await handleResponse(response);
            console.log('📋 전체 태그 목록:', tags);
            
            const existingTag = tags.find(t => t.tag_name === tagName);
            if (existingTag) {
                console.log('✅ 기존 태그 발견:', existingTag);
                return existingTag.tag_id;
            }
            
            console.log('➕ 새 태그 생성 중...');
            const createResponse = await fetch(`${API_BASE_URL}/tags/`, {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ tag_name: tagName }),
            });
            const newTag = await handleResponse(createResponse);
            console.log('✅ 새 태그 생성 완료:', newTag);
            return newTag.tag_id;
        } catch (err) {
            console.error('❌ 태그 조회/생성 실패:', tagName, err);
            throw err;
        }
    };

    const getTagIdsFromNames = async (tagNames) => {
        try {
            console.log('🔍 태그 이름으로 ID 조회:', tagNames);
            const response = await fetch(`${API_BASE_URL}/tags/`, {
                method: 'GET',
                headers: getHeaders(),
            });
            const allTags = await handleResponse(response);
            console.log('📋 조회된 전체 태그:', allTags);
            
            const tagIds = allTags
                .filter(tag => tagNames.includes(tag.tag_name))
                .map(tag => tag.tag_id);
            
            console.log('🔑 찾은 태그 ID들:', tagIds);
            return tagIds;
        } catch (err) {
            console.error('❌ 태그 ID 조회 실패:', err);
            return [];
        }
    };

    const addTagsToDocument = async (docId, tagNames) => {
        console.log(`📎 문서 ${docId}에 태그 추가 시작:`, tagNames);
        for (const tagName of tagNames) {
            try {
                const tagId = await getOrCreateTagId(tagName);
                console.log(`🔗 태그 "${tagName}" (ID: ${tagId}) 연결 중...`);
                
                if (tagId) {
                    const response = await fetch(`${API_BASE_URL}/documents/${docId}/tags/`, {
                        method: 'POST',
                        headers: getHeaders(),
                        body: JSON.stringify({ tag_id: tagId }),
                    });
                    
                    console.log(`📤 POST 요청:`, {
                        url: `${API_BASE_URL}/documents/${docId}/tags/`,
                        body: { tag_id: tagId },
                        status: response.status
                    });
                    
                    const result = await handleResponse(response);
                    console.log(`✅ 태그 "${tagName}" 연결 완료:`, result);
                }
            } catch (err) {
                console.error(`❌ 태그 "${tagName}" 추가 실패:`, err);
            }
        }
        console.log(`✅ 모든 태그 추가 완료`);
    };

    const removeTagFromDocument = async (docId, tagId) => {
        try {
            console.log(`🗑️ 문서 ${docId}에서 태그 ${tagId} 제거 중...`);
            const response = await fetch(`${API_BASE_URL}/documents/${docId}/tags/${tagId}/`, {
                method: 'DELETE',
                headers: getHeaders(),
            });
            
            console.log(`📤 DELETE 요청:`, {
                url: `${API_BASE_URL}/documents/${docId}/tags/${tagId}/`,
                status: response.status
            });
            
            if (response.status === 204) {
                console.log(`✅ 태그 ${tagId} 제거 완료`);
                return;
            }
            
            await handleResponse(response);
        } catch (err) {
            console.error('❌ 태그 제거 실패:', err);
            throw err;
        }
    };

    // ============================================
    // 이벤트 핸들러
    // ============================================
    const handleQuickSubmit = async (e) => {
        if (e.key === 'Enter' && quickInput.trim()) {
            try {
                setLoading(true);
                const newMemoData = {
                    title: quickInput,
                    content: '',
                    tags: [],
                    todos: []
                };
                const createdMemo = await createMemo(newMemoData);
                setMemos([createdMemo, ...memos]);
                setQuickInput('');
            } catch (err) {
                setError('메모 생성에 실패했습니다: ' + err.message);
                console.error('Error creating memo:', err);
            } finally {
                setLoading(false);
            }
        }
    };

    const deleteMemo = async (id) => {
        if (window.confirm('메모를 삭제하시겠습니까?')) {
            try {
                setLoading(true);
                await deleteMemoAPI(id);
                setMemos(memos.filter(m => m.id !== id));
            } catch (err) {
                setError('메모 삭제에 실패했습니다: ' + err.message);
                console.error('Error deleting memo:', err);
            } finally {
                setLoading(false);
            }
        }
    };

    // 새 메모 작성 모달 열기
    const openCreateModal = () => {
        setEditingMemo(null);
        setNewMemo({ title: '', content: '', tags: '' });
        setShowModal(true);
    };

    // 메모 수정 모달 열기
    const openEditModal = (memo) => {
        setEditingMemo(memo);
        
        // todos를 content에 추가해서 보여주기
        let contentWithTodos = memo.content;
        if (memo.todos.length > 0) {
            const todoLines = memo.todos.map(todo => 
                `${todo.completed ? '☑' : '☐'} ${todo.text}`
            ).join('\n');
            contentWithTodos = contentWithTodos ? `${contentWithTodos}\n${todoLines}` : todoLines;
        }
        
        setNewMemo({
            title: memo.title,
            content: contentWithTodos,
            tags: memo.tags.join(', ')
        });
        setShowModal(true);
    };

    const handleCreateMemo = async () => {
        let title = newMemo.title.trim();
        let content = newMemo.content;
        
        if (!title) {
            const lines = newMemo.content.split('\n').filter(l => l.trim());
            if (lines.length === 0) {
                alert('제목 또는 내용을 입력해주세요!');
                return;
            }
            title = lines[0];
            content = lines.slice(1).join('\n');
        }

        const lines = content.split('\n');
        const todos = [];
        let regularContent = [];

        lines.forEach(line => {
            const completedMatch = line.match(/^☑\s*(.+)$/);
            const uncompletedMatch = line.match(/^☐\s*(.+)$/);
            
            if (completedMatch) {
                todos.push({ text: completedMatch[1].trim(), completed: true });
            } else if (uncompletedMatch) {
                todos.push({ text: uncompletedMatch[1].trim(), completed: false });
            } else if (line.trim()) {
                regularContent.push(line);
            }
        });

        const memoData = {
            title: title,
            content: regularContent.join('\n'),
            tags: newMemo.tags.split(',').map(t => t.trim()).filter(t => t),
            todos: todos
        };

        try {
            setLoading(true);
            const createdMemo = await createMemo(memoData);
            setMemos([createdMemo, ...memos]);
            setShowModal(false);
            setNewMemo({ title: '', content: '', tags: '' });
            setEditingMemo(null);
        } catch (err) {
            setError('메모 생성에 실패했습니다: ' + err.message);
            console.error('Error creating memo:', err);
        } finally {
            setLoading(false);
        }
    };

    // 메모 수정 처리
    const handleUpdateMemo = async () => {
        let title = newMemo.title.trim();
        let content = newMemo.content;
        
        if (!title) {
            const lines = newMemo.content.split('\n').filter(l => l.trim());
            if (lines.length === 0) {
                alert('제목 또는 내용을 입력해주세요!');
                return;
            }
            title = lines[0];
            content = lines.slice(1).join('\n');
        }

        const lines = content.split('\n');
        const todos = [];
        let regularContent = [];

        lines.forEach(line => {
            const completedMatch = line.match(/^☑\s*(.+)$/);
            const uncompletedMatch = line.match(/^☐\s*(.+)$/);
            
            if (completedMatch) {
                todos.push({ text: completedMatch[1].trim(), completed: true });
            } else if (uncompletedMatch) {
                todos.push({ text: uncompletedMatch[1].trim(), completed: false });
            } else if (line.trim()) {
                regularContent.push(line);
            }
        });

        const memoData = {
            title: title,
            content: regularContent.join('\n'),
            tags: newMemo.tags.split(',').map(t => t.trim()).filter(t => t),
            todos: todos
        };

        try {
            setLoading(true);
            const updatedMemo = await updateMemo(editingMemo.id, memoData);
            setMemos(memos.map(m => m.id === editingMemo.id ? updatedMemo : m));
            setShowModal(false);
            setNewMemo({ title: '', content: '', tags: '' });
            setEditingMemo(null);
        } catch (err) {
            setError('메모 수정에 실패했습니다: ' + err.message);
            console.error('Error updating memo:', err);
        } finally {
            setLoading(false);
        }
    };

    const insertCheckbox = () => {
        const textarea = contentEditableRef.current;
        if (!textarea) return;
        
        const start = textarea.selectionStart;
        const newContent = 
            newMemo.content.substring(0, start) +
            (newMemo.content && start > 0 && newMemo.content[start - 1] !== '\n' ? '\n' : '') +
            '☐ ' +
            newMemo.content.substring(start);
        
        setNewMemo({...newMemo, content: newContent});
        
        setTimeout(() => {
            textarea.focus();
            const offset = (newMemo.content && start > 0 && newMemo.content[start - 1] !== '\n' ? 1 : 0);
            textarea.selectionStart = textarea.selectionEnd = start + offset + 2;
        }, 0);
    };

    const insertFormatting = (prefix, suffix = prefix) => {
        const textarea = contentEditableRef.current;
        if (!textarea) return;
        
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selectedText = newMemo.content.substring(start, end);
        
        if (selectedText) {
            const newContent = 
                newMemo.content.substring(0, start) +
                prefix + selectedText + suffix +
                newMemo.content.substring(end);
            setNewMemo({...newMemo, content: newContent});
            
            setTimeout(() => {
                textarea.focus();
                textarea.selectionStart = start + prefix.length;
                textarea.selectionEnd = end + prefix.length;
            }, 0);
        } else {
            const newContent = 
                newMemo.content.substring(0, start) +
                prefix + suffix +
                newMemo.content.substring(end);
            setNewMemo({...newMemo, content: newContent});
            
            setTimeout(() => {
                textarea.focus();
                textarea.selectionStart = start + prefix.length;
                textarea.selectionEnd = start + prefix.length;
            }, 0);
        }
    };

    const insertBold = () => insertFormatting('**', '**');
    const insertItalic = () => insertFormatting('*', '*');
    const insertUnderline = () => insertFormatting('__', '__');

    const renderMarkdown = (text) => {
        if (!text) return null;
        
        let html = text
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
            .replace(/__(.+?)__/g, '<u>$1</u>')
            .replace(/\n/g, '<br/>');
        
        return <span dangerouslySetInnerHTML={{ __html: html }} />;
    };

    const handleContentKeyDown = (e) => {
        if (e.key === 'Enter') {
            const textarea = e.target;
            const cursorPos = textarea.selectionStart;
            const textBeforeCursor = newMemo.content.substring(0, cursorPos);
            const currentLine = textBeforeCursor.split('\n').pop();
            
            if (currentLine.trim().startsWith('☐') || currentLine.trim().startsWith('☑')) {
                e.preventDefault();
                const textAfterCursor = newMemo.content.substring(cursorPos);
                const newContent = newMemo.content.substring(0, cursorPos) + '\n☐ ' + textAfterCursor;
                setNewMemo({...newMemo, content: newContent});
                
                setTimeout(() => {
                    textarea.selectionStart = textarea.selectionEnd = cursorPos + 3;
                }, 0);
            }
        }
    };

    // "중요" 태그를 포함한 모든 태그 목록
    const allTags = memos.reduce((acc, memo) => {
        memo.tags.forEach(tag => {
            acc[tag] = (acc[tag] || 0) + 1;
        });
        return acc;
    }, {});

    // "중요" 태그가 없으면 추가 (카운트 0으로)
    if (!allTags['중요']) {
        allTags['중요'] = 0;
    }

    const filteredMemos = memos.filter(memo => {
        const matchesSearch = searchQuery === '' || 
            memo.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            memo.content.toLowerCase().includes(searchQuery.toLowerCase());
        
        const matchesTags = selectedTags.length === 0 || 
            selectedTags.some(tag => memo.tags.includes(tag));
        
        return matchesSearch && matchesTags;
    });

    // 중요 메모 필터링
    const importantMemos = filteredMemos.filter(memo => memo.tags.includes('중요'));
    const regularMemos = filteredMemos.filter(memo => !memo.tags.includes('중요'));

    const toggleTag = (tag) => {
        if (selectedTags.includes(tag)) {
            setSelectedTags(selectedTags.filter(t => t !== tag));
        } else {
            setSelectedTags([...selectedTags, tag]);
        }
    };

    const toggleTodo = async (memoId, todoIndex) => {
        const memo = memos.find(m => m.id === memoId);
        if (!memo) return;

        const newTodos = [...memo.todos];
        newTodos[todoIndex] = {
            ...newTodos[todoIndex],
            completed: !newTodos[todoIndex].completed
        };

        const updatedMemoData = {
            ...memo,
            todos: newTodos
        };

        try {
            // 낙관적 업데이트 (즉시 UI 반영)
            setMemos(memos.map(m => m.id === memoId ? updatedMemoData : m));
            
            // 백엔드 동기화
            await updateMemo(memoId, updatedMemoData);
        } catch (err) {
            // 실패 시 원래대로 롤백
            setMemos(memos.map(m => m.id === memoId ? memo : m));
            setError('Todo 업데이트에 실패했습니다: ' + err.message);
            console.error('Error toggling todo:', err);
        }
    };

    // "중요" 태그 토글 버튼
    const toggleImportantTag = () => {
        const currentTags = newMemo.tags.split(',').map(t => t.trim()).filter(t => t);
        let newTags;
        
        if (currentTags.includes('중요')) {
            // 중요 태그 제거
            newTags = currentTags.filter(t => t !== '중요');
        } else {
            // 중요 태그 추가
            newTags = [...currentTags, '중요'];
        }
        
        setNewMemo({...newMemo, tags: newTags.join(', ')});
    };

    // 현재 "중요" 태그가 있는지 확인
    const hasImportantTag = () => {
        const currentTags = newMemo.tags.split(',').map(t => t.trim()).filter(t => t);
        return currentTags.includes('중요');
    };

    const MemoCard = ({ memo }) => (
        <div 
            key={memo.id} 
            style={{
                backgroundColor: '#2d2d2d',
                borderRadius: '0.5rem',
                padding: '1.5rem',
                cursor: 'pointer',
                border: memo.tags.includes('중요') ? '2px solid #f59e0b' : '1px solid #3d3d3d',
                transition: 'transform 0.2s',
                position: 'relative'
            }}
            onClick={() => openEditModal(memo)}
            onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'translateY(0)'}
        >
            <div style={{
                position: 'absolute',
                top: '0.5rem',
                right: '0.5rem'
            }}>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        deleteMemo(memo.id);
                    }}
                    style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#ef4444',
                        fontSize: '1.2rem',
                        padding: '0.25rem'
                    }}
                >🗑️</button>
            </div>
            <h3 style={{
                fontSize: '1.1rem',
                fontWeight: '600',
                marginBottom: '0.5rem',
                paddingRight: '2rem'
            }}>{memo.title}</h3>
            {memo.content && (
                <div style={{
                    color: '#9ca3af',
                    fontSize: '0.9rem',
                    marginBottom: '0.5rem'
                }}>{renderMarkdown(memo.content)}</div>
            )}
            {memo.todos.length > 0 && (
                <div style={{ marginTop: '0.5rem' }}>
                    {memo.todos.slice(0, 2).map((todo, idx) => (
                        <div 
                            key={idx}
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleTodo(memo.id, idx);
                            }}
                            style={{ 
                                fontSize: '0.85rem', 
                                color: '#9ca3af',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.25rem 0'
                            }}>
                            <span>{todo.completed ? '☑' : '☐'}</span>
                            <span style={{ 
                                textDecoration: todo.completed ? 'line-through' : 'none',
                                opacity: todo.completed ? 0.6 : 1
                            }}>
                                {todo.text}
                            </span>
                        </div>
                    ))}
                    {memo.todos.length > 2 && (
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                            +{memo.todos.length - 2}개 더보기
                        </div>
                    )}
                </div>
            )}
            <div style={{
                marginTop: '1rem',
                display: 'flex',
                gap: '0.5rem',
                flexWrap: 'wrap'
            }}>
                {memo.tags.map((tag, idx) => (
                    <span key={idx} style={{
                        padding: '0.25rem 0.5rem',
                        backgroundColor: tag === '중요' ? '#f59e0b' : '#374151',
                        color: tag === '중요' ? '#000' : '#e5e5e5',
                        borderRadius: '0.25rem',
                        fontSize: '0.75rem',
                        fontWeight: '600'
                    }}>#{tag}</span>
                ))}
            </div>
        </div>
    );

    return (
        <div style={{
            minHeight: '100vh',
            width: '100vw',
            backgroundColor: '#1a1a1a',
            color: '#fff',
            margin: 0,
            padding: 0
        }}>
            <div style={{
                backgroundColor: '#2d2d2d',
                padding: '1rem 4rem',
                borderBottom: '1px solid #3d3d3d',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                justifyContent: 'center'
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    maxWidth: '1600px',
                    width: '100%'
                }}>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="🔍 메모 검색..."
                        style={{
                            width: '300px',
                            padding: '0.5rem 1rem',
                            backgroundColor: '#1a1a1a',
                            border: '1px solid #4b5563',
                            borderRadius: '0.5rem',
                            color: '#fff',
                            outline: 'none'
                        }}
                    />
                    <button 
                        onClick={openCreateModal}
                        style={{
                            padding: '0.5rem 1.5rem',
                            backgroundColor: '#fff',
                            color: '#000',
                            border: 'none',
                            borderRadius: '0.5rem',
                            cursor: 'pointer',
                            fontWeight: '700'
                        }}>
                        + 새 메모
                    </button>
                    
                    <div style={{ position: 'relative' }}>
                        <button 
                            onClick={() => setShowTagFilter(!showTagFilter)}
                            style={{
                                padding: '0.5rem 1rem',
                                backgroundColor: selectedTags.length > 0 ? '#3b82f6' : '#1a1a1a',
                                color: '#fff',
                                border: '1px solid #4b5563',
                                borderRadius: '0.5rem',
                                cursor: 'pointer',
                                fontWeight: '500',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}>
                            🏷️ 태그 필터 {selectedTags.length > 0 && `(${selectedTags.length})`}
                        </button>

                        {showTagFilter && (
                            <div style={{
                                position: 'absolute',
                                top: '100%',
                                right: 0,
                                marginTop: '0.5rem',
                                backgroundColor: '#2d2d2d',
                                border: '1px solid #4b5563',
                                borderRadius: '0.5rem',
                                padding: '1rem',
                                minWidth: '200px',
                                maxHeight: '300px',
                                overflow: 'auto',
                                zIndex: 100,
                                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)'
                            }}>
                                <div style={{
                                    marginBottom: '0.75rem',
                                    paddingBottom: '0.5rem',
                                    borderBottom: '1px solid #4b5563',
                                    fontSize: '0.9rem',
                                    color: '#9ca3af'
                                }}>
                                    태그 선택
                                </div>
                                
                                {Object.keys(allTags).length === 0 ? (
                                    <div style={{
                                        color: '#6b7280',
                                        fontSize: '0.9rem',
                                        padding: '0.5rem 0'
                                    }}>태그가 없습니다</div>
                                ) : (
                                    Object.entries(allTags).map(([tag, count]) => (
                                        <label key={tag} style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            padding: '0.5rem',
                                            cursor: 'pointer',
                                            borderRadius: '0.25rem',
                                            transition: 'background 0.2s',
                                            backgroundColor: tag === '중요' ? 'rgba(245, 158, 11, 0.1)' : 'transparent'
                                        }}
                                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = tag === '중요' ? 'rgba(245, 158, 11, 0.2)' : '#374151'}
                                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = tag === '중요' ? 'rgba(245, 158, 11, 0.1)' : 'transparent'}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedTags.includes(tag)}
                                                onChange={() => toggleTag(tag)}
                                                style={{
                                                    marginRight: '0.5rem',
                                                    width: '1rem',
                                                    height: '1rem',
                                                    cursor: 'pointer'
                                                }}
                                            />
                                            <span style={{ 
                                                flex: 1, 
                                                fontSize: '0.9rem',
                                                color: tag === '중요' ? '#f59e0b' : '#fff',
                                                fontWeight: tag === '중요' ? '600' : 'normal'
                                            }}>
                                                {tag === '중요' ? '⭐ ' : '#'}{tag}
                                            </span>
                                            <span style={{
                                                fontSize: '0.75rem',
                                                backgroundColor: tag === '중요' ? '#f59e0b' : '#374151',
                                                color: tag === '중요' ? '#000' : '#9ca3af',
                                                padding: '0.125rem 0.5rem',
                                                borderRadius: '0.25rem'
                                            }}>
                                                {count}
                                            </span>
                                        </label>
                                    ))
                                )}

                                {Object.keys(allTags).length > 0 && (
                                    <div style={{
                                        marginTop: '0.75rem',
                                        paddingTop: '0.75rem',
                                        borderTop: '1px solid #4b5563',
                                        display: 'flex',
                                        gap: '0.5rem'
                                    }}>
                                        <button
                                            onClick={() => {
                                                setSelectedTags([]);
                                                setShowTagFilter(false);
                                            }}
                                            style={{
                                                flex: 1,
                                                padding: '0.5rem',
                                                backgroundColor: '#4b5563',
                                                color: '#fff',
                                                border: 'none',
                                                borderRadius: '0.25rem',
                                                cursor: 'pointer',
                                                fontSize: '0.85rem'
                                            }}
                                        >
                                            초기화
                                        </button>
                                        <button
                                            onClick={() => setShowTagFilter(false)}
                                            style={{
                                                flex: 1,
                                                padding: '0.5rem',
                                                backgroundColor: '#3b82f6',
                                                color: '#fff',
                                                border: 'none',
                                                borderRadius: '0.25rem',
                                                cursor: 'pointer',
                                                fontSize: '0.85rem'
                                            }}
                                        >
                                            적용
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div style={{ 
                padding: '2rem 4rem',
                maxWidth: '1600px',
                margin: '0 auto',
                width: '100%',
                boxSizing: 'border-box'
            }}>
                <div style={{
                    backgroundColor: '#2d2d2d',
                    borderRadius: '0.5rem',
                    padding: '1rem',
                    marginBottom: '2rem',
                    border: '1px solid #3d3d3d'
                }}>
                    <input
                        type="text"
                        value={quickInput}
                        onChange={(e) => setQuickInput(e.target.value)}
                        onKeyPress={handleQuickSubmit}
                        placeholder="⚡ 빠른 입력... (Enter로 저장)"
                        style={{
                            width: '100%',
                            padding: '0.75rem',
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: '#fff',
                            fontSize: '1rem',
                            outline: 'none',
                            boxSizing: 'border-box'
                        }}
                    />
                </div>

                {importantMemos.length > 0 && (
                    <div style={{ marginBottom: '2rem' }}>
                        <h2 style={{
                            fontSize: '1.25rem',
                            fontWeight: '600',
                            marginBottom: '1rem',
                            color: '#f59e0b',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}>⭐ 중요 메모</h2>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                            gap: '1.5rem'
                        }}>
                            {importantMemos.map(memo => (
                                <MemoCard key={memo.id} memo={memo} />
                            ))}
                        </div>
                    </div>
                )}

                <div>
                    <h2 style={{
                        fontSize: '1.25rem',
                        fontWeight: '600',
                        marginBottom: '1rem'
                    }}>📝 모든 메모</h2>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                        gap: '1.5rem'
                    }}>
                        {regularMemos.map(memo => (
                            <MemoCard key={memo.id} memo={memo} />
                        ))}
                    </div>
                </div>
            </div>

            {showModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000
                }} onClick={() => {
                    setShowModal(false);
                    setEditingMemo(null);
                }}>
                    <div style={{
                        backgroundColor: '#2d2d2d',
                        borderRadius: '0.5rem',
                        padding: '2rem',
                        width: '90%',
                        maxWidth: '600px',
                        maxHeight: '80vh',
                        overflow: 'auto'
                    }} onClick={(e) => e.stopPropagation()}>
                        <h2 style={{
                            fontSize: '1.5rem',
                            fontWeight: '600',
                            marginBottom: '1.5rem',
                            color: '#fff'
                        }}>
                            {editingMemo ? '✏️ 메모 수정' : '📝 새 메모 작성'}
                        </h2>

                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{
                                display: 'block',
                                color: '#d1d5db',
                                marginBottom: '0.5rem',
                                fontSize: '0.9rem'
                            }}>제목</label>
                            <input
                                type="text"
                                value={newMemo.title}
                                onChange={(e) => setNewMemo({...newMemo, title: e.target.value})}
                                placeholder="메모 제목을 입력하세요"
                                style={{
                                    width: '100%',
                                    padding: '0.75rem',
                                    backgroundColor: '#1a1a1a',
                                    border: '1px solid #4b5563',
                                    borderRadius: '0.5rem',
                                    color: '#fff',
                                    outline: 'none',
                                    fontSize: '1rem',
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{
                                display: 'block',
                                color: '#d1d5db',
                                marginBottom: '0.5rem',
                                fontSize: '0.9rem'
                            }}>내용</label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                <div>
                                    <div style={{
                                        fontSize: '0.75rem',
                                        color: '#9ca3af',
                                        marginBottom: '0.25rem',
                                        fontWeight: '500'
                                    }}>입력</div>
                                    <textarea
                                        ref={contentEditableRef}
                                        value={newMemo.content}
                                        onChange={(e) => setNewMemo({...newMemo, content: e.target.value})}
                                        onKeyDown={handleContentKeyDown}
                                        placeholder="메모 내용을 입력하세요"
                                        style={{
                                            width: '100%',
                                            minHeight: '200px',
                                            padding: '0.75rem',
                                            backgroundColor: '#1a1a1a',
                                            border: '1px solid #4b5563',
                                            borderRadius: '0.5rem',
                                            color: '#fff',
                                            outline: 'none',
                                            fontSize: '1rem',
                                            boxSizing: 'border-box',
                                            fontFamily: 'inherit',
                                            resize: 'vertical'
                                        }}
                                    />
                                </div>
                                
                                <div>
                                    <div style={{
                                        fontSize: '0.75rem',
                                        color: '#9ca3af',
                                        marginBottom: '0.25rem',
                                        fontWeight: '500'
                                    }}>미리보기</div>
                                    <div style={{
                                        width: '100%',
                                        minHeight: '200px',
                                        padding: '0.75rem',
                                        backgroundColor: '#0d0d0d',
                                        border: '1px solid #4b5563',
                                        borderRadius: '0.5rem',
                                        color: '#fff',
                                        fontSize: '1rem',
                                        boxSizing: 'border-box',
                                        fontFamily: 'inherit',
                                        overflowY: 'auto',
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word'
                                    }}>
                                        {newMemo.content ? renderMarkdown(newMemo.content) : 
                                            <span style={{ color: '#6b7280' }}>여기에 미리보기가 표시됩니다</span>
                                        }
                                    </div>
                                </div>
                            </div>
                            
                            <div style={{
                                display: 'flex',
                                gap: '0.5rem',
                                marginTop: '0.5rem',
                                padding: '0.75rem',
                                backgroundColor: '#1a1a1a',
                                borderRadius: '0.5rem',
                                border: '1px solid #4b5563',
                                flexWrap: 'wrap'
                            }}>
                                <button
                                    type="button"
                                    onClick={insertBold}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        backgroundColor: '#374151',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: '0.25rem',
                                        cursor: 'pointer',
                                        fontSize: '0.9rem',
                                        fontWeight: 'bold',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        transition: 'background 0.2s'
                                    }}
                                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#4b5563'}
                                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#374151'}
                                    title="굵게"
                                >
                                    <strong>B</strong> 굵게
                                </button>
                                
                                <button
                                    type="button"
                                    onClick={insertItalic}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        backgroundColor: '#374151',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: '0.25rem',
                                        cursor: 'pointer',
                                        fontSize: '0.9rem',
                                        fontStyle: 'italic',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        transition: 'background 0.2s'
                                    }}
                                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#4b5563'}
                                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#374151'}
                                    title="기울임"
                                >
                                    <em>I</em> 기울임
                                </button>

                                <button
                                    type="button"
                                    onClick={insertUnderline}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        backgroundColor: '#374151',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: '0.25rem',
                                        cursor: 'pointer',
                                        fontSize: '0.9rem',
                                        textDecoration: 'underline',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        transition: 'background 0.2s'
                                    }}
                                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#4b5563'}
                                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#374151'}
                                    title="밑줄"
                                >
                                    <u>U</u> 밑줄
                                </button>
                                
                                <div style={{
                                    width: '1px',
                                    backgroundColor: '#4b5563',
                                    margin: '0 0.25rem'
                                }} />

                                <button
                                    type="button"
                                    onClick={insertCheckbox}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        backgroundColor: '#374151',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: '0.25rem',
                                        cursor: 'pointer',
                                        fontSize: '0.9rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        transition: 'background 0.2s'
                                    }}
                                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#4b5563'}
                                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#374151'}
                                    title="체크리스트 추가"
                                >
                                    ☐ 체크박스
                                </button>

                                <div style={{
                                    color: '#6b7280',
                                    fontSize: '0.75rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    paddingLeft: '0.5rem',
                                    marginLeft: 'auto'
                                }}>
                                    💡 **굵게** *기울임* __밑줄__
                                </div>
                            </div>
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{
                                display: 'block',
                                color: '#d1d5db',
                                marginBottom: '0.5rem',
                                fontSize: '0.9rem'
                            }}>태그 (쉼표로 구분)</label>
                            <input
                                type="text"
                                value={newMemo.tags}
                                onChange={(e) => setNewMemo({...newMemo, tags: e.target.value})}
                                placeholder="예: 업무, 회의, 긴급"
                                style={{
                                    width: '100%',
                                    padding: '0.75rem',
                                    backgroundColor: '#1a1a1a',
                                    border: '1px solid #4b5563',
                                    borderRadius: '0.5rem',
                                    color: '#fff',
                                    outline: 'none',
                                    fontSize: '1rem',
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>

                        <div style={{ marginBottom: '1.5rem' }}>
                            <button
                                type="button"
                                onClick={toggleImportantTag}
                                style={{
                                    padding: '0.75rem 1.5rem',
                                    backgroundColor: hasImportantTag() ? '#f59e0b' : '#374151',
                                    color: hasImportantTag() ? '#000' : '#fff',
                                    border: 'none',
                                    borderRadius: '0.5rem',
                                    cursor: 'pointer',
                                    fontSize: '1rem',
                                    fontWeight: '600',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    transition: 'all 0.2s'
                                }}
                                onMouseOver={(e) => {
                                    e.currentTarget.style.transform = 'scale(1.02)';
                                }}
                                onMouseOut={(e) => {
                                    e.currentTarget.style.transform = 'scale(1)';
                                }}
                            >
                                <span>{hasImportantTag() ? '⭐' : '☆'}</span>
                                {hasImportantTag() ? '중요 메모 해제' : '중요 메모로 표시'}
                            </button>
                        </div>

                        <div style={{
                            display: 'flex',
                            gap: '1rem',
                            justifyContent: 'flex-end'
                        }}>
                            <button
                                onClick={() => {
                                    setShowModal(false);
                                    setNewMemo({ title: '', content: '', tags: '' });
                                    setEditingMemo(null);
                                }}
                                style={{
                                    padding: '0.75rem 1.5rem',
                                    backgroundColor: '#4b5563',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '0.5rem',
                                    cursor: 'pointer',
                                    fontSize: '1rem',
                                    fontWeight: '500'
                                }}
                            >
                                취소
                            </button>
                            <button
                                onClick={editingMemo ? handleUpdateMemo : handleCreateMemo}
                                style={{
                                    padding: '0.75rem 1.5rem',
                                    backgroundColor: '#fff',
                                    color: '#000',
                                    border: 'none',
                                    borderRadius: '0.5rem',
                                    cursor: 'pointer',
                                    fontSize: '1rem',
                                    fontWeight: '700'
                                }}
                            >
                                {editingMemo ? '수정' : '저장'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default MemoMainPage;