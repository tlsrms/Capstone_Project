// src/pages/Persona.jsx
import React, { useEffect, useState } from "react";

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
          .slice(0, 120)
          .replace(/\n/g, " ")}...`
      );
    }
  }

  if (!isJson) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `JSON이 아닌 응답을 받았습니다: ${text
        .slice(0, 120)
        .replace(/\n/g, " ")}...`
    );
  }

  return response.json();
};

// 1. 백엔드 응답 → 프론트 데이터 변환

function transformPersonaFromBackend(apiData, personaRadarData) {
  if (!apiData) return null;

  const best = apiData.best_persona || null;
  const top4 = apiData.top_4_personas || [];
  const userKeywords = apiData.user_keywords || [];
  const top5types = apiData.top_5_types || [];

  const nickname = best?.label || "디지털 페르소나 분석 결과 없음";
  const score01 = (best?.score ?? 0) / 100;
  const description =
    best?.description ||
    "현재 사용자 데이터로 충분한 페르소나를 계산하지 못했습니다.";

  const coreKeywords = userKeywords.map((label, index) => {
    const base = 1 - index * 0.1; // 1.0, 0.9, 0.8, ...
    return {
      label,
      weight: Math.max(0.6, base),
    };
  });

  const funComment =
    best && userKeywords.length ? (
      <>
        지금 파일 분포 기준으로{" "}
        <span className="text-teal-300">“{best.label}” </span>페르소나에 가장
        가깝고, {userKeywords[0]} 성향이 특히 강하게 나타나고 있어요.
      </>
    ) : (
      "온톨로지 정보가 아직 부족해서, 추후 파일이 더 쌓이면 결과가 더 정확해집니다."
    );

  //  레이더 차트 데이터
  const idealShape = best?.ideal_shape || [];

  let radarAxes = [];
  let radarIdeal = {};
  let radarUser = {};

  // App에서 넘어온 실제 분포가 있으면 그대로 사용
  if (personaRadarData && personaRadarData.axes?.length) {
    radarAxes = personaRadarData.axes;
    radarUser = personaRadarData.user || {};

    // ideal_shape 값은 같은 순서라고 가정하고 매핑
    if (idealShape.length === radarAxes.length) {
      const maxVal =
        idealShape.reduce(
          (m, item) =>
            Math.max(m, typeof item.value === "number" ? item.value : 0),
          0.0001
        ) || 0.0001;

      idealShape.forEach((item, idx) => {
        const key = radarAxes[idx].key;
        const v = (item.value || 0) / maxVal; // 0~1
        radarIdeal[key] = v;
      });
    } else {
      // 개수가 안 맞으면 일단 사용자 분포만 쓰고 ideal은 비워둠
      radarIdeal = {};
    }
  } else if (idealShape.length > 0) {
    // ideal_shape만으로 축 구성
    const maxVal =
      idealShape.reduce(
        (m, item) =>
          Math.max(m, typeof item.value === "number" ? item.value : 0),
        0.0001
      ) || 0.0001;

    idealShape.forEach((item, idx) => {
      const key = `axis_${idx}`;
      radarAxes.push({
        key,
        label:
          item.label || item.axis?.split("#").slice(-1)[0] || `축 ${idx + 1}`,
      });
      const v = (item.value || 0) / maxVal; // 0~1
      radarIdeal[key] = v;

      // 예전 로직- ideal 기반으로 대충 사용자 값 생성
      const scoreFactor = score01 || 0;
      radarUser[key] = v * (0.6 + 0.4 * scoreFactor);
    });
  } else {
    // ideal_shape도 없다 → mock
    radarAxes = [
      { key: "dev", label: "개발" },
      { key: "study", label: "학업" },
      { key: "office", label: "회사" },
      { key: "life", label: "일반" },
      { key: "hobby", label: "취미" },
    ];
    radarIdeal = { dev: 0.8, study: 0.7, office: 0.2, life: 0.6, hobby: 0.85 };
    radarUser = { dev: 0.7, study: 0.65, office: 0.3, life: 0.5, hobby: 0.75 };
  }

  const radarData = {
    axes: radarAxes,
    user: radarUser,
    ideal: radarIdeal,
  };

  //  관심사 비중 원 그래프 (top_5_types 사용)
  const interestDistribution =
    top5types.length > 0
      ? top5types.map((t) => ({
          label: t.category || t.keyword || "기타",
          value: t.ratio ?? 0,
        }))
      : [{ label: "데이터 부족", value: 100 }];

  //  페르소나 순위 카드 (top_4_personas 사용)
  const personaRanking =
    top4.length > 0
      ? top4.map((p, idx) => ({
          id: p.id,
          label: p.label,
          score: (p.score ?? 0) / 100,
          highlight: idx === 0,
          traits: p.features || [],
        }))
      : [];

  return {
    personaResult: {
      nickname,
      score: score01,
      description,
      funComment,
      coreKeywords,
    },
    radarData,
    interestDistribution,
    personaRanking,
  };
}

export default function PersonaPage({ personaRadarData }) {
  const [personaData, setPersonaData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchPersona = async () => {
      try {
        setLoading(true);
        setError("");
        const res = await fetch(`${API_BASE_URL}/persona/?format=json`, {
          method: "GET",
          headers: getHeaders(),
        });
        const json = await handleResponse(res);
        const transformed = transformPersonaFromBackend(json, personaRadarData);
        setPersonaData(transformed);
      } catch (e) {
        console.error(e);
        setError(e.message || "디지털 페르소나 데이터를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    };

    fetchPersona();
  }, [personaRadarData]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-neutral-900 text-neutral-300 text-sm">
        디지털 페르소나 분석 결과를 불러오는 중입니다...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-neutral-950 text-neutral-300 text-sm">
        <p className="mb-2">
          디지털 페르소나 데이터를 불러오는 중 오류가 발생했어요.
        </p>
        <p className="text-neutral-400 text-xs">{error}</p>
      </div>
    );
  }

  if (!personaData) {
    return (
      <div className="flex-1 flex items-center justify-center bg-neutral-950 text-neutral-300 text-sm">
        표시할 페르소나 데이터가 없습니다.
      </div>
    );
  }

  const { personaResult, radarData, interestDistribution, personaRanking } =
    personaData;
  const topScorePercent = Math.round((personaResult.score || 0) * 100);

  return (
    <div className="flex-1 flex flex-col gap-4 p-4 bg-neutral-900 text-neutral-200">
      <section className="rounded-xl border border-neutral-800 bg-neutral-950 px-5 py-4 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[11px] text-neutral-400 mb-1">
              디지털 페르소나 진단 결과
            </div>

            <h1 className="text-xl md:text-2xl font-semibold text-teal-300">
              {personaResult.nickname}
            </h1>
          </div>
        </div>

        <p className="text-[13px] text-neutral-300 mt-1">
          <span className="text-neutral-100 font-medium">
            이상적인 페르소나 프로필과 {topScorePercent}% 정도 일치
          </span>
          합니다. 파일이 쌓이는 방식과 정리 습관이,{" "}
          <span className="text-neutral-100 font-medium text-teal-300">
            “{personaResult.description}”
          </span>
          에 가까운 편이에요.
          <br />
          {personaResult.funComment}
        </p>
      </section>

      <section className="rounded-xl border border-neutral-800 bg-neutral-900/80 px-5 py-4 flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="lg:w-1/2 rounded-lg border border-neutral-800 bg-neutral-950/60 p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between mb-1">
              <div>
                <div className="text-[11px] text-neutral-400">
                  데이터 분포 확인하기
                </div>
                <div className="text-[11px] text-neutral-500">
                  실제 활동 패턴 vs 이상적인 페르소나 패턴
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 text-[10px]">
                <div className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-neutral-400">사용자의 데이터 분포</span>
                </div>
                <div className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full border border-fuchsia-400" />
                  <span className="text-neutral-400">이상적 데이터 분포</span>
                </div>
              </div>
            </div>

            <div className="h-64 flex items-center justify-center">
              <RadarComparison data={radarData} />
            </div>
          </div>

          <div className="lg:w-1/2 flex flex-col gap-3">
            <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-3 flex flex-col gap-2">
              <div className="text-[11px] text-neutral-400">페르소나란?</div>
              <p className="text-[12px] text-neutral-200">
                이 페르소나는{" "}
                <span className="font-medium text-emerald-300">
                  사용자 파일 분포를 기반으로 계산된 디지털 라이프 패턴
                </span>
                을 보여줘요.
                <br />
                파일 분포를 보고 저희가 분석한 당신의 특징을 설명해드릴게요!
              </p>
            </div>

            <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-neutral-400">
                  사용자 주요 특징 키워드
                </span>
                <span className="text-[10px] text-neutral-500">
                  크게 보일수록 영향력이 큰 특징이에요.
                </span>
              </div>
              <PersonaKeywordCloud keywords={personaResult.coreKeywords} />
            </div>

            <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-neutral-400">
                  관심사 주제별 비중
                </span>
                <span className="text-[10px] text-neutral-500">
                  최근 정리/저장된 파일들의 주제 분포예요.
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-28 h-28 flex items-center justify-center">
                  <InterestPie data={interestDistribution} />
                </div>
                <div className="flex-1 flex flex-col gap-1 text-[11px]">
                  {interestDistribution.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between">
                      <span className="text-neutral-300">{item.label}</span>
                      <span className="text-neutral-400">
                        {item.value.toFixed
                          ? item.value.toFixed(1)
                          : item.value}
                        %
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-2 rounded-lg border border-neutral-800 bg-neutral-950/80 p-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[11px] text-neutral-400">
                다른 페르소나들과 비교하면?
              </div>
              <div className="text-[12px] text-neutral-300">
                현재 파일 분포 기준 상위 4개의 페르소나 유형입니다.
              </div>
            </div>
          </div>
          <PersonaRankingList list={personaRanking} />
        </div>
      </section>
    </div>
  );
}

function RadarComparison({ data }) {
  const size = 220;
  const center = size / 2;
  const radius = 80;
  const axes = data.axes;

  const getPoint = (value, index) => {
    const angle = (2 * Math.PI * index) / axes.length - Math.PI / 2;
    const r = radius * value;
    const x = center + Math.cos(angle) * r;
    const y = center + Math.sin(angle) * r;
    return [x, y];
  };

  const buildPath = (valuesObj) => {
    const points = axes.map((axis, i) => getPoint(valuesObj[axis.key] ?? 0, i));
    return (
      points
        .map(([x, y], idx) => `${idx === 0 ? "M" : "L"} ${x},${y}`)
        .join(" ") + " Z"
    );
  };

  const userPath = buildPath(data.user || {});
  const idealPath = buildPath(data.ideal || {});

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="text-neutral-700">
      {[0.33, 0.66, 1].map((level) => (
        <circle
          key={level}
          cx={center}
          cy={center}
          r={radius * level}
          fill="none"
          stroke="currentColor"
          strokeWidth="0.5"
          className="opacity-40"
        />
      ))}

      {axes.map((axis, i) => {
        const [x, y] = getPoint(1, i);
        return (
          <line
            key={axis.key}
            x1={center}
            y1={center}
            x2={x}
            y2={y}
            stroke="currentColor"
            strokeWidth="0.5"
            className="opacity-40"
          />
        );
      })}

      <path
        d={idealPath}
        fill="none"
        stroke="#f472ff"
        strokeWidth="1.2"
        strokeDasharray="4 3"
        opacity={0.9}
      />

      <path d={userPath} fill="#22c55e22" stroke="#22c55e" strokeWidth="1.2" />

      {axes.map((axis, i) => {
        const [x, y] = getPoint(1.12, i);
        return (
          <text
            key={axis.key}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-neutral-300 text-[9px]">
            {axis.label}
          </text>
        );
      })}
    </svg>
  );
}

function PersonaKeywordCloud({ keywords }) {
  if (!keywords?.length) return null;

  const maxWeight = Math.max(0.5, ...keywords.map((k) => k.weight || 0.5));

  return (
    <div className="relative w-full min-h-[80px]">
      {keywords
        .slice()
        .sort((a, b) => (b.weight || 0) - (a.weight || 0))
        .map((k, idx) => {
          const ratio = (k.weight || 0.5) / maxWeight;
          const isMain = idx === 0;
          const fontSize = isMain
            ? "text-[15px]"
            : ratio > 0.8
            ? "text-[13px]"
            : ratio > 0.6
            ? "text-[11px]"
            : "text-[10px]";
          const opacity = isMain ? "text-neutral-50" : "text-neutral-300";

          const positions = [
            "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
            "top-2 left-2",
            "top-2 right-4",
            "bottom-2 left-4",
            "bottom-2 right-6",
          ];
          const pos = positions[idx] || "top-1/2 left-1/2";

          return (
            <span
              key={k.label}
              className={`absolute ${pos} ${fontSize} ${opacity} whitespace-nowrap`}>
              {k.label}
            </span>
          );
        })}
    </div>
  );
}

function InterestPie({ data }) {
  const total = data.reduce((sum, d) => sum + d.value, 0) || 1;

  const colors = ["#22c55e", "#38bdf8", "#f97316", "#eab308", "#a855f7"];

  let currentAngle = 0;
  const segments = data.map((item, idx) => {
    const angle = (item.value / total) * 360;
    const start = currentAngle;
    const end = currentAngle + angle;
    currentAngle = end;
    return { start, end, color: colors[idx % colors.length] };
  });

  const gradientStr = segments
    .map((seg) => `${seg.color} ${seg.start}deg ${seg.end}deg`)
    .join(", ");

  return (
    <div
      className="rounded-full"
      style={{
        width: "100%",
        height: "100%",
        backgroundImage: `conic-gradient(${gradientStr})`,
      }}
    />
  );
}

function PersonaRankingList({ list }) {
  if (!list?.length) return null;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {list.map((p) => (
        <div
          key={p.id}
          className={`rounded-lg border px-3 py-2.5 flex flex-col gap-1.5 ${
            p.highlight
              ? "border-teal-500/80 bg-teal-500/10"
              : "border-neutral-700 bg-neutral-950/40"
          }`}>
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-neutral-50">
              {p.label}
            </span>
            <span className="text-[11px] text-teal-300">
              {(p.score * 100).toFixed(0)}점
            </span>
          </div>
          {p.traits && (
            <div className="flex flex-wrap gap-1 mt-1">
              {p.traits.map((t) => (
                <span
                  key={t}
                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-800 text-neutral-200">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
