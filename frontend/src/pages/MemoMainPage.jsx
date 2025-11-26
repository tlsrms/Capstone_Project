import React, { useState, useRef, useEffect } from "react";

// ============================================
// API 설정
// ============================================
const API_BASE_URL = "https://theosophic-gumlike-jeffery.ngrok-free.dev/api";

const getAuthToken = () => localStorage.getItem("access_token");

const getHeaders = () => {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "ngrok-skip-browser-warning": "69420",
  };
  const token = getAuthToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
};

// 공통 응답 처리 (ngrok HTML 방어)
const handleResponse = async (response) => {
  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  if (!response.ok) {
    if (isJson) {
      const error = await response.json().catch(() => null);
      const detail = error && (error.detail || error.message);
      throw new Error(detail || `HTTP ${response.status}`);
    } else {
      const text = await response.text().catch(() => "");
      throw new Error(
        `HTTP ${response.status}, JSON 대신 이런 응답이 왔어요: ${text
          .slice(0, 80)
          .replace(/\n/g, " ")}...`
      );
    }
  }

  if (!isJson) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `JSON이 아닌 응답을 받았습니다: ${text
        .slice(0, 80)
        .replace(/\n/g, " ")}...`
    );
  }

  return response.json();
};

// ============================================
// 변환 함수
// ============================================

// 백엔드 → 프론트
const transformMemoFromBackend = (backendMemo) => {
  const lines = (backendMemo.content || "").split("\n");
  const todos = [];
  const regularContent = [];

  lines.forEach((line) => {
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
    title: backendMemo.title || "제목 없음",
    content: regularContent.join("\n"),
    tags: Array.isArray(backendMemo.tags)
      ? backendMemo.tags.map((tag) =>
          typeof tag === "string" ? tag : tag.tag_name
        )
      : [],
    todos,
    created_at: backendMemo.created_at,
    updated_at: backendMemo.updated_at,
  };
};

// 프론트 → 백엔드
const transformMemoToBackend = (frontendMemo) => {
  let fullContent = frontendMemo.content || "";

  if (frontendMemo.todos && frontendMemo.todos.length > 0) {
    const todoLines = frontendMemo.todos
      .map((todo) => `${todo.completed ? "☑" : "☐"} ${todo.text}`)
      .join("\n");
    fullContent = fullContent ? `${fullContent}\n${todoLines}` : todoLines;
  }

  return {
    title: frontendMemo.title || "",
    content: fullContent,
  };
};

function MemoMainPage() {
  const [quickInput, setQuickInput] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showTagFilter, setShowTagFilter] = useState(false);
  const [selectedTags, setSelectedTags] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingMemo, setEditingMemo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState("");
  const [newMemo, setNewMemo] = useState({
    title: "",
    content: "",
    tags: "",
  });
  const [memos, setMemos] = useState([]);

  const contentEditableRef = useRef(null);

  // ============================================
  // 공통 토스트
  // ============================================
  const showToast = (msg) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(""), 2000);
  };

  // ============================================
  // API 호출
  // ============================================
  const fetchMemos = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `${API_BASE_URL}/documents/?type=memo&format=json`,
        {
          method: "GET",
          headers: getHeaders(),
        }
      );

      const data = await handleResponse(response);

      // data가 배열이 아닐 수도 있으니 방어
      const list = Array.isArray(data) ? data : data.results || [];
      const transformed = list.map(transformMemoFromBackend);
      setMemos(transformed);
    } catch (err) {
      console.error("Error fetching memos:", err);
      setError("메모를 불러오는데 실패했습니다: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const createMemo = async (memoData) => {
    const backendData = transformMemoToBackend(memoData);
    const response = await fetch(`${API_BASE_URL}/documents/`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(backendData),
    });
    const data = await handleResponse(response);

    if (memoData.tags && memoData.tags.length > 0) {
      await addTagsToDocument(data.id, memoData.tags);
    }
    return data.id;
  };

  const updateMemo = async (id, memoData) => {
    const backendData = transformMemoToBackend(memoData);

    // 내용 먼저 수정
    const response = await fetch(`${API_BASE_URL}/documents/${id}/`, {
      method: "PATCH",
      headers: getHeaders(),
      body: JSON.stringify(backendData),
    });
    await handleResponse(response);

    // 기존 태그 조회
    const currentResponse = await fetch(
      `${API_BASE_URL}/documents/${id}/?format=json`,
      {
        method: "GET",
        headers: getHeaders(),
      }
    );
    const currentData = await handleResponse(currentResponse);
    const currentMemo = transformMemoFromBackend(currentData);

    // 기존 태그 삭제
    if (currentMemo.tags && currentMemo.tags.length > 0) {
      const currentTagIds = await getTagIdsFromNames(currentMemo.tags);
      for (const tagId of currentTagIds) {
        await removeTagFromDocument(id, tagId);
      }
    }

    // 새 태그 추가
    if (memoData.tags && memoData.tags.length > 0) {
      await addTagsToDocument(id, memoData.tags);
    }
  };

  const deleteMemoAPI = async (id) => {
    const response = await fetch(`${API_BASE_URL}/documents/${id}/`, {
      method: "DELETE",
      headers: getHeaders(),
    });
    if (response.status === 204) return { success: true };
    return handleResponse(response);
  };

  // ============================================
  // 태그 관련
  // ============================================
  const getOrCreateTagId = async (tagName) => {
    const response = await fetch(`${API_BASE_URL}/tags/?format=json`, {
      method: "GET",
      headers: getHeaders(),
    });
    const tags = await handleResponse(response);

    const existing = Array.isArray(tags)
      ? tags.find((t) => t.tag_name === tagName)
      : null;

    if (existing) return existing.tag_id;

    const createResponse = await fetch(`${API_BASE_URL}/tags/`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ tag_name: tagName }),
    });
    const newTag = await handleResponse(createResponse);
    return newTag.tag_id;
  };

  const getTagIdsFromNames = async (tagNames) => {
    try {
      const response = await fetch(`${API_BASE_URL}/tags/?format=json`, {
        method: "GET",
        headers: getHeaders(),
      });
      const allTags = await handleResponse(response);

      if (!Array.isArray(allTags)) return [];

      const tagIds = allTags
        .filter((tag) => tagNames.includes(tag.tag_name))
        .map((tag) => tag.tag_id);

      return tagIds;
    } catch (err) {
      console.error("태그 ID 조회 실패:", err);
      return [];
    }
  };

  const addTagsToDocument = async (docId, tagNames) => {
    for (const name of tagNames) {
      try {
        const tagId = await getOrCreateTagId(name);
        if (!tagId) continue;

        const response = await fetch(
          `${API_BASE_URL}/documents/${docId}/tags/`,
          {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({ tag_id: tagId }),
          }
        );
        await handleResponse(response);
      } catch (err) {
        console.error(`태그 "${name}" 추가 실패:`, err);
      }
    }
  };

  const removeTagFromDocument = async (docId, tagId) => {
    const response = await fetch(
      `${API_BASE_URL}/documents/${docId}/tags/${tagId}/`,
      {
        method: "DELETE",
        headers: getHeaders(),
      }
    );
    if (response.status !== 204) {
      await handleResponse(response);
    }
  };

  // ============================================
  // useEffect: 초기 로드
  // ============================================
  useEffect(() => {
    fetchMemos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ============================================
  // 이벤트 핸들러
  // ============================================
  const handleQuickSubmit = async (e) => {
    if (e.key === "Enter" && quickInput.trim()) {
      try {
        setLoading(true);
        const newMemoData = {
          title: quickInput.trim(),
          content: "",
          tags: [],
          todos: [],
        };
        await createMemo(newMemoData);
        await fetchMemos();
        setQuickInput("");
        showToast("메모가 저장되었습니다!");
      } catch (err) {
        console.error("Error creating memo:", err);
        setError("메모 생성에 실패했습니다: " + err.message);
      } finally {
        setLoading(false);
      }
    }
  };

  const deleteMemo = async (id) => {
    if (!window.confirm("메모를 삭제하시겠습니까?")) return;
    try {
      setLoading(true);
      await deleteMemoAPI(id);
      await fetchMemos();
      showToast("메모가 삭제되었습니다.");
    } catch (err) {
      console.error("Error deleting memo:", err);
      setError("메모 삭제에 실패했습니다: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingMemo(null);
    setNewMemo({ title: "", content: "", tags: "" });
    setShowModal(true);
  };

  const openEditModal = (memo) => {
    let contentWithTodos = memo.content || "";
    if (memo.todos && memo.todos.length > 0) {
      const todoLines = memo.todos
        .map((todo) => `${todo.completed ? "☑" : "☐"} ${todo.text}`)
        .join("\n");
      contentWithTodos = contentWithTodos
        ? `${contentWithTodos}\n${todoLines}`
        : todoLines;
    }

    setEditingMemo(memo);
    setNewMemo({
      title: memo.title,
      content: contentWithTodos,
      tags: memo.tags.join(", "),
    });
    setShowModal(true);
  };

  const parseContentAndTodos = (content) => {
    const lines = (content || "").split("\n");
    const todos = [];
    const regularContent = [];

    lines.forEach((line) => {
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
      content: regularContent.join("\n"),
      todos,
    };
  };

  const handleCreateMemo = async () => {
    let title = newMemo.title.trim();
    let content = newMemo.content;

    if (!title) {
      const lines = (newMemo.content || "").split("\n").filter((l) => l.trim());
      if (lines.length === 0) {
        alert("제목 또는 내용을 입력해주세요!");
        return;
      }
      title = lines[0];
      content = lines.slice(1).join("\n");
    }

    const parsed = parseContentAndTodos(content);
    const memoData = {
      title,
      content: parsed.content,
      tags: newMemo.tags
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t),
      todos: parsed.todos,
    };

    try {
      setLoading(true);
      await createMemo(memoData);
      await fetchMemos();
      setShowModal(false);
      setNewMemo({ title: "", content: "", tags: "" });
      setEditingMemo(null);
      showToast("메모가 저장되었습니다!");
    } catch (err) {
      console.error("Error creating memo:", err);
      setError("메모 생성에 실패했습니다: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateMemo = async () => {
    if (!editingMemo) return;

    let title = newMemo.title.trim();
    let content = newMemo.content;

    if (!title) {
      const lines = (newMemo.content || "").split("\n").filter((l) => l.trim());
      if (lines.length === 0) {
        alert("제목 또는 내용을 입력해주세요!");
        return;
      }
      title = lines[0];
      content = lines.slice(1).join("\n");
    }

    const parsed = parseContentAndTodos(content);
    const memoData = {
      title,
      content: parsed.content,
      tags: newMemo.tags
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t),
      todos: parsed.todos,
    };

    try {
      setLoading(true);
      await updateMemo(editingMemo.id, memoData);
      await fetchMemos();
      setShowModal(false);
      setNewMemo({ title: "", content: "", tags: "" });
      setEditingMemo(null);
      showToast("메모가 수정되었습니다!");
    } catch (err) {
      console.error("Error updating memo:", err);
      setError("메모 수정에 실패했습니다: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const insertCheckbox = () => {
    const textarea = contentEditableRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const before = newMemo.content.substring(0, start);
    const after = newMemo.content.substring(start);
    const needNewline =
      newMemo.content && start > 0 && newMemo.content[start - 1] !== "\n";

    const insertText = (needNewline ? "\n" : "") + "☐ ";
    const newContent = before + insertText + after;

    setNewMemo((prev) => ({ ...prev, content: newContent }));

    setTimeout(() => {
      textarea.focus();
      const offset = (needNewline ? 1 : 0) + 2;
      textarea.selectionStart = textarea.selectionEnd = start + offset;
    }, 0);
  };

  const insertFormatting = (prefix, suffix = prefix) => {
    const textarea = contentEditableRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = newMemo.content.substring(start, end);

    let newContent;
    let newStart;
    let newEnd;

    if (selected) {
      newContent =
        newMemo.content.substring(0, start) +
        prefix +
        selected +
        suffix +
        newMemo.content.substring(end);
      newStart = start + prefix.length;
      newEnd = end + prefix.length;
    } else {
      newContent =
        newMemo.content.substring(0, start) +
        prefix +
        suffix +
        newMemo.content.substring(end);
      newStart = start + prefix.length;
      newEnd = start + prefix.length;
    }

    setNewMemo((prev) => ({ ...prev, content: newContent }));

    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = newStart;
      textarea.selectionEnd = newEnd;
    }, 0);
  };

  const insertBold = () => insertFormatting("**", "**");
  const insertUnderline = () => insertFormatting("__", "__");

  const renderMarkdown = (text) => {
    if (!text) return null;
    const html = text
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/__(.+?)__/g, "<u>$1</u>")
      .replace(/\n/g, "<br/>");
    return <span dangerouslySetInnerHTML={{ __html: html }} />;
  };

  const handleContentKeyDown = (e) => {
    if (e.key !== "Enter") return;

    const textarea = e.target;
    const cursorPos = textarea.selectionStart;
    const before = newMemo.content.substring(0, cursorPos);
    const currentLine = before.split("\n").pop() || "";

    if (
      currentLine.trim().startsWith("☐") ||
      currentLine.trim().startsWith("☑")
    ) {
      e.preventDefault();
      const after = newMemo.content.substring(cursorPos);
      const newContent = before + "\n☐ " + after;

      setNewMemo((prev) => ({ ...prev, content: newContent }));

      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = cursorPos + 3;
      }, 0);
    }
  };

  // ============================================
  // 태그 관련 UI / 필터
  // ============================================
  const allTags = memos.reduce((acc, memo) => {
    (memo.tags || []).forEach((tag) => {
      acc[tag] = (acc[tag] || 0) + 1;
    });
    return acc;
  }, {});

  if (!allTags["중요"]) {
    allTags["중요"] = 0;
  }

  const filteredMemos = memos.filter((memo) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      memo.title.toLowerCase().includes(q) ||
      memo.content.toLowerCase().includes(q);

    const matchesTags =
      selectedTags.length === 0 ||
      selectedTags.some((tag) => memo.tags.includes(tag));

    return matchesSearch && matchesTags;
  });

  const importantMemos = filteredMemos.filter((m) => m.tags.includes("중요"));
  const regularMemos = filteredMemos.filter((m) => !m.tags.includes("중요"));

  const toggleTagFilter = (tag) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const toggleTodo = async (memoId, todoIndex) => {
    const memo = memos.find((m) => m.id === memoId);
    if (!memo) return;

    const newTodos = memo.todos.map((t, idx) =>
      idx === todoIndex ? { ...t, completed: !t.completed } : t
    );

    const updated = { ...memo, todos: newTodos };

    try {
      setMemos((prev) => prev.map((m) => (m.id === memoId ? updated : m)));
      await updateMemo(memoId, updated);
      await fetchMemos();
    } catch (err) {
      console.error("Todo toggle 실패:", err);
      setError("Todo 업데이트에 실패했습니다: " + err.message);
      setMemos((prev) => prev.map((m) => (m.id === memoId ? memo : m)));
    }
  };

  const toggleImportantTag = () => {
    const current = newMemo.tags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t);
    let next;

    if (current.includes("중요")) {
      next = current.filter((t) => t !== "중요");
    } else {
      next = [...current, "중요"];
    }

    setNewMemo((prev) => ({ ...prev, tags: next.join(", ") }));
  };

  const hasImportantTag = () => {
    const current = newMemo.tags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t);
    return current.includes("중요");
  };

  // ============================================
  // Memo 카드 컴포넌트
  // ============================================
  const MemoCard = ({ memo }) => (
    <div
      style={{
        backgroundColor: "#2d2d2d",
        borderRadius: "0.5rem",
        padding: "1.5rem",
        cursor: "pointer",
        border: memo.tags.includes("중요")
          ? "2px solid #f59e0b"
          : "1px solid #3d3d3d",
        transition: "transform 0.2s",
        position: "relative",
      }}
      onClick={() => openEditModal(memo)}
      onMouseOver={(e) => {
        e.currentTarget.style.transform = "translateY(-4px)";
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
      }}>
      <div
        style={{
          position: "absolute",
          top: "0.5rem",
          right: "0.5rem",
        }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            deleteMemo(memo.id);
          }}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#ef4444",
            fontSize: "1.2rem",
            padding: "0.25rem",
          }}>
          🗑️
        </button>
      </div>
      <h3
        style={{
          fontSize: "1.1rem",
          fontWeight: 600,
          marginBottom: "0.5rem",
          paddingRight: "2rem",
        }}>
        {memo.title}
      </h3>
      {memo.content && (
        <div
          style={{
            color: "#9ca3af",
            fontSize: "0.9rem",
            marginBottom: "0.5rem",
          }}>
          {renderMarkdown(memo.content)}
        </div>
      )}
      {memo.todos && memo.todos.length > 0 && (
        <div style={{ marginTop: "0.5rem" }}>
          {memo.todos.slice(0, 2).map((todo, idx) => (
            <div
              key={idx}
              onClick={(e) => {
                e.stopPropagation();
                toggleTodo(memo.id, idx);
              }}
              style={{
                fontSize: "0.85rem",
                color: "#9ca3af",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.25rem 0",
              }}>
              <span>{todo.completed ? "☑" : "☐"}</span>
              <span
                style={{
                  textDecoration: todo.completed ? "line-through" : "none",
                  opacity: todo.completed ? 0.6 : 1,
                }}>
                {todo.text}
              </span>
            </div>
          ))}
          {memo.todos.length > 2 && (
            <div
              style={{
                fontSize: "0.75rem",
                color: "#6b7280",
                marginTop: "0.25rem",
              }}>
              +{memo.todos.length - 2}개 더보기
            </div>
          )}
        </div>
      )}
      <div
        style={{
          marginTop: "1rem",
          display: "flex",
          gap: "0.5rem",
          flexWrap: "wrap",
        }}>
        {memo.tags.map((tag, idx) => (
          <span
            key={idx}
            style={{
              padding: "0.25rem 0.5rem",
              backgroundColor: tag === "중요" ? "#f59e0b" : "#374151",
              color: tag === "중요" ? "#000000" : "#e5e5e5",
              borderRadius: "0.25rem",
              fontSize: "0.75rem",
              fontWeight: 600,
            }}>
            #{tag}
          </span>
        ))}
      </div>
    </div>
  );

  // ============================================
  // JSX 렌더
  // ============================================
  return (
    <div
      style={{
        minHeight: "100%",
        width: "100%",
        backgroundColor: "transparent",
        color: "#ffffff",
        margin: 0,
        padding: 0,
      }}>
      {/* 상단 바 */}
      <div
        style={{
          backgroundColor: "#2d2d2d",
          padding: "1rem 4rem",
          borderBottom: "1px solid #3d3d3d",
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          justifyContent: "center",
          margin: "0 auto",
        }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            width: "100%",
          }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="🔍 메모 검색..."
            style={{
              width: "300px",
              padding: "0.5rem 1rem",
              backgroundColor: "#1a1a1a",
              border: "1px solid #4b5563",
              borderRadius: "0.5rem",
              color: "#ffffff",
              outline: "none",
            }}
          />
          <button
            onClick={openCreateModal}
            style={{
              padding: "0.5rem 1.5rem",
              backgroundColor: "#ffffff",
              color: "#000000",
              border: "none",
              borderRadius: "0.5rem",
              cursor: "pointer",
              fontWeight: 700,
            }}>
            + 새 메모
          </button>

          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowTagFilter((prev) => !prev)}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor:
                  selectedTags.length > 0 ? "#3b82f6" : "#1a1a1a",
                color: "#ffffff",
                border: "1px solid #4b5563",
                borderRadius: "0.5rem",
                cursor: "pointer",
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}>
              🏷️ 태그 필터{" "}
              {selectedTags.length > 0 && `(${selectedTags.length})`}
            </button>

            {showTagFilter && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  marginTop: "0.5rem",
                  backgroundColor: "#2d2d2d",
                  border: "1px solid #4b5563",
                  borderRadius: "0.5rem",
                  padding: "1rem",
                  minWidth: "200px",
                  maxHeight: "300px",
                  overflow: "auto",
                  zIndex: 100,
                  boxShadow: "0 4px 6px rgba(0, 0, 0, 0.3)",
                }}>
                <div
                  style={{
                    marginBottom: "0.75rem",
                    paddingBottom: "0.5rem",
                    borderBottom: "1px solid #4b5563",
                    fontSize: "0.9rem",
                    color: "#9ca3af",
                  }}>
                  태그 선택
                </div>

                {Object.keys(allTags).length === 0 ? (
                  <div
                    style={{
                      color: "#6b7280",
                      fontSize: "0.9rem",
                      padding: "0.5rem 0",
                    }}>
                    태그가 없습니다
                  </div>
                ) : (
                  Object.entries(allTags).map(([tag, count]) => (
                    <label
                      key={tag}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        padding: "0.5rem",
                        cursor: "pointer",
                        borderRadius: "0.25rem",
                        transition: "background 0.2s",
                        backgroundColor:
                          tag === "중요"
                            ? "rgba(245, 158, 11, 0.1)"
                            : "transparent",
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.backgroundColor =
                          tag === "중요"
                            ? "rgba(245, 158, 11, 0.2)"
                            : "#374151";
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor =
                          tag === "중요"
                            ? "rgba(245, 158, 11, 0.1)"
                            : "transparent";
                      }}>
                      <input
                        type="checkbox"
                        checked={selectedTags.includes(tag)}
                        onChange={() => toggleTagFilter(tag)}
                        style={{
                          marginRight: "0.5rem",
                          width: "1rem",
                          height: "1rem",
                          cursor: "pointer",
                        }}
                      />
                      <span
                        style={{
                          flex: 1,
                          fontSize: "0.9rem",
                          color: tag === "중요" ? "#f59e0b" : "#ffffff",
                          fontWeight: tag === "중요" ? 600 : 400,
                        }}>
                        {tag === "중요" ? "⭐ " : "#"}
                        {tag}
                      </span>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          backgroundColor:
                            tag === "중요" ? "#f59e0b" : "#374151",
                          color: tag === "중요" ? "#000000" : "#9ca3af",
                          padding: "0.125rem 0.5rem",
                          borderRadius: "0.25rem",
                        }}>
                        {count}
                      </span>
                    </label>
                  ))
                )}

                {Object.keys(allTags).length > 0 && (
                  <div
                    style={{
                      marginTop: "0.75rem",
                      paddingTop: "0.75rem",
                      borderTop: "1px solid #4b5563",
                      display: "flex",
                      gap: "0.5rem",
                    }}>
                    <button
                      onClick={() => {
                        setSelectedTags([]);
                        setShowTagFilter(false);
                      }}
                      style={{
                        flex: 1,
                        padding: "0.5rem",
                        backgroundColor: "#4b5563",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "0.25rem",
                        cursor: "pointer",
                        fontSize: "0.85rem",
                      }}>
                      초기화
                    </button>
                    <button
                      onClick={() => setShowTagFilter(false)}
                      style={{
                        flex: 1,
                        padding: "0.5rem",
                        backgroundColor: "#3b82f6",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "0.25rem",
                        cursor: "pointer",
                        fontSize: "0.85rem",
                      }}>
                      적용
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 본문 */}
      <div
        style={{
          padding: "2rem 4rem",
          margin: "0 auto",
          width: "100%",
          boxSizing: "border-box",
        }}>
        {/* 빠른 입력 */}
        <div
          style={{
            backgroundColor: "#2d2d2d",
            borderRadius: "0.5rem",
            padding: "1rem",
            marginBottom: "2rem",
            border: "1px solid #3d3d3d",
          }}>
          <input
            type="text"
            value={quickInput}
            onChange={(e) => setQuickInput(e.target.value)}
            onKeyDown={handleQuickSubmit}
            placeholder="⚡ 빠른 입력... (Enter로 저장)"
            style={{
              width: "100%",
              padding: "0.5rem",
              backgroundColor: "transparent",
              border: "none",
              color: "#ffffff",
              fontSize: "1rem",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* 중요 메모 */}
        {importantMemos.length > 0 && (
          <div style={{ marginBottom: "2rem" }}>
            <h2
              style={{
                fontSize: "1.25rem",
                fontWeight: 600,
                marginBottom: "1rem",
                color: "#f59e0b",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}>
              ⭐ 중요 메모
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: "1.5rem",
              }}>
              {importantMemos.map((memo) => (
                <MemoCard key={memo.id} memo={memo} />
              ))}
            </div>
          </div>
        )}

        {/* 모든 메모 */}
        <div>
          <h2
            style={{
              fontSize: "1.25rem",
              fontWeight: 600,
              marginBottom: "1rem",
            }}>
            📝 모든 메모
          </h2>

          {loading && (
            <div style={{ marginBottom: "0.5rem", color: "#9ca3af" }}>
              불러오는 중...
            </div>
          )}
          {error && (
            <div style={{ marginBottom: "0.5rem", color: "#f87171" }}>
              {error}
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "1.5rem",
            }}>
            {regularMemos.map((memo) => (
              <MemoCard key={memo.id} memo={memo} />
            ))}
          </div>
        </div>
      </div>

      {/* 모달 */}
      {showModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => {
            setShowModal(false);
            setEditingMemo(null);
            setNewMemo({ title: "", content: "", tags: "" });
          }}>
          <div
            style={{
              backgroundColor: "#2d2d2d",
              borderRadius: "0.5rem",
              padding: "2rem",
              width: "90%",
              maxWidth: "600px",
              maxHeight: "80vh",
              overflow: "auto",
            }}
            onClick={(e) => e.stopPropagation()}>
            <h2
              style={{
                fontSize: "1.5rem",
                fontWeight: 600,
                marginBottom: "1.5rem",
                color: "#ffffff",
              }}>
              {editingMemo ? "✏️ 메모 수정" : "📝 새 메모 작성"}
            </h2>

            {/* 제목 */}
            <div style={{ marginBottom: "1rem" }}>
              <label
                style={{
                  display: "block",
                  color: "#d1d5db",
                  marginBottom: "0.5rem",
                  fontSize: "0.9rem",
                }}>
                제목
              </label>
              <input
                type="text"
                value={newMemo.title}
                onChange={(e) =>
                  setNewMemo((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="메모 제목을 입력하세요"
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  backgroundColor: "#1a1a1a",
                  border: "1px solid #4b5563",
                  borderRadius: "0.5rem",
                  color: "#ffffff",
                  outline: "none",
                  fontSize: "1rem",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* 내용 + 미리보기 */}
            <div style={{ marginBottom: "1rem" }}>
              <label
                style={{
                  display: "block",
                  color: "#d1d5db",
                  marginBottom: "0.5rem",
                  fontSize: "0.9rem",
                }}>
                내용
              </label>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0.5rem",
                }}>
                <div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "#9ca3af",
                      marginBottom: "0.25rem",
                      fontWeight: 500,
                    }}>
                    입력
                  </div>
                  <textarea
                    ref={contentEditableRef}
                    value={newMemo.content}
                    onChange={(e) =>
                      setNewMemo((prev) => ({
                        ...prev,
                        content: e.target.value,
                      }))
                    }
                    onKeyDown={handleContentKeyDown}
                    placeholder="메모 내용을 입력하세요"
                    style={{
                      width: "100%",
                      minHeight: "200px",
                      padding: "0.75rem",
                      backgroundColor: "#1a1a1a",
                      border: "1px solid #4b5563",
                      borderRadius: "0.5rem",
                      color: "#ffffff",
                      outline: "none",
                      fontSize: "1rem",
                      boxSizing: "border-box",
                      fontFamily: "inherit",
                      resize: "vertical",
                    }}
                  />
                </div>

                <div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "#9ca3af",
                      marginBottom: "0.25rem",
                      fontWeight: 500,
                    }}>
                    미리보기
                  </div>
                  <div
                    style={{
                      width: "100%",
                      minHeight: "200px",
                      padding: "0.75rem",
                      backgroundColor: "#0d0d0d",
                      border: "1px solid #4b5563",
                      borderRadius: "0.5rem",
                      color: "#ffffff",
                      fontSize: "1rem",
                      boxSizing: "border-box",
                      fontFamily: "inherit",
                      overflowY: "auto",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}>
                    {newMemo.content ? (
                      renderMarkdown(newMemo.content)
                    ) : (
                      <span style={{ color: "#6b7280" }}>
                        여기에 미리보기가 표시됩니다
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 서식 / 체크박스 */}
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  marginTop: "0.5rem",
                  padding: "0.75rem",
                  backgroundColor: "#1a1a1a",
                  borderRadius: "0.5rem",
                  border: "1px solid #4b5563",
                  flexWrap: "wrap",
                }}>
                <button
                  type="button"
                  onClick={insertBold}
                  style={{
                    padding: "0.5rem 1rem",
                    backgroundColor: "#374151",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "0.25rem",
                    cursor: "pointer",
                    fontSize: "0.9rem",
                    fontWeight: "bold",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    transition: "background 0.2s",
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = "#4b5563";
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = "#374151";
                  }}
                  title="굵게">
                  <strong>B</strong> 굵게
                </button>

                <button
                  type="button"
                  onClick={insertUnderline}
                  style={{
                    padding: "0.5rem 1rem",
                    backgroundColor: "#374151",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "0.25rem",
                    cursor: "pointer",
                    fontSize: "0.9rem",
                    textDecoration: "underline",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    transition: "background 0.2s",
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = "#4b5563";
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = "#374151";
                  }}
                  title="밑줄">
                  <u>U</u> 밑줄
                </button>

                <div
                  style={{
                    width: "1px",
                    backgroundColor: "#4b5563",
                    margin: "0 0.25rem",
                  }}
                />

                <button
                  type="button"
                  onClick={insertCheckbox}
                  style={{
                    padding: "0.5rem 1rem",
                    backgroundColor: "#374151",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "0.25rem",
                    cursor: "pointer",
                    fontSize: "0.9rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    transition: "background 0.2s",
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = "#4b5563";
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = "#374151";
                  }}
                  title="체크리스트 추가">
                  ☐ 체크박스
                </button>

                <div
                  style={{
                    color: "#6b7280",
                    fontSize: "0.75rem",
                    display: "flex",
                    alignItems: "center",
                    paddingLeft: "0.5rem",
                    marginLeft: "auto",
                  }}>
                  💡 **굵게** __밑줄__
                </div>
              </div>
            </div>

            {/* 태그 입력 */}
            <div style={{ marginBottom: "1rem" }}>
              <label
                style={{
                  display: "block",
                  color: "#d1d5db",
                  marginBottom: "0.5rem",
                  fontSize: "0.9rem",
                }}>
                태그 (쉼표로 구분)
              </label>
              <input
                type="text"
                value={newMemo.tags}
                onChange={(e) =>
                  setNewMemo((prev) => ({ ...prev, tags: e.target.value }))
                }
                placeholder="예: 업무, 회의, 긴급"
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  backgroundColor: "#1a1a1a",
                  border: "1px solid #4b5563",
                  borderRadius: "0.5rem",
                  color: "#ffffff",
                  outline: "none",
                  fontSize: "1rem",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* 중요 토글 */}
            <div style={{ marginBottom: "1.5rem" }}>
              <button
                type="button"
                onClick={toggleImportantTag}
                style={{
                  padding: "0.75rem 1.5rem",
                  backgroundColor: hasImportantTag() ? "#f59e0b" : "#374151",
                  color: hasImportantTag() ? "#000000" : "#ffffff",
                  border: "none",
                  borderRadius: "0.5rem",
                  cursor: "pointer",
                  fontSize: "1rem",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  transition: "all 0.2s",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = "scale(1.02)";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                }}>
                <span>{hasImportantTag() ? "⭐" : "☆"}</span>
                {hasImportantTag() ? "중요 메모 해제" : "중요 메모로 표시"}
              </button>
            </div>

            {/* 모달 버튼들 */}
            <div
              style={{
                display: "flex",
                gap: "1rem",
                justifyContent: "flex-end",
              }}>
              <button
                onClick={() => {
                  setShowModal(false);
                  setNewMemo({ title: "", content: "", tags: "" });
                  setEditingMemo(null);
                }}
                style={{
                  padding: "0.75rem 1.5rem",
                  backgroundColor: "#4b5563",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "0.5rem",
                  cursor: "pointer",
                  fontSize: "1rem",
                  fontWeight: 500,
                }}>
                취소
              </button>
              <button
                onClick={editingMemo ? handleUpdateMemo : handleCreateMemo}
                style={{
                  padding: "0.75rem 1.5rem",
                  backgroundColor: "#ffffff",
                  color: "#000000",
                  border: "none",
                  borderRadius: "0.5rem",
                  cursor: "pointer",
                  fontSize: "1rem",
                  fontWeight: 700,
                }}>
                {editingMemo ? "수정" : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 토스트 알림 */}
      {successMessage && (
        <div
          style={{
            position: "fixed",
            bottom: "1.5rem",
            right: "1.5rem",
            padding: "0.75rem 1.25rem",
            backgroundColor: "#16a34a",
            color: "#f9fafb",
            borderRadius: "999px",
            fontSize: "0.85rem",
            boxShadow: "0 10px 25px rgba(0,0,0,0.4)",
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}>
          <span>✅</span>
          <span>{successMessage}</span>
        </div>
      )}
    </div>
  );
}

export default MemoMainPage;
