// src/App.jsx
import React, {
  useMemo,
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./pages/AuthContext";
import { buildCategoryGrouper, getAxisStatsFromGrouped } from "./data";
import CleanlinessPage from "./pages/Cleanliness";
import PersonaPage from "./pages/Persona";
import MemoMainPage from "./pages/MemoMainPage";

const USE_BACKEND = true;
const API_BASE_URL = "https://theosophic-gumlike-jeffery.ngrok-free.dev/api";

const getAuthToken = () => localStorage.getItem("access_token");

const getHeaders = () => {
  const headers = {
    Accept: "application/json",
    "ngrok-skip-browser-warning": "true",
  };
  const token = getAuthToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
};

const getJsonHeaders = () => {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "ngrok-skip-browser-warning": "true",
  };
  const token = getAuthToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
};

const handleResponse = async (response) => {
  const contentType = response.headers.get("content-type") || "";

  // JSON이 아닌 응답 처리
  if (!contentType.includes("application/json")) {
    const text = await response.text().catch(() => "");
    const trimmed = (text || "").trim();

    // 1) ngrok / Django HTML 에러 페이지 방어
    if (trimmed.startsWith("<!DOCTYPE html") || trimmed.startsWith("<html")) {
      throw new Error(
        "서버에서 JSON 대신 HTML 응답을 받았습니다.\n" +
          "(ngrok 경고 페이지일 가능성이 높아요. ngrok-skip-browser-warning 헤더가 제대로 전달되는지 확인해주세요.)"
      );
    }

    // 2) JSON은 아니지만, 상태코드가 2xx면 성공으로 취급
    if (response.ok) {
      // 본문이 있으면 raw 텍스트를 돌려주고, 없으면 빈 객체
      return trimmed ? { raw: trimmed } : {};
    }

    // 3) JSON도 아니고 실패 상태코드면 에러로
    const snippet = trimmed ? trimmed.slice(0, 200) : "";
    throw new Error(
      `서버에서 JSON이 아닌 에러 응답을 받았습니다.${
        snippet ? "\n" + snippet : ""
      }`
    );
  }

  let data;
  try {
    data = await response.json();
  } catch (e) {
    throw new Error("응답 JSON 파싱 중 오류가 발생했습니다.");
  }

  if (!response.ok) {
    const msg =
      data.detail ||
      data.message ||
      data.error ||
      (typeof data === "string" ? data : JSON.stringify(data));
    throw new Error(msg);
  }

  return data;
};

// URI → 한글 레이블 매핑 테이블

const TYPE_URI_LABEL_MAP = {
  "sseukssak:PlanningDocument": "기획 문서",
  "sseukssak:Schedule": "일정/업무 계획표",
  "sseukssak:ResearchMaterial": "조사/리서치 자료",
  "sseukssak:AnalysisResult": "데이터 수집/분석 결과",
  "sseukssak:Report": "보고서/리포트",
  "sseukssak:Draft": "초안/원고",
  "sseukssak:PresentationMaterial": "발표/프레젠테이션 자료",
  "sseukssak:FinancialDocument": "재무/회계 문서",
  "sseukssak:LegalDocument": "법률/계약 문서",
  "sseukssak:HRDocument": "인사/복무 문서",
  "sseukssak:CommunicationDocument": "보고/소통 문서",
  "sseukssak:SourceCode": "소스 코드/스크립트",
  "sseukssak:BuildFile": "배포/빌드 파일",
  "sseukssak:DebuggingMaterial": "디버깅/테스트 자료",
  "sseukssak:StudyNote": "학습 자료/필기",
  "sseukssak:ProblemSolvingMaterial": "문제/평가 자료",
  "sseukssak:Summary": "요약/정리본",
  "sseukssak:LogDocument": "일지/기록 문서",
  "sseukssak:ManagementDocument": "관리/운영 문서",
  "sseukssak:MarketingMaterial": "마케팅/홍보 자료",
  "sseukssak:StudentCollaboration": "학생 협업 자료",
  "sseukssak:ResearchPaper": "연구 저술물",
  "sseukssak:DeveloperCollaborationLog": "개발자 협업 기록",
  "sseukssak:MovieDrama": "영화/드라마",
  "sseukssak:Reading": "독서",
  "sseukssak:Music": "음악",
  "sseukssak:Game": "게임",
  "sseukssak:Exercise": "운동",
  "sseukssak:Pet": "반려동물",
  "sseukssak:TravelLog": "여행 기록",
  "sseukssak:TravelPhoto": "여행 사진",
  "sseukssak:TravelPlan": "여행 계획",
  "sseukssak:Blog": "블로그",
  "sseukssak:Writing": "글쓰기",
  "sseukssak:Diary": "일기",
};
function getKoreanLabelFromUri(uri) {
  return TYPE_URI_LABEL_MAP[uri] || uri; // 매핑 없으면 원본 URI 그대로
}

// sourceKind → 한글 라벨 매핑

const SOURCE_KIND_LABELS = {
  link: "북마크",
  memo: "메모",
  image: "사진",
  mail: "메일",
  pdf: "문서",
  doc: "문서",
};
function getKoreanSourceKind(kind) {
  if (!kind) return "";
  return SOURCE_KIND_LABELS[kind] || kind;
}

const mapBackendDocToFrontend = (doc) => {
  // 1) 문서 타입 매핑 (백엔드: doc_type)
  let sourceKind = "doc";
  const t = (doc.doc_type || doc.document_type || "").toUpperCase();

  switch (t) {
    case "EMAIL":
      sourceKind = "mail";
      break;
    case "MEMO":
      sourceKind = "memo";
      break;
    case "IMAGE":
      sourceKind = "image";
      break;
    case "PDF":
      sourceKind = "pdf";
      break;
    case "LINK":
      // 북마크/링크 계열
      sourceKind = "link";
      break;
    case "FILE":
    default:
      sourceKind = "doc";
      break;
  }

  // 2) 온톨로지 타입 URI
  const typeUri =
    doc.typeUri ||
    doc.type_uri ||
    (doc.semantic_details && doc.semantic_details.type_uri) ||
    "";

  // 3) 경로/파일 URL 정리
  const path = doc.path || doc.file_path || "";
  const uploadedUrl = doc.uploadedUrl || doc.uploaded_file || null;

  return {
    ...doc,
    sourceKind,
    typeUri,
    path,
    uploadedUrl,
  };
};

const hasMainContent = (file) => {
  if (!file) return false;

  const getTrim = (v) =>
    typeof v === "string" ? v.trim() : v != null ? String(v).trim() : "";

  if (getTrim(file.content)) return true;
  if (getTrim(file.body)) return true;
  if (getTrim(file.text)) return true;

  const sd = file.semantic_details;
  if (sd) {
    if (getTrim(sd.full_text)) return true;
    if (getTrim(sd.content)) return true;
  }

  return false;
};

const fetchDocumentDetail = async (id) => {
  if (!USE_BACKEND || !id) return null;

  try {
    const res = await fetch(`${API_BASE_URL}/documents/${id}/`, {
      method: "GET",
      headers: getHeaders(),
    });
    const data = await handleResponse(res);
    return mapBackendDocToFrontend(data);
  } catch (err) {
    console.error("문서 상세 조회 오류:", err);
    return null;
  }
};

function App() {
  const navigate = useNavigate();

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const bookmarkInputRef = useRef(null);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activePage, setActivePage] = useState("dashboard");
  const [mode, setMode] = useState("core");
  const { user } = useAuth();
  const profile = user?.job_template || "developer";

  const [activeCategory, setActiveCategory] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [hoveredAxis, setHoveredAxis] = useState(null);
  const [dashboardCategories, setDashboardCategories] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [files, setFiles] = useState([]);

  const loadDashboard = useCallback(async () => {
    if (!USE_BACKEND) {
      console.warn(
        "[Documents] USE_BACKEND=false 상태입니다. 문서 목록을 로드하지 않습니다."
      );
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/documents/`, {
        method: "GET",
        headers: getHeaders(),
      });
      const data = await handleResponse(res);

      let docs = null;
      if (Array.isArray(data)) {
        docs = data;
      } else if (Array.isArray(data.results)) {
        docs = data.results;
      } else if (Array.isArray(data.documents)) {
        docs = data.documents;
      } else {
        console.warn(
          "[Documents] 예상치 못한 응답 형식입니다. 빈 목록을 사용합니다.",
          data
        );
        setFiles([]);
        return;
      }

      const normalizedDocs = docs.map(mapBackendDocToFrontend);
      setFiles(normalizedDocs);
    } catch (err) {
      console.error("문서 목록 API 오류:", err);
      setFiles([]);
    }
  }, []);

  const handleOpenFolderDialog = () => {
    if (folderInputRef.current) {
      folderInputRef.current.value = "";
      folderInputRef.current.click();
    }
  };

  const handleDeleteSelectedFile = async () => {
    if (!selectedFile) return;

    const ok = window.confirm("정말 이 파일을 삭제할까요?");
    if (!ok) return;

    // 백엔드 안 쓰는 모드면 그냥 프론트 상태에서만 제거
    if (!USE_BACKEND || !selectedFile.id) {
      setFiles((prev) =>
        Array.isArray(prev)
          ? prev.filter((f) => f.id !== selectedFile.id)
          : prev
      );
      setSearchResults((prev) =>
        Array.isArray(prev)
          ? prev.filter((f) => f.id !== selectedFile.id)
          : prev
      );
      setSelectedFile(null);
      return;
    }

    try {
      // 실제 삭제 API 호출
      const res = await fetch(`${API_BASE_URL}/documents/${selectedFile.id}/`, {
        method: "DELETE",
        headers: getHeaders(),
      });

      // 일부 서버는 204(No Content)만 내려주기도 해서 별도 처리
      if (!res.ok && res.status !== 204) {
        await handleResponse(res); // 에러 메시지 파싱용
      }

      // 프론트 상태에서도 제거
      setFiles((prev) =>
        Array.isArray(prev)
          ? prev.filter((f) => f.id !== selectedFile.id)
          : prev
      );
      setSearchResults((prev) =>
        Array.isArray(prev)
          ? prev.filter((f) => f.id !== selectedFile.id)
          : prev
      );
      setSelectedFile(null);

      // 대시보드 재로딩 (개수/그래프 최신화)
      await loadDashboard();
    } catch (err) {
      console.error("파일 삭제 오류:", err);
      alert("파일 삭제 중 오류가 발생했습니다. 콘솔을 확인해주세요.");
    }
  };

  // 대시보드 통계 API (GET /api/dashboard/)
  const loadDashboardStats = useCallback(async () => {
    if (!USE_BACKEND) return;

    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/`, {
        method: "GET",
        headers: getHeaders(),
      });
      const data = await handleResponse(res);

      setDashboardCategories(data.categorized_docs || []);
    } catch (err) {
      console.error("대시보드 통계 API 오류:", err);
      setDashboardCategories([]);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
    loadDashboardStats();
  }, [loadDashboard, loadDashboardStats]);

  // 데이터 가공 (카테고리/축 통계)

  const { grouped, order } = useMemo(() => {
    const base = buildCategoryGrouper({
      files,
      profileKey: profile,
      mode,
    });

    // 각 축에 이미 들어간 파일들 key 모으기
    const usedKeys = new Set();
    const getKey = (f) =>
      f?.id ?? f?.pk ?? f?.document_id ?? f?.path ?? f?.file_path ?? f?.title;

    base.order.forEach((cat) => {
      (base.grouped[cat] || []).forEach((f) => {
        const k = getKey(f);
        if (k != null) usedKeys.add(k);
      });
    });

    // 어떤 축에도 안 들어간 파일을 미분류로 모으기
    const uncategorized = files.filter((f) => {
      const k = getKey(f);
      if (k == null) return true;
      return !usedKeys.has(k);
    });

    // 본업 모드일 때만 미분류 축/카테고리 추가
    if (mode === "core" && uncategorized.length > 0) {
      return {
        grouped: {
          ...base.grouped,
          미분류: uncategorized,
        },
        order: base.order.includes("미분류")
          ? base.order
          : [...base.order, "미분류"],
      };
    }

    // 일반 모드나 미분류가 없으면 원래 그대로
    return base;
  }, [files, profile, mode]);

  const axesWithStats = useMemo(() => {
    // 1) 기존 로직으로 먼저 기본 값 생성
    const baseStats = order.map((cat) => getAxisStatsFromGrouped(grouped, cat));

    // 2) 백엔드 통계가 없으면 기존 것 그대로 사용
    if (!dashboardCategories || dashboardCategories.length === 0) {
      return baseStats;
    }

    // 3) category_label 기준으로 빠르게 찾을 수 있게 맵으로 변환
    const labelMap = new Map();
    dashboardCategories.forEach((item) => {
      if (item.category_label) {
        labelMap.set(item.category_label, item);
      }
    });

    // 4) 각 축(axis.key)이 백엔드 category_label과 매칭되면
    //    백엔드 숫자로 totalCount / docs / photos / mails / bookmarks / memos 덮어쓰기
    return baseStats.map((axis) => {
      const serverCat = labelMap.get(axis.key);
      if (!serverCat) return axis; // 매칭되는 카테고리 없으면 기존 값 유지

      const tc = serverCat.type_counts || {};

      //  백엔드 타입 → 툴팁 항목을 매핑
      const pdf = tc.PDF || 0;
      const memo = tc.MEMO || 0;
      const link = tc.LINK || 0;
      const email = tc.EMAIL || 0;
      const image = tc.IMAGE || 0;
      // FILE은 툴팁에 굳이 안 쓰면 제외

      const docs = pdf; // 문서 = PDF 개수
      const photos = image; // 사진 = IMAGE 개수
      const mails = email; // 메일 = EMAIL 개수
      const bookmarks = link; // 북마크 = LINK 개수
      const memos = memo; // 메모 = MEMO 개수

      const totalCount =
        serverCat.count ?? docs + photos + mails + bookmarks + memos;

      return {
        ...axis,
        totalCount,
        docs,
        photos,
        mails,
        bookmarks,
        memos,
      };
    });
  }, [grouped, order, dashboardCategories]);

  const maxTotal =
    axesWithStats
      .filter((axis) => axis.key !== "미분류")
      .reduce(
        (max, axis) => (axis.totalCount > max ? axis.totalCount : max),
        1
      ) || 1;

  const personaRadarData = useMemo(() => {
    const visibleAxes = axesWithStats.filter((axis) => axis.key !== "미분류");

    if (!visibleAxes.length) return null;

    const axes = visibleAxes.map((axis) => ({
      key: axis.key,
      label: axis.key,
    }));

    const user = {};
    visibleAxes.forEach((axis) => {
      const count = axis.totalCount || 0;
      user[axis.key] = maxTotal ? count / maxTotal : 0;
    });

    return { axes, user };
  }, [axesWithStats, maxTotal]);

  const allFiles = files;

  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }

    // 백엔드 OFF → 로컬 제목 검색 (그대로 유지)
    if (!USE_BACKEND) {
      const filtered = allFiles.filter((file) =>
        (file.title || "").toLowerCase().includes(q.toLowerCase())
      );
      setSearchResults(filtered);
      return;
    }

    try {
      setSearchLoading(true);
      const url = `${API_BASE_URL}/search/?q=${encodeURIComponent(q)}`;
      const res = await fetch(url, {
        method: "GET",
        headers: getHeaders(),
      });
      const data = await handleResponse(res);

      console.log("[검색 응답]", data);

      const rawResults = Array.isArray(data.results)
        ? data.results
        : Array.isArray(data.documents)
        ? data.documents
        : [];

      const mapped = rawResults
        .map((item) => {
          const doc = item.document || item;
          if (!doc) return null;
          return mapBackendDocToFrontend(doc);
        })
        .filter(Boolean);

      if (mapped.length === 0) {
        const fallback = allFiles.filter((file) =>
          (file.title || "").toLowerCase().includes(q.toLowerCase())
        );
        setSearchResults(fallback);
      } else {
        setSearchResults(mapped);
      }
    } catch (err) {
      console.error("검색 API 오류:", err);
      const fallback = allFiles.filter((file) =>
        (file.title || "").toLowerCase().includes(q.toLowerCase())
      );
      setSearchResults(fallback);
    } finally {
      setSearchLoading(false);
    }
  }, [allFiles, searchQuery]);

  const handleCleanUp = async () => {
    if (!USE_BACKEND) {
      alert("📂 정리 요청이 전송된 것처럼 동작합니다. (데모 모드)");
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/organize/`, {
        method: "POST",
        headers: getJsonHeaders(),
        body: JSON.stringify({}),
      });
      const data = await handleResponse(res);
      alert(`🧹 ${data.message || "정리 작업이 시작되었습니다."}`);
      await loadDashboard();
    } catch (err) {
      console.error("정리하기 API 오류:", err);
      alert("정리 요청 중 오류가 발생했습니다. 콘솔을 확인해 주세요.");
    }
  };

  // 수정된 부분: 검색 결과도 본문이 없으면 /documents/:id/로 상세 조회
  const handleFileClick = async (file) => {
    setActivePage("dashboard");

    // 이미 본문이 있으면 그대로 사용
    if (hasMainContent(file) || !USE_BACKEND || !file?.id) {
      setSelectedFile(file);
      return;
    }

    // 검색 결과 등에서 온, 본문이 비어있는 경우 → 상세 조회
    const detailed = await fetchDocumentDetail(file.id);

    if (detailed && hasMainContent(detailed)) {
      setSelectedFile(detailed);

      // files 상태에도 반영 (같은 id 문서 업데이트)
      setFiles((prev) =>
        Array.isArray(prev)
          ? prev.map((f) => (f.id === detailed.id ? { ...f, ...detailed } : f))
          : prev
      );
    } else {
      // 그래도 못 가져오면 기존 메타 데이터만이라도 보여주기
      setSelectedFile(file);
    }
  };

  // 파일 선택창 열기 (일반 파일)
  const handleOpenFileDialog = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  // 북마크 HTML 선택창 열기
  const handleOpenBookmarkDialog = () => {
    if (bookmarkInputRef.current) {
      bookmarkInputRef.current.value = "";
      bookmarkInputRef.current.click();
    }
  };

  const handleFileChange = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of files) {
      const relativePath = file.webkitRelativePath || file.name;

      const formData = new FormData();
      formData.append("file", file);
      formData.append("uploaded_file", file);
      formData.append("title", file.name);
      formData.append("content", "");
      formData.append("file_path", relativePath); // 폴더 + 파일 경로 전체

      try {
        const res = await fetch(`${API_BASE_URL}/documents/`, {
          method: "POST",
          headers: getHeaders(),
          body: formData,
        });
        await handleResponse(res);
      } catch (err) {
        console.error("파일 업로드 오류:", err);
      }
    }

    alert("📁 업로드 완료!");
    await loadDashboard();
  };

  // 북마크 HTML 업로드 (3.1 북마크 연동)
  const handleBookmarkFileChange = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    console.log("선택된 북마크 파일:", file);

    if (!USE_BACKEND) {
      alert(
        "🔖 북마크 업로드는 백엔드 연결 후 사용할 수 있습니다. (현재 데모 모드)"
      );
      return;
    }

    try {
      const formData = new FormData();
      // 북마크 임포트는 file 키 사용
      formData.append("file", file);

      const res = await fetch(`${API_BASE_URL}/bookmarks/import/`, {
        method: "POST",
        headers: getHeaders(),
        body: formData,
      });

      await handleResponse(res);
      alert("🔖 북마크 업로드 및 분석을 시작했습니다.");
      await loadDashboard();
    } catch (err) {
      console.error("북마크 업로드 오류:", err);
      alert("북마크 업로드 중 오류가 발생했습니다. 콘솔을 확인해주세요.");
    }
  };

  // 레이더 렌더 (대시보드 전용)

  const renderRadar = () => {
    const size = 400;
    const cx = size / 2;
    const cy = size / 2;
    const maxR = 150;
    const levels = 4;

    //  레이더 차트에 그릴 축: 미분류는 제외
    const visibleAxes = axesWithStats.filter((axis) => axis.key !== "미분류");

    // 표시할 축이 하나도 없으면 그냥 빈 상태
    if (visibleAxes.length === 0) {
      return (
        <div
          className="text-[11px] text-neutral-500"
          style={{
            width: size,
            height: size,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
          표시할 축 데이터가 없습니다.
        </div>
      );
    }

    return (
      <div
        className="relative"
        style={{ width: size, height: size, margin: "0 auto" }}>
        <svg width={size} height={size}>
          {Array.from({ length: levels }, (_, i) => {
            const r = (maxR / levels) * (i + 1);
            return (
              <circle
                key={`ring-${i + 1}`}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke="#262626"
                strokeWidth={0.6}
              />
            );
          })}

          {(() => {
            const axisElements = [];
            const points = [];

            visibleAxes.forEach((axis, idx) => {
              const angle =
                (2 * Math.PI * idx) / visibleAxes.length - Math.PI / 2;
              const r =
                axis.totalCount === 0
                  ? 10
                  : Math.max(16, (axis.totalCount / maxTotal) * maxR);

              const xEnd = cx + Math.cos(angle) * maxR;
              const yEnd = cy + Math.sin(angle) * maxR;
              const xVal = cx + Math.cos(angle) * r;
              const yVal = cy + Math.sin(angle) * r;

              points.push({ x: xVal, y: yVal });

              axisElements.push(
                <line
                  key={`axis-line-${idx}`}
                  x1={cx}
                  y1={cy}
                  x2={xEnd}
                  y2={yEnd}
                  stroke="#262626"
                  strokeWidth={0.8}
                />
              );

              const labelOffset = 18;
              const lx = cx + Math.cos(angle) * (maxR + labelOffset);
              const ly = cy + Math.sin(angle) * (maxR + labelOffset);

              axisElements.push(
                <text
                  key={`axis-label-${idx}`}
                  x={lx}
                  y={ly}
                  textAnchor="middle"
                  alignmentBaseline="middle"
                  className="select-none"
                  style={{
                    fontSize: "10px",
                    fill:
                      hoveredAxis && hoveredAxis.key === axis.key
                        ? "#e5e5e5"
                        : "#9ca3af",
                    cursor: "default",
                  }}
                  onMouseEnter={() =>
                    setHoveredAxis({
                      ...axis,
                      _lx: lx,
                      _ly: ly,
                      _angle: angle,
                    })
                  }
                  onMouseLeave={() => setHoveredAxis(null)}>
                  {axis.key}
                </text>
              );
            });

            const polygonPath =
              points.length > 0
                ? points
                    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
                    .join(" ") + " Z"
                : "";

            return (
              <>
                {axisElements}
                {points.length > 0 && (
                  <path
                    d={polygonPath}
                    fill="rgba(161,161,170,0.12)"
                    stroke="#f9fafb"
                    strokeWidth={1}
                  />
                )}
                <circle cx={cx} cy={cy} r={2} fill="#f9fafb" />
              </>
            );
          })()}
        </svg>

        {hoveredAxis && (
          <div
            className="absolute bg-neutral-950/95 border border-neutral-800 rounded-xl px-3 py-2 text-[9px] text-neutral-100 shadow-lg pointer-events-none"
            style={(() => {
              const base = 12;
              const extra = 14;
              const GAP = base + extra * Math.abs(Math.sin(hoveredAxis._angle));
              const dx = Math.cos(hoveredAxis._angle) * GAP;
              const dy = Math.sin(hoveredAxis._angle) * GAP;
              const leftSide = Math.cos(hoveredAxis._angle) < 0;

              return {
                left: hoveredAxis._lx + dx,
                top: hoveredAxis._ly + dy,
                transform: `translate(${leftSide ? "-100%" : "0"}, -50%)`,
                whiteSpace: "nowrap",
                minWidth: 100,
              };
            })()}>
            <div className="text-[10px] font-semibold text-center">
              총 컨텐츠:{" "}
              <span className="font-semibold">{hoveredAxis.totalCount}</span>개
            </div>
          </div>
        )}
      </div>
    );
  };

  const sidebarWidthClass = sidebarOpen ? "w-64" : "w-0";

  const pageTitle = (() => {
    switch (activePage) {
      case "cleanliness":
        return ["Cleanliness", "깔끔지수"];
      case "persona":
        return ["Persona", "디지털 페르소나"];
      case "memo":
        return ["Memo", "메모장"];
      default:
        return ["Dashboard", "방사형 그래프"];
    }
  })();

  const effectiveSearchResults = searchResults;

  const mainContent = (() => {
    if (!selectedFile) return "";
    return (
      selectedFile.content ||
      selectedFile.body ||
      selectedFile.text ||
      (selectedFile.semantic_details &&
        selectedFile.semantic_details.full_text) ||
      "이 파일의 본문 내용이 아직 준비되지 않았습니다.\n(백엔드에서 실제 본문 필드를 전달하면 이 영역에 표시됩니다.)"
    );
  })();

  const summaryText = (() => {
    if (!selectedFile) return "";
    if (selectedFile.summary && selectedFile.summary.trim().length > 0) {
      return selectedFile.summary;
    }
    return "이 파일의 요약이 아직 없습니다. 정리하기 버튼을 눌러 요약을 생성하거나, 백엔드에서 summary 필드를 채워주면 이 영역에 표시됩니다.";
  })();

  const typeUriText =
    selectedFile?.typeUri ||
    selectedFile?.type_uri ||
    selectedFile?.semantic_details?.type_uri ||
    "";

  const pathText = selectedFile?.path || selectedFile?.file_path || "";

  // 렌더링

  return (
    <div className="h-screen w-screen bg-neutral-900 text-neutral-50 flex overflow-y-auto">
      {/* Sidebar */}
      <div
        className={`${sidebarWidthClass} transition-all duration-200 bg-neutral-950 border-r border-neutral-800 flex flex-col`}>
        {sidebarOpen && (
          <div className="flex flex-col h-full">
            {/* Sidebar header */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold tracking-tight">
                  SSG
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="w-6 h-6 flex items-center justify-center rounded-md bg-neutral-800 text-neutral-300 hover:text-neutral-200 hover:bg-neutral-700 text-xs border-none p-0 transition-colors"
                  title="사이드바 닫기">
                  ←
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1">
              <>
                <div
                  onClick={() => {
                    navigate("/account");
                  }}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-xs ${
                    activePage === "account"
                      ? "bg-neutral-800 text-neutral-50"
                      : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
                  }`}>
                  <span>계정 관리</span>
                </div>

                <div
                  onClick={() => {
                    setActivePage("dashboard");
                    setSelectedFile(null);
                    navigate("/app");
                  }}
                  className={`mt-1 flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-xs ${
                    activePage === "dashboard"
                      ? "bg-neutral-800 text-neutral-50"
                      : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
                  }`}>
                  <span>대시보드</span>
                </div>

                <div
                  onClick={() => {
                    setActivePage("memo");
                    setSelectedFile(null);
                  }}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-xs ${
                    activePage === "memo"
                      ? "bg-neutral-800 text-neutral-50"
                      : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
                  }`}>
                  <span>메모장</span>
                </div>

                <div
                  onClick={() => {
                    setActivePage("cleanliness");
                    setSelectedFile(null);
                  }}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-xs ${
                    activePage === "cleanliness"
                      ? "bg-neutral-800 text-neutral-50"
                      : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
                  }`}>
                  <span>깔끔지수</span>
                </div>

                <div
                  onClick={() => {
                    setActivePage("persona");
                    setSelectedFile(null);
                  }}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-xs ${
                    activePage === "persona"
                      ? "bg-neutral-800 text-neutral-50"
                      : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
                  }`}>
                  <span>디지털 페르소나</span>
                </div>
              </>

              <>
                <div className="mt-4 text-[10px] uppercase tracking-[0.14em] text-neutral-500 px-1">
                  Search
                </div>
                <div className="mt-1 flex gap-1">
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSearch();
                      }
                    }}
                    placeholder="파일을 검색하세요."
                    className="w-full px-2 py-1.5 text-[11px] rounded-md bg-neutral-950 border border-neutral-800 text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-neutral-500"
                  />
                  <button
                    type="button"
                    onClick={handleSearch}
                    className="px-2 py-1.5 text-[11px] rounded-md bg-neutral-800 border border-neutral-700 text-neutral-100 hover:bg-neutral-700 flex-shrink-0">
                    검색
                  </button>
                </div>
                {searchLoading && (
                  <div className="mt-1 text-[10px] text-neutral-500 px-1">
                    검색 중...
                  </div>
                )}
                {effectiveSearchResults.length > 0 && (
                  <div className="mt-1 rounded-md bg-neutral-950 border border-neutral-800 max-h-40 overflow-y-auto">
                    {effectiveSearchResults.map((file, idx) => (
                      <div
                        key={`${file.id}-${idx}`}
                        onClick={() => handleFileClick(file)}
                        className="px-2 py-1.5 text-[10px] text-neutral-300 hover:bg-neutral-900 cursor-pointer flex justify-between items-center">
                        <span className="truncate mr-1">
                          {file.title || "제목 없음"}
                        </span>
                        <span className="text-[9px] text-neutral-500">
                          {file.sourceKind}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>

              <div className="mt-4">
                <div className="text-[10px] uppercase tracking-[0.14em] text-neutral-500 px-1">
                  Categories
                </div>
                {order.map((cat) => {
                  const list = grouped[cat] || [];
                  const isActive = activeCategory === cat;
                  return (
                    <div key={cat} className="mt-1">
                      <div
                        onClick={() =>
                          setActiveCategory((prev) =>
                            prev === cat ? null : cat
                          )
                        }
                        className={`flex items-center justify-between px-2 py-2 rounded-lg cursor-pointer ${
                          isActive
                            ? "bg-neutral-800 text-neutral-50"
                            : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
                        }`}>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{cat}</span>
                        </div>
                        <span className="text-[11px] text-neutral-500">
                          {list.length}
                        </span>
                      </div>
                      {isActive && (
                        <div className="mt-0.5 pl-3 max-h-28 overflow-y-auto">
                          {list.map((file) => (
                            <div
                              key={file.id}
                              onClick={() => handleFileClick(file)}
                              className="text-[12px] text-neutral-400 py-1 pr-1 rounded-md hover:bg-neutral-900 hover:text-neutral-100 cursor-pointer flex items-center justify-between gap-1">
                              <span className="truncate max-w-[150px] flex-1">
                                {file.title || "제목 없음"}
                              </span>

                              <span className="text-[10px] text-neutral-500 whitespace-nowrap flex-shrink-0">
                                {getKoreanSourceKind(
                                  file.sourceKind || file.source_kind
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col bg-neutral-900">
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileChange}
        />

        <input
          type="file"
          ref={folderInputRef}
          className="hidden"
          onChange={handleFileChange}
          webkitdirectory="true"
          directory="true"
          multiple
        />

        <input
          type="file"
          ref={bookmarkInputRef}
          className="hidden"
          accept=".html,text/html"
          onChange={handleBookmarkFileChange}
        />

        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-800">
          <div className="flex items-center gap-2 text-[11px] text-neutral-500">
            {!sidebarOpen && (
              <button
                onClick={() => {
                  setSidebarOpen(true);
                }}
                className="w-7 h-7 mr-1 flex items-center justify-center rounded-2xl bg-neutral-800 text-white hover:text-neutral-200 hover:bg-neutral-700 transition-colors text-xs"
                title="사이드바 열기">
                ☰
              </button>
            )}
            <span className="text-neutral-400 text-xs">{pageTitle[0]}</span>
            <span>/</span>
            <span className="text-neutral-200 text-xs">{pageTitle[1]}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenBookmarkDialog}
              className="px-3 py-1.5 rounded-full text-[11px]
             bg-neutral-900 text-neutral-100
             border border-neutral-600
             hover:bg-neutral-800 hover:border-neutral-500
             transition-all">
              북마크 업로드
            </button>

            <button
              type="button"
              onClick={() => navigate("/profile-select")}
              className="px-3 py-1.5 rounded-full text-[11px]
             bg-neutral-900 text-neutral-100
             border border-neutral-600
             hover:bg-neutral-800 hover:border-neutral-500
             transition-all">
              직업 변경
            </button>

            <button
              type="button"
              onClick={handleOpenFileDialog}
              className="px-3 py-1.5 rounded-full text-[11px]
             bg-neutral-100 text-neutral-900
             border border-neutral-300
             shadow-[0_2px_6px_rgba(0,0,0,0.25)]
             hover:bg-white hover:border-neutral-400
             transition-all">
              + 파일 추가
            </button>

            <button
              type="button"
              onClick={handleOpenFolderDialog}
              className="px-3 py-1.5 rounded-full text-[11px]
             bg-neutral-100 text-neutral-900
             border border-neutral-300
             shadow-[0_2px_6px_rgba(0,0,0,0.25)]
             hover:bg-white hover:border-neutral-400
             transition-all">
              + 폴더 추가
            </button>
          </div>
        </div>

        {activePage === "dashboard" && (
          <div className="flex-1 p-4 grid grid-cols-[minmax(0,2fr)_minmax(220px,1fr)] gap-4">
            <div className="bg-neutral-950 border border-neutral-800 rounded-2xl px-4 py-3 flex flex-col">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold text-neutral-100">
                      {selectedFile ? "파일 내용" : "실시간 방사형 그래프"}
                    </span>
                  </div>
                  <div className="text-[12px] text-neutral-500">
                    {selectedFile
                      ? ""
                      : "축 위에 마우스를 올리면 전체 파일 개수를 볼 수 있습니다."}
                  </div>
                </div>

                {!selectedFile && (
                  <div className="flex items-center gap-3 flex-nowrap shrink-0">
                    <div className="inline-flex items-center px-1 py-0.5 flex-nowrap ">
                      <button
                        onClick={() => setMode("core")}
                        className={`px-3 py-1 rounded-full text-[9px] whitespace-nowrap border-none ${
                          mode === "core"
                            ? "bg-neutral-50 text-neutral-900"
                            : "text-neutral-400"
                        }`}
                        style={{
                          backgroundColor:
                            mode === "core" ? "white" : "inherit",
                        }}>
                        본업 모드
                      </button>
                      <button
                        onClick={() => setMode("hobby")}
                        className={`px-3 py-1 rounded-full text-[9px] whitespace-nowrap border-none ${
                          mode === "hobby"
                            ? "bg-neutral-50 text-neutral-900"
                            : "text-neutral-400"
                        }`}
                        style={{
                          backgroundColor:
                            mode === "hobby" ? "white" : "inherit",
                        }}>
                        취미 모드
                      </button>
                    </div>

                    <button
                      onClick={handleCleanUp}
                      className="group px-3 py-1 rounded-full text-[11px]
                                 bg-neutral-900 text-neutral-100
                                 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04),0_4px_12px_rgba(0,0,0,0.45)]
                                 hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_6px_16px_rgba(0,0,0,0.55)]
                                 transition-shadow">
                      <span className="inline-block mr-1 transition-transform duration-200 group-hover:rotate-12">
                        🧹
                      </span>
                      정리하기
                    </button>
                  </div>
                )}
              </div>

              {selectedFile ? (
                <div className="flex-1 mt-2 overflow-hidden">
                  <div className="w-full h-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-[12px] text-neutral-200 overflow-y-auto">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold text-[15px] truncate mr-2">
                        {selectedFile.title}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleDeleteSelectedFile}
                          className="text-[9px] text-red-300 hover:text-red-200 px-2 py-0.5 rounded-full border border-red-400/60 hover:border-red-300 bg-neutral-900 hover:bg-neutral-800">
                          삭제
                        </button>
                        <button
                          onClick={() => setSelectedFile(null)}
                          className="text-[9px] text-neutral-400 hover:text-neutral-200 px-2 py-0.5 rounded-full border border-neutral-700 hover:border-neutral-500">
                          ← 그래프 보기
                        </button>
                      </div>
                    </div>

                    {(() => {
                      const backendType =
                        selectedFile.doc_type ||
                        selectedFile.document_type ||
                        selectedFile.data_type ||
                        selectedFile.type ||
                        selectedFile.source_kind ||
                        "";

                      const sourceKind =
                        selectedFile.sourceKind ||
                        selectedFile.source_kind ||
                        "";

                      const isMail =
                        sourceKind === "mail" ||
                        (backendType &&
                          backendType.toUpperCase() === "EMAIL") ||
                        !!selectedFile.sender;

                      if (
                        !isMail &&
                        !selectedFile.sender &&
                        !selectedFile.email_date
                      ) {
                        return null;
                      }

                      return (
                        <div className="mb-3 text-[9px] text-neutral-400 space-y-0.5">
                          {isMail && selectedFile.sender && (
                            <div>
                              <span className="text-neutral-500">
                                보낸 사람:{" "}
                              </span>
                              {selectedFile.sender}
                            </div>
                          )}

                          {isMail && selectedFile.author_email && (
                            <div>
                              <span className="text-neutral-500">
                                받는 사람:{" "}
                              </span>
                              {selectedFile.author_email}
                            </div>
                          )}

                          {isMail && selectedFile.email_date && (
                            <div>
                              <span className="text-neutral-500">
                                메일 날짜:{" "}
                              </span>
                              {selectedFile.email_date}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {selectedFile.sourceKind === "image" &&
                      selectedFile.uploadedUrl && (
                        <img
                          src={selectedFile.uploadedUrl}
                          alt="preview"
                          className="max-w-full h-auto rounded-lg mb-4"
                        />
                      )}

                    <pre className="whitespace-pre-wrap leading-relaxed">
                      {mainContent}
                    </pre>

                    {pathText && (
                      <div className="mt-3 pt-2 border-t border-neutral-800 text-[9px] text-neutral-400 break-all">
                        <span className="text-neutral-500">경로/링크: </span>
                        {pathText}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center relative mt-1">
                  {renderRadar()}
                </div>
              )}
            </div>

            <div className="bg-neutral-950 border border-neutral-800 rounded-2xl px-4 py-3 flex flex-col gap-3">
              {selectedFile ? (
                <div className="bg-neutral-900 rounded-xl px-3 py-2 border border-neutral-800 text-[9px] text-neutral-300">
                  <div className="font-semibold mb-1 text-[12px]">
                    파일 요약
                  </div>

                  <div className="text-neutral-200 text-[10px] mb-2 whitespace-pre-wrap">
                    {summaryText}
                  </div>

                  <div className="mt-2 pt-2 border-t border-neutral-800 text-[10px] text-neutral-400 space-y-0.5">
                    <div>
                      <span className="text-neutral-500">제목: </span>
                      {selectedFile.title}
                    </div>
                    {typeUriText && (
                      <div>
                        <span className="text-neutral-500">타입: </span>
                        {getKoreanLabelFromUri(typeUriText)}
                      </div>
                    )}

                    {pathText && (
                      <div className="truncate">
                        <span className="text-neutral-500">경로/링크: </span>
                        {pathText}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-neutral-900 rounded-xl px-3 py-2 border border-neutral-900 text-[10px] text-neutral-500">
                  왼쪽 사이드바에서 파일 또는 메일을 선택하면 중앙에는{" "}
                  <span className="text-neutral-300">내용</span>이, 이 영역에는{" "}
                  <span className="text-neutral-300">요약/메타 정보</span>가
                  표시됩니다.
                </div>
              )}
            </div>
          </div>
        )}

        {activePage === "memo" && (
          <div className="flex-1 overflow-auto">
            <MemoMainPage />
          </div>
        )}

        {activePage === "cleanliness" && (
          <CleanlinessPage
            files={files}
            grouped={grouped}
            order={order}
            onCleanUp={handleCleanUp}
          />
        )}

        {activePage === "persona" && (
          <PersonaPage
            grouped={grouped}
            order={order}
            profile={profile}
            mode={mode}
            personaRadarData={personaRadarData}
          />
        )}
      </div>
    </div>
  );
}

export default App;
