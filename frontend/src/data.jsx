// src/data.js

export const TypeCatalog = {
  "sseukssak:PlanningDocument": { labelKo: "기획 문서" },
  "sseukssak:Schedule": { labelKo: "일정/업무 계획표" },
  "sseukssak:ResearchMaterial": { labelKo: "조사/리서치 자료" },
  "sseukssak:AnalysisResult": { labelKo: "데이터 수집/분석 결과" },
  "sseukssak:Report": { labelKo: "보고서/리포트" },
  "sseukssak:Draft": { labelKo: "초안/원고" },
  "sseukssak:PresentationMaterial": { labelKo: "발표/프레젠테이션 자료" },
  "sseukssak:FinancialDocument": { labelKo: "재무/회계 문서" },
  "sseukssak:LegalDocument": { labelKo: "법률/계약 문서" },
  "sseukssak:HRDocument": { labelKo: "인사/복무 문서" },
  "sseukssak:CommunicationDocument": { labelKo: "보고/소통 문서" },
  "sseukssak:SourceCode": { labelKo: "소스 코드/스크립트" },
  "sseukssak:BuildFile": { labelKo: "배포/빌드 파일" },
  "sseukssak:DebuggingMaterial": { labelKo: "디버깅/테스트 자료" },
  "sseukssak:StudyNote": { labelKo: "학습 자료/필기" },
  "sseukssak:ProblemSolvingMaterial": { labelKo: "문제/평가 자료" },
  "sseukssak:Summary": { labelKo: "요약/정리본" },
  "sseukssak:LogDocument": { labelKo: "일지/기록 문서" },
  "sseukssak:ManagementDocument": { labelKo: "관리/운영 문서" },
  "sseukssak:MarketingMaterial": { labelKo: "마케팅/홍보 자료" },
  "sseukssak:StudentCollaboration": { labelKo: "학생 협업 자료" },
  "sseukssak:ResearchPaper": { labelKo: "연구 저술물" },
  "sseukssak:DeveloperCollaborationLog": { labelKo: "개발자 협업 기록" },

  // 취미/여가
  "sseukssak:MovieDrama": { labelKo: "영화/드라마" },
  "sseukssak:Reading": { labelKo: "독서" },
  "sseukssak:Music": { labelKo: "음악" },
  "sseukssak:Game": { labelKo: "게임" },
  "sseukssak:Exercise": { labelKo: "운동" },
  "sseukssak:Pet": { labelKo: "반려동물" },
  "sseukssak:TravelLog": { labelKo: "여행 기록" },
  "sseukssak:TravelPhoto": { labelKo: "여행 사진" },
  "sseukssak:TravelPlan": { labelKo: "여행 계획" },
  "sseukssak:Blog": { labelKo: "블로그" },
  "sseukssak:Writing": { labelKo: "글쓰기" },
  "sseukssak:Drawing": { labelKo: "드로잉" },
  "sseukssak:Diary": { labelKo: "일기" },
};

export const CategoryMappingByProfile = {
  developer: {
    order: ["기획", "개발", "배포", "디버깅", "협업", "학습"],
    map: {
      기획: [
        "sseukssak:PlanningDocument",
        "sseukssak:Schedule",
        "sseukssak:ResearchMaterial",
        "sseukssak:AnalysisResult",
        "sseukssak:Report",
      ],
      개발: ["sseukssak:SourceCode", "sseukssak:Draft"],
      배포: ["sseukssak:BuildFile", "sseukssak:ManagementDocument"],
      디버깅: ["sseukssak:DebuggingMaterial", "sseukssak:LogDocument"],
      협업: [
        "sseukssak:DeveloperCollaborationLog",
        "sseukssak:CommunicationDocument",
        "sseukssak:PresentationMaterial",
      ],
      학습: [
        "sseukssak:StudyNote",
        "sseukssak:Summary",
        "sseukssak:ProblemSolvingMaterial",
      ],
    },
  },
  student: {
    order: ["학습", "연구", "과제", "협업", "일정"],
    map: {
      학습: [
        "sseukssak:StudyNote",
        "sseukssak:Summary",
        "sseukssak:ProblemSolvingMaterial",
      ],
      연구: [
        "sseukssak:ResearchMaterial",
        "sseukssak:AnalysisResult",
        "sseukssak:ResearchPaper",
        "sseukssak:LogDocument",
      ],
      과제: [
        "sseukssak:Report",
        "sseukssak:PresentationMaterial",
        "sseukssak:Draft",
        "sseukssak:PlanningDocument",
      ],
      협업: [
        "sseukssak:StudentCollaboration",
        "sseukssak:CommunicationDocument",
      ],
      일정: ["sseukssak:Schedule"],
    },
  },
  worker: {
    order: ["계획", "소통", "일정&기록", "조사", "행정"],
    map: {
      계획: [
        "sseukssak:PlanningDocument",
        "sseukssak:Report",
        "sseukssak:Draft",
      ],
      소통: [
        "sseukssak:CommunicationDocument",
        "sseukssak:PresentationMaterial",
      ],
      "일정&기록": ["sseukssak:Schedule", "sseukssak:LogDocument"],
      조사: [
        "sseukssak:ResearchMaterial",
        "sseukssak:AnalysisResult",
        "sseukssak:ResearchPaper",
      ],
      행정: [
        "sseukssak:FinancialDocument",
        "sseukssak:LegalDocument",
        "sseukssak:HRDocument",
        "sseukssak:ManagementDocument",
        "sseukssak:MarketingMaterial",
      ],
    },
  },
  general: {
    order: ["스케줄", "보고서", "자료", "교육", "외부 업무"],
    map: {
      스케줄: ["sseukssak:Schedule"],
      보고서: [
        "sseukssak:PlanningDocument",
        "sseukssak:Report",
        "sseukssak:Draft",
        "sseukssak:PresentationMaterial",
        "sseukssak:CommunicationDocument",
      ],
      자료: [
        "sseukssak:ResearchMaterial",
        "sseukssak:AnalysisResult",
        "sseukssak:LogDocument",
        "sseukssak:ManagementDocument",
      ],
      교육: [
        "sseukssak:StudyNote",
        "sseukssak:ProblemSolvingMaterial",
        "sseukssak:Summary",
        "sseukssak:StudentCollaboration",
        "sseukssak:ResearchPaper",
      ],
      "외부 업무": [
        "sseukssak:FinancialDocument",
        "sseukssak:LegalDocument",
        "sseukssak:HRDocument",
        "sseukssak:MarketingMaterial",
      ],
    },
  },
};

// 취미(일반) 모드 매핑 (본업 = 프로필의 모든 타입)
export const HobbyModeMapping = (profileKey) => ({
  order: ["본업", "여가", "여행", "창작", "기타"],
  map: {
    본업: Object.values(CategoryMappingByProfile[profileKey].map).flat(),
    여가: [
      "sseukssak:MovieDrama",
      "sseukssak:Reading",
      "sseukssak:Music",
      "sseukssak:Game",
      "sseukssak:Exercise",
      "sseukssak:Pet",
    ],
    여행: [
      "sseukssak:TravelLog",
      "sseukssak:TravelPhoto",
      "sseukssak:TravelPlan",
    ],
    창작: [
      "sseukssak:Blog",
      "sseukssak:Writing",
      "sseukssak:Drawing",
      "sseukssak:Diary",
    ],
    기타: [], // 프론트에서 남는 타입 자동 흡수
  },
});

export const mockFiles = [
  {
    id: 1,
    title: "프론트엔드 메인 엔트리 소스코드",
    sourceKind: "문서",
    path: "/files/dev/src/main-entry.js",
    typeUri: "sseukssak:SourceCode",
    tags: ["v1.2", "핵심"],
    createdAt: "2025-11-01",
  },
  {
    id: 2,
    title: "프론트엔드 소스 백업(v1.3)",
    sourceKind: "문서",
    path: "/files/dev/src/archive-v1.3.zip",
    typeUri: "sseukssak:SourceCode",
    tags: ["백업", "정리 필요"],
    createdAt: "2025-10-25",
  },
  {
    id: 3,
    title: "배포 빌드 결과물 번들",
    sourceKind: "문서",
    path: "/files/dev/build/2025-11-배포.tar.gz",
    typeUri: "sseukssak:BuildFile",
    tags: ["배포", "최신"],
    createdAt: "2025-11-15",
  },
  {
    id: 4,
    title: "운영 Runbook v0.9",
    sourceKind: "문서",
    path: "/ops/runbook.md",
    typeUri: "sseukssak:ManagementDocument",
    tags: ["운영", "초안"],
    createdAt: "2025-10-20",
  },
  {
    id: 5,
    title: "로그인/결제 모듈 디버깅 케이스",
    sourceKind: "문서",
    path: "/debug/cases-login-payment.md",
    typeUri: "sseukssak:DebuggingMaterial",
    tags: ["디버깅", "미정리"],
    createdAt: "2025-11-10",
  },
  {
    id: 6,
    title: "장애 대응 일지 (11월 1주차)",
    sourceKind: "문서",
    path: "/debug/logs-2025-11-week1.txt",
    typeUri: "sseukssak:LogDocument",
    tags: ["장애", "회고"],
    createdAt: "2025-11-07",
  },
  {
    id: 7,
    title: "깔끔지수 프로젝트 진행 현황 보고서",
    sourceKind: "문서",
    path: "/docs/report-cleanliness-index.pdf",
    typeUri: "sseukssak:Report",
    tags: ["프로젝트", "중간보고"],
    createdAt: "2025-11-12",
  },
  {
    id: 8,
    title: "네트워크 강의 필기 (인프런)",
    sourceKind: "문서",
    path: "/study/network/notes.pdf",
    typeUri: "sseukssak:StudyNote",
    tags: ["학습", "네트워크"],
    createdAt: "2025-10-28",
  },
  {
    id: 9,
    title: "클린 코드 레퍼런스 아티클",
    sourceKind: "북마크",
    path: "https://example.com/articles/clean-code",
    typeUri: "sseukssak:ResearchMaterial",
    tags: ["북마크", "리팩터링"],
    createdAt: "2025-09-30",
  },
  {
    id: 13,
    title: "깔끔지수 대시보드 전체 기획서",
    sourceKind: "문서",
    path: "/planning/cleanliness-dashboard-spec.md",
    typeUri: "sseukssak:PlanningDocument",
    tags: ["기획", "전체 구조"],
    createdAt: "2025-10-05",
  },
  {
    id: 14,
    title: "시연 발표용 PPT 초안",
    sourceKind: "문서",
    path: "/presentation/demo-day-v1.pptx",
    typeUri: "sseukssak:PresentationMaterial",
    tags: ["발표", "시연용"],
    createdAt: "2025-11-16",
  },
  {
    id: 15,
    title: "주간 스크럼 회의 메모",
    sourceKind: "문서",
    path: "/meeting/weekly-scrum-notes.md",
    typeUri: "sseukssak:CommunicationDocument",
    tags: ["협업", "메모", "미정리"],
    createdAt: "2025-11-13",
  },
  {
    id: 16,
    title: "GitHub PR 리뷰 코멘트 묶음",
    sourceKind: "메일",
    path: "/collab/github-pr-comments-archive.eml",
    typeUri: "sseukssak:DeveloperCollaborationLog",
    tags: ["코드리뷰", "협업"],
    createdAt: "2025-11-09",
  },
  {
    id: 17,
    title: "데이터베이스 강의 필기 (정규화 편)",
    sourceKind: "문서",
    path: "/study/db/normalization-notes.md",
    typeUri: "sseukssak:StudyNote",
    tags: ["학습", "DB"],
    createdAt: "2025-11-03",
  },
  {
    id: 18,
    title: "정보검색 과제 요약 정리본",
    sourceKind: "문서",
    path: "/study/ir/summary-assignment.md",
    typeUri: "sseukssak:Summary",
    tags: ["학습", "요약", "시험 대비"],
    createdAt: "2025-11-14",
  },
  {
    id: 19,
    title: "알고리즘 문제풀이 기록 (정렬/힙)",
    sourceKind: "문서",
    path: "/study/algorithm/ps-log-sorting-heap.md",
    typeUri: "sseukssak:ProblemSolvingMaterial",
    tags: ["코딩테스트", "미정리"],
    createdAt: "2025-10-18",
  },
  {
    id: 20,
    title: "11월 개발/시험 일정표",
    sourceKind: "문서",
    path: "/schedule/2025-11-dev-study.ics",
    typeUri: "sseukssak:Schedule",
    tags: ["일정", "우선순위"],
    createdAt: "2025-10-31",
  },
  {
    id: 21,
    title: "디버깅 실험 결과 요약",
    sourceKind: "문서",
    path: "/debug/experiment-analysis.md",
    typeUri: "sseukssak:AnalysisResult",
    tags: ["디버깅", "분석"],
    createdAt: "2025-11-08",
  },
  {
    id: 22,
    title: "서비스 이용 약관 초안",
    sourceKind: "문서",
    path: "/legal/terms-of-service-draft.md",
    typeUri: "sseukssak:Draft",
    tags: ["법률", "초안", "정리 필요"],
    createdAt: "2025-09-10",
  },

  {
    id: 10,
    title: "러닝 루틴 계획표",
    sourceKind: "문서",
    path: "/life/run-routine.md",
    typeUri: "sseukssak:Exercise",
    tags: ["운동", "루틴"],
    createdAt: "2025-11-02",
  },
  {
    id: 11,
    title: "2025년 11월 후쿠오카 여행 계획",
    sourceKind: "문서",
    path: "/travel/2025-11-fukuoka-plan.md",
    typeUri: "sseukssak:TravelPlan",
    tags: ["여행", "기대"],
    createdAt: "2025-10-27",
  },
  {
    id: 12,
    title: "블로그 글 초안 - 나만의 깔끔지수",
    sourceKind: "문서",
    path: "/blog/draft-cleanliness-index.md",
    typeUri: "sseukssak:Writing",
    tags: ["블로그", "초안", "창작"],
    createdAt: "2025-11-05",
  },
  {
    id: 23,
    title: "후쿠오카 여행 사진 모음",
    sourceKind: "사진",
    path: "/photos/travel/fukuoka-2025/",
    typeUri: "sseukssak:TravelPhoto",
    tags: ["여행", "사진", "정리 필요"],
    createdAt: "2025-11-06",
  },
  {
    id: 24,
    title: "읽고 싶은 개발/에세이 도서 리스트",
    sourceKind: "문서",
    path: "/life/reading-list-dev-essay.md",
    typeUri: "sseukssak:Reading",
    tags: ["독서", "wish-list"],
    createdAt: "2025-10-12",
  },
  {
    id: 25,
    title: "반려동물(고양이) 사진 폴더",
    sourceKind: "사진",
    path: "/photos/pet/cat-collection/",
    typeUri: "sseukssak:Pet",
    tags: ["고양이", "힐링", "정리 필요"],
    createdAt: "2025-09-25",
  },
  {
    id: 26,
    title: "게임 플레이 로그 & 메모",
    sourceKind: "문서",
    path: "/hobby/games/steam-memo.md",
    typeUri: "sseukssak:Game",
    tags: ["게임", "메모"],
    createdAt: "2025-10-08",
  },
  {
    id: 27,
    title: "그림 연습 스케치 모음",
    sourceKind: "사진",
    path: "/art/drawing/sketch-2025/",
    typeUri: "sseukssak:Drawing",
    tags: ["그림", "연습", "정리 필요"],
    createdAt: "2025-11-04",
  },
  {
    id: 28,
    title: "디지털 정리 일기 (깔끔지수 일지)",
    sourceKind: "문서",
    path: "/diary/cleanliness-journal.md",
    typeUri: "sseukssak:Diary",
    tags: ["일기", "습관"],
    createdAt: "2025-11-11",
  },
  {
    id: 29,
    title: "유튜브 영상 아이디어 & 스크립트 초안",
    sourceKind: "문서",
    path: "/content/youtube-script-ideas.md",
    typeUri: "sseukssak:Blog",
    tags: ["콘텐츠", "초안", "창작"],
    createdAt: "2025-10-30",
  },
  {
    id: 30,
    title: "디지털 미니멀리즘 관련 북마크 모음",
    sourceKind: "북마크",
    path: "https://example.com/collections/digital-minimalism",
    typeUri: "sseukssak:Blog",
    tags: ["북마크", "디지털 최소주의"],
    createdAt: "2025-09-20",
  },
];

export const mockFileViewData = {
  1: {
    content:
      "// src/main.jsx\n" +
      "import React from 'react';\n" +
      "import ReactDOM from 'react-dom/client';\n\n" +
      "// 프로젝트 메인 엔트리. 라우터와 전역 스타일을 로드한다.\n" +
      "const root = ReactDOM.createRoot(document.getElementById('root'));\n" +
      "root.render(<App />);\n",
    summary:
      "프론트엔드 프로젝트의 진입점 역할을 하는 소스 코드입니다. " +
      "React 루트를 생성하고 전체 앱을 마운트하는 코드가 들어 있습니다.",
  },
  2: {
    content:
      "프로젝트 소스코드 v1.3 백업\n\n" +
      "- API 모듈 리팩터링 반영\n" +
      "- 에러 로깅 유틸 추가\n" +
      "- 정리되지 않은 legacy 컴포넌트 일부 포함\n",
    summary:
      "프론트엔드 소스코드의 이전 버전 백업입니다. 레거시 코드와 최신 구조를 비교하거나, " +
      "문제가 생겼을 때 롤백할 수 있는 기준점입니다.",
  },
  3: {
    content:
      "build/\n" +
      " ├─ assets/\n" +
      " ├─ index.html\n" +
      " └─ manifest.json\n\n" +
      "프로덕션 서버에 업로드되는 최종 번들 구조를 정리한 문서입니다.",
    summary:
      "프로덕션 배포용 빌드 결과물입니다. 정적 자산과 HTML 엔트리 파일이 포함되며, " +
      "CI/CD 파이프라인의 마지막 단계에서 사용됩니다.",
  },
  4: {
    content:
      "# 운영 Runbook (요약)\n\n" +
      "1. 장애 감지 시 슬랙 #alert 채널 확인\n" +
      "2. 로그 서버에서 서비스별 에러 비율 확인\n" +
      "3. 10분 이내 1차 대응 코멘트 남기기\n" +
      "4. 심각도에 따라 온콜 담당자 호출\n",
    summary:
      "서비스 운영자가 참고하는 운영 매뉴얼입니다. 장애 인지부터 커뮤니케이션, " +
      "후속 조치까지의 기본 플로우가 정리되어 있습니다.",
  },
  5: {
    content:
      "테스트 케이스 목록\n\n" +
      "- 로그인 실패 케이스 10종\n" +
      "- 결제 모듈 예외 케이스 5종\n" +
      "- 네트워크 타임아웃 시나리오 3종\n",
    summary:
      "버그 재현과 회귀 테스트에 사용되는 디버깅용 테스트 케이스 문서입니다. " +
      "중요 기능별로 실패 케이스가 정리되어 있어 재현성이 좋습니다.",
  },
  6: {
    content:
      "[2025-11-01 10:23] 로그인 API 500 발생\n" +
      "[2025-11-01 10:27] DB 커넥션 풀 부족 의심\n" +
      "[2025-11-01 10:45] 커넥션 수 조정 후 정상화\n\n" +
      "→ 원인: 피크 트래픽 대비 커넥션 설정 부족",
    summary:
      "일자별 장애 상황과 조치 내용을 기록한 디버깅 일지입니다. " +
      "원인 분석과 사후 회고에 활용할 수 있는 로그입니다.",
  },
  7: {
    content:
      "깔끔지수 프로젝트 진행 현황 보고서 (요약본)\n\n" +
      "- 1차 마일스톤: UI 레이아웃 설계 완료\n" +
      "- 2차 마일스톤: 백엔드 API 연동 60% 진행\n" +
      "- 3차 마일스톤: 깔끔지수 계산식 확정 예정\n" +
      "- 리스크: 시연 영상 제작 기간 부족 가능성 있음\n",
    summary:
      "깔끔지수 대시보드 프로젝트의 전체 일정과 현재 진행 상황을 정리한 보고 문서입니다. " +
      "남은 작업과 리스크가 한눈에 보이도록 구성되어 있습니다.",
  },
  8: {
    content:
      "네트워크 강의 필기\n\n" +
      "- TCP 3-way handshake\n" +
      "- Congestion control (AIMD, Slow Start)\n" +
      "- HTTP/2 vs HTTP/3 차이\n" +
      "- QUIC 프로토콜 개요\n",
    summary:
      "네트워크 기초 및 전송 계층 관련 내용을 정리한 학습 노트입니다. " +
      "시험 대비와 개념 복습에 활용할 수 있습니다.",
  },
  9: {
    content:
      "https://example.com/articles/clean-code\n\n" +
      "→ 클린 코드 원칙과 리팩터링 팁이 정리된 외부 레퍼런스 링크입니다.\n" +
      "SRP, DRY, 의미 있는 이름 짓기 등 핵심 개념을 다룹니다.",
    summary:
      "개발 생산성 향상을 위한 클린 코드 레퍼런스 북마크입니다. " +
      "리팩터링을 진행할 때 참고용으로 활용할 수 있습니다.",
  },
  10: {
    content:
      "주 3회 러닝 루틴\n\n" +
      "- 월/수/금 저녁 8시\n" +
      "- 5km 조깅 + 스트레칭 10분\n" +
      "- 깔끔지수/프로젝트 아이디어 생각 정리 시간으로 활용\n",
    summary:
      "개인 운동 계획을 정리한 문서입니다. 개발/학업과 별개로 건강 관리 패턴을 파악하는 데 도움이 됩니다.",
  },
  11: {
    content:
      "2025년 11월 후쿠오카 여행 계획\n\n" +
      "- Day 1: 공항 → 호텔 체크인 → 시내 산책\n" +
      "- Day 2: 미술관/카페 투어\n" +
      "- Day 3: 자유 일정 + 카페에서 코딩 타임\n",
    summary:
      "후쿠오카 여행 일정과 방문지를 정리한 계획 문서입니다. " +
      "하비 모드 레이더에서 여행 축의 예시 데이터로 활용됩니다.",
  },
  12: {
    content:
      "블로그 글 초안\n\n" +
      "제목: 나만의 디지털 깔끔지수 만들기\n\n" +
      "1. 파일이 쌓이는 이유\n" +
      "2. 자동 분류 시스템의 필요성\n" +
      "3. 레이더 차트로 시각화하기\n",
    summary:
      "디지털 정리 습관과 깔끔지수 프로젝트를 소개하는 블로그 포스트 초안입니다. " +
      "시연 영상에서 '창작/블로그' 성격을 보여주는 데 사용할 수 있습니다.",
  },
  13: {
    content:
      "# 깔끔지수 대시보드 전체 기획서\n\n" +
      "## 1. 목표\n" +
      "- 개인의 디지털 자산을 자동 분류하고 정리 상태를 수치화\n\n" +
      "## 2. 주요 화면\n" +
      "- 실시간 방사형 그래프\n" +
      "- 깔끔지수 상세 리포트\n" +
      "- 디지털 페르소나 분석\n",
    summary:
      "깔끔지수 프로젝트의 전체 구조와 화면 구성, 핵심 지표를 정의한 기획 문서입니다. " +
      "프로젝트의 방향성과 범위를 한 번에 파악할 수 있습니다.",
  },
  14: {
    content:
      "Demo Day 발표 자료 초안\n\n" +
      "슬라이드 구성\n" +
      "1. 문제 상황: 파일이 쌓여가는 노트북\n" +
      "2. 솔루션: 자동 분류 + 깔끔지수\n" +
      "3. 시연: 실시간 레이더 차트\n" +
      "4. 확장: 디지털 페르소나 분석\n",
    summary:
      "시연 영상과 함께 사용할 발표용 PPT 초안입니다. " +
      "프로젝트 스토리를 단계별로 설명하는 슬라이드 구성이 포함되어 있습니다.",
  },
  15: {
    content:
      "주간 스크럼 회의 메모\n\n" +
      "- 이번 주 목표: 시연 영상용 mock 데이터 확정\n" +
      "- 진행 상황: 라우팅/레이더/메모장 UI 연결 완료\n" +
      "- 논의 사항: 백엔드 연동 시점, 로그인 플로우\n",
    summary:
      "팀원들과 진행 상황을 공유하기 위한 회의 메모입니다. 협업 축의 예시 데이터로 사용됩니다.",
  },
  16: {
    content:
      "GitHub PR 리뷰 코멘트 모음\n\n" +
      "- PR #21: data.js 구조 분리 제안\n" +
      "- PR #22: CleanlinessPage 성능 최적화\n" +
      "- PR #23: 메모장 API 연동 관련 피드백\n",
    summary:
      "GitHub에서 주고받은 코드 리뷰 코멘트를 모아 둔 협업 로그입니다. " +
      "협업/커뮤니케이션 패턴을 보여주는 자료입니다.",
  },
  17: {
    content:
      "데이터베이스 강의 필기 (정규화)\n\n" +
      "- 제1정규형: 반복 속성 제거\n" +
      "- 제2정규형: 부분 함수 종속 제거\n" +
      "- 제3정규형: 이행적 함수 종속 제거\n",
    summary:
      "데이터베이스 정규화 관련 내용을 정리한 학습 노트입니다. " +
      "학습 축에 포함되어 깔끔지수와 연계해 보여줄 수 있습니다.",
  },
  18: {
    content:
      "정보검색 과제 요약\n\n" +
      "- Heaps' Law 실험 결과 정리\n" +
      "- Zipf's Law 시각화 캡쳐\n" +
      "- 보고서에 들어갈 핵심 문장 후보\n",
    summary:
      "정보검색 과제 전체 내용을 짧게 정리해 둔 요약본입니다. " +
      "시험 직전 또는 과제 제출 직전에 빠르게 훑어보기 좋습니다.",
  },
  19: {
    content:
      "알고리즘 문제풀이 로그\n\n" +
      "- Merge Sort 구현 및 시간 측정\n" +
      "- Quick Sort, Heap Sort와의 비교\n" +
      "- Priority Queue 응용 문제 풀이\n",
    summary:
      "정렬과 힙 관련 문제를 풀면서 남긴 풀이 기록입니다. " +
      "코딩 테스트 준비 상태를 파악할 수 있는 자료입니다.",
  },
  20: {
    content:
      "2025년 11월 개발/시험 일정표\n\n" +
      "- 11/18: 데이터베이스 과제 마감\n" +
      "- 11/19: 깔끔지수 시연 영상 촬영\n" +
      "- 11/25: 네트워크 중간고사\n",
    summary:
      "한 달 동안의 개발 일정과 시험 일정을 한눈에 볼 수 있는 스케줄 문서입니다. " +
      "정리되지 않으면 금방 놓치기 쉬운 중요한 일정들이 기록되어 있습니다.",
  },
  21: {
    content:
      "디버깅 실험 결과 요약\n\n" +
      "- 시나리오 1: 네트워크 타임아웃\n" +
      "- 시나리오 2: DB 커넥션 풀 부족\n" +
      "- 시나리오 3: 프론트엔드 예외 처리 누락\n",
    summary:
      "여러 가지 장애 상황을 가정하고 실험한 결과를 정리한 분석 문서입니다. " +
      "디버깅 축의 정량화에 활용할 수 있습니다.",
  },
  22: {
    content:
      "서비스 이용 약관 초안\n\n" +
      "1. 계정 및 보안\n" +
      "2. 서비스 이용 제한\n" +
      "3. 데이터 수집 및 활용\n",
    summary:
      "서비스 런칭을 대비해 작성 중인 이용 약관 초안입니다. " +
      "법률/운영 관점에서 보완이 필요한 상태입니다.",
  },
  23: {
    content:
      "후쿠오카 여행 사진 폴더 구조\n\n" +
      "/photos/travel/fukuoka-2025/\n" +
      " ├─ day1-공항-도시야경\n" +
      " ├─ day2-카페투어\n" +
      " └─ day3-자유시간\n",
    summary:
      "후쿠오카 여행에서 촬영한 사진을 모아둔 폴더입니다. 아직 날짜별, 장소별로 세부 분류가 필요합니다.",
  },
  24: {
    content:
      "읽고 싶은 개발/에세이 도서 리스트\n\n" +
      "- 클린 아키텍처\n" +
      "- 수레바퀴 아래서\n" +
      "- 딥 워크\n",
    summary:
      "향후 읽고 싶은 책들을 모아둔 독서 리스트입니다. 여가/자기계발 패턴을 보여주는 자료입니다.",
  },
  25: {
    content:
      "고양이 사진 폴더\n\n" +
      "- cat-sleeping.png\n" +
      "- cat-keyboard.png\n" +
      "- cat-window.png\n",
    summary:
      "반려동물(고양이) 사진을 모아둔 폴더입니다. 정리 측면에서는 거의 감성용 데이터지만, " +
      "하비 모드에서 여가 축을 시각적으로 풍부하게 만들어 줍니다.",
  },
  26: {
    content:
      "게임 플레이 로그 & 메모\n\n" +
      "- 최근 클리어한 게임 목록\n" +
      "- 플레이하면서 느낀 점, 기록하고 싶은 순간\n",
    summary:
      "최근 즐긴 게임에 대한 간단한 기록입니다. 취미 활동의 패턴을 파악하는 예시 데이터로 사용할 수 있습니다.",
  },
  27: {
    content:
      "그림 연습 스케치 모음\n\n" +
      "- 아이패드 프로크리에이트 스케치\n" +
      "- 연필 드로잉 스캔본\n",
    summary:
      "그림 연습 결과물을 모아둔 스케치 폴더입니다. 창작 활동 축에 포함되는 시각 자료입니다.",
  },
  28: {
    content:
      "디지털 정리 일기 (깔끔지수 일지)\n\n" +
      "- 오늘 정리한 폴더\n" +
      "- 정리하면서 느낀 점\n" +
      "- 내일 정리할 영역 메모\n",
    summary:
      "디지털 정리 습관을 꾸준히 유지하기 위해 작성하는 일기입니다. " +
      "깊이 있는 정리 습관(Deep Clean) 여부를 보여주는 좋은 지표입니다.",
  },
  29: {
    content:
      "유튜브 영상 아이디어 & 스크립트 초안\n\n" +
      "- 깔끔지수 프로젝트 소개 영상\n" +
      "- 디지털 페르소나 타입 테스트 영상\n",
    summary:
      "향후 제작할 유튜브 콘텐츠 아이디어와 간단한 스크립트를 정리한 문서입니다. " +
      "창작/콘텐츠 제작 활동을 나타냅니다.",
  },
  30: {
    content:
      "디지털 미니멀리즘 관련 북마크 모음\n\n" +
      "- 블로그 글, 강연 영상, 도서 링크 등\n" +
      "- '파일을 줄이는 것'이 아니라 '의미 있는 것만 남기는 것'에 대한 관점들\n",
    summary:
      "디지털 미니멀리즘 주제의 링크들을 모아둔 북마크 모음입니다. " +
      "깔끔지수 프로젝트의 철학적 배경으로도 활용 가능한 자료입니다.",
  },
};

export function getMappingFor(mode, profileKey) {
  if (mode === "hobby") return HobbyModeMapping(profileKey);
  return CategoryMappingByProfile[profileKey];
}

export function buildCategoryGrouper({ files, profileKey, mode }) {
  const m = getMappingFor(mode, profileKey);
  const mapping = m.map;
  const order = m.order;

  // 타입 → 카테고리 역인덱스
  const typeToCategory = {};
  Object.entries(mapping).forEach(([cat, typeUris]) => {
    typeUris.forEach((u) => {
      typeToCategory[u] = cat;
    });
  });

  // 취미 모드의 기타: 미매핑 타입 자동 흡수
  if (mode === "hobby") {
    Object.keys(TypeCatalog).forEach((u) => {
      if (!typeToCategory[u]) typeToCategory[u] = "기타";
    });
  }

  // 그룹 생성
  const grouped = {};
  order.forEach((k) => (grouped[k] = []));
  files.forEach((f) => {
    const cat = typeToCategory[f.typeUri] || "기타";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(f);
  });

  return { grouped, order };
}

export function getAxisStatsFromGrouped(grouped, catKey) {
  const list = grouped[catKey] || [];
  const byKind = list.reduce(
    (acc, f) => {
      acc[f.sourceKind] = (acc[f.sourceKind] || 0) + 1;
      return acc;
    },
    { 문서: 0, 메일: 0, 북마크: 0, 사진: 0 }
  );

  return {
    key: catKey,
    totalCount: list.length,
    docs: byKind["문서"] || 0,
    mails: byKind["메일"] || 0,
    bookmarks: byKind["북마크"] || 0,
    photos: byKind["사진"] || 0,
  };
}
