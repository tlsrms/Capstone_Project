// src/pages/Cleanliness.jsx
import React, { useEffect, useState } from "react";

const ChevronDown = (p) => (
  <svg
    {...p}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2">
    <path d="m6 9 6 6 6-6" />
  </svg>
);
const FileTextIcon = (p) => (
  <svg
    {...p}
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2">
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <path d="M10 9h5" />
    <path d="M10 13h5" />
    <path d="M10 17h3" />
  </svg>
);

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

// 백엔드 응답 → 프론트 데이터 변환

function transformNeatnessFromBackend(apiData) {
  if (!apiData) return null;

  const score = apiData.score ?? 0;
  const previous = apiData.previous_score ?? 0;
  const improvement =
    typeof apiData.improvement === "number"
      ? apiData.improvement
      : score - previous;

  const raw = apiData.raw_ratios || {};
  const details = apiData.details || {};
  const totalFiles = details.total_files ?? 0;

  const ratios = {
    title: raw.R_title ?? 0,
    frag: raw.R_frag ?? 0,
    shallow: raw.R_shallow ?? 0,
    deep: raw.R_deep ?? 0,
  };

  const keys = ["title", "frag", "shallow", "deep"];
  const maxPenaltyKey =
    keys.reduce(
      (best, k) => ((ratios[k] || 0) > (ratios[best] || 0) ? k : best),
      "title"
    ) || "title";

  const meaningless = details.meaningless || { count: 0, files: [] };
  const fragmented = details.fragmented || { count: 0, files: [] };
  const shallow = details.shallow || { count: 0, files: [] };
  const deep = details.deep || { count: 0, files: [] };

  const convertFiles = (files = []) =>
    files.map((f) => ({
      title: f.title || "(제목 없음)",
      path: f.file_path || f.path || "",
    }));

  const stats = {
    title: {
      R: (ratios.title || 0) / 100,
      count: meaningless.count ?? 0,
      files: convertFiles(meaningless.files),
    },
    frag: {
      R: (ratios.frag || 0) / 100,
      count: fragmented.count ?? 0,
      files: convertFiles(fragmented.files),
    },
    shallow: {
      R: (ratios.shallow || 0) / 100,
      count: shallow.count ?? 0,
      files: convertFiles(shallow.files),
    },
    deep: {
      R: (ratios.deep || 0) / 100,
      count: deep.count ?? 0,
      files: convertFiles(deep.files),
    },
  };

  const penaltyRatios = {
    title: ratios.title || 0,
    frag: ratios.frag || 0,
    shallow: ratios.shallow || 0,
    deep: ratios.deep || 0,
  };

  return {
    CI: score,
    previousScore: previous,
    improvement,
    totalFiles,
    maxPenaltyKey,
    penaltyRatios,
    stats,
  };
}

//가중치 계산 헬퍼

function computeWeightsFromRatios(r = {}) {
  const t = r.title ?? 0;
  const f = r.frag ?? 0;
  const s = r.shallow ?? 0;
  const d = r.deep ?? 0;
  const sum = t + f + s + d;

  if (!sum || sum <= 0) {
    return {
      title: 25,
      frag: 25,
      shallow: 25,
      deep: 25,
    };
  }

  const baseTitle = Math.round((t / sum) * 100);
  const baseFrag = Math.round((f / sum) * 100);
  const baseShallow = Math.round((s / sum) * 100);
  const baseDeep = 100 - (baseTitle + baseFrag + baseShallow);

  return {
    title: baseTitle,
    frag: baseFrag,
    shallow: baseShallow,
    deep: baseDeep,
  };
}

// 현재 가중치 기준으로 조정된 깔끔지수 계산
function computeAdjustedCI(neatness, weights) {
  if (!neatness || !weights) return neatness?.CI ?? 0;

  const ratios = neatness.penaltyRatios || {};
  const wTitle = weights.title ?? 0;
  const wFrag = weights.frag ?? 0;
  const wShallow = weights.shallow ?? 0;
  const wDeep = weights.deep ?? 0;
  const sumW = wTitle + wFrag + wShallow + wDeep;

  if (sumW <= 0) return neatness.CI;

  // 가중치 정규화
  const normW = {
    title: wTitle / sumW,
    frag: wFrag / sumW,
    shallow: wShallow / sumW,
    deep: wDeep / sumW,
  };

  // 비율 정규화
  const ratiosNorm = {
    title: (ratios.title || 0) / 100,
    frag: (ratios.frag || 0) / 100,
    shallow: (ratios.shallow || 0) / 100,
    deep: (ratios.deep || 0) / 100,
  };

  // 현재 가중치일 때의 페널티
  const penalty =
    normW.title * ratiosNorm.title +
    normW.frag * ratiosNorm.frag +
    normW.shallow * ratiosNorm.shallow +
    normW.deep * ratiosNorm.deep;

  const baseWeights = computeWeightsFromRatios(ratios);
  const baseSumW =
    baseWeights.title +
    baseWeights.frag +
    baseWeights.shallow +
    baseWeights.deep;
  let alpha = 0;

  if (baseSumW > 0) {
    const baseNormW = {
      title: baseWeights.title / baseSumW,
      frag: baseWeights.frag / baseSumW,
      shallow: baseWeights.shallow / baseSumW,
      deep: baseWeights.deep / baseSumW,
    };
    const basePenalty =
      baseNormW.title * ratiosNorm.title +
      baseNormW.frag * ratiosNorm.frag +
      baseNormW.shallow * ratiosNorm.shallow +
      baseNormW.deep * ratiosNorm.deep;

    if (basePenalty > 0) {
      alpha = (100 - neatness.CI) / basePenalty;
    }
  }

  // α가 0이면 그냥 원래 CI 유지
  if (!alpha) return neatness.CI;

  const rawCI = 100 - alpha * penalty;
  return Math.max(0, Math.min(100, rawCI));
}

// 도넛 차트
function Donut({ value = 0, size = 250, stroke = 20 }) {
  const v = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (v / 100) * c;
  const cx = size / 2;
  const cy = size / 2;

  return (
    <div className="relative flex items-center justify-center">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        className="block">
        <g transform={`rotate(-90 ${cx} ${cy})`}>
          <circle
            cx={cx}
            cy={cy}
            r={r}
            className="stroke-neutral-800"
            strokeWidth={stroke}
            fill="none"
          />
          <circle
            cx={cx}
            cy={cy}
            r={r}
            className="stroke-sky-400 transition-all duration-700"
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={c}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </g>
        <g transform={`translate(${cx}, ${cy})`}>
          <text
            x="0"
            y="-20"
            textAnchor="middle"
            className="fill-neutral-300 font-semibold text-[24px]">
            깔끔 지수
          </text>
          <text
            x="0"
            y="40"
            textAnchor="middle"
            className="fill-neutral-100 font-extrabold text-[55px]">
            {v.toFixed(0)}
          </text>
        </g>
      </svg>
    </div>
  );
}

//가중치 조절

function WeightAdjustCard({ penaltyRatios, weights, setWeights }) {
  const handleChange = (key, value) => {
    const num = Number(value);
    const safe = Number.isNaN(num) ? 0 : Math.max(0, Math.min(100, num));
    setWeights((prev) => ({ ...prev, [key]: safe }));
  };

  //  균등 분배
  const applyEqualWeights = () => {
    setWeights({
      title: 25,
      frag: 25,
      shallow: 25,
      deep: 25,
    });
  };

  // 특정 항목 강조
  const applyFocusPreset = (focusKey) => {
    setWeights((prev) => {
      const base = penaltyRatios
        ? computeWeightsFromRatios(penaltyRatios)
        : prev;

      const keys = ["title", "frag", "shallow", "deep"];
      const others = keys.filter((k) => k !== focusKey);

      const scaled = {};
      let otherSum = 0;
      others.forEach((k) => {
        const v = Math.round((base[k] ?? 25) * 0.6);
        scaled[k] = v;
        otherSum += v;
      });

      let focusWeight = 100 - otherSum;
      if (focusWeight < 0) {
        focusWeight = Math.max(25, base[focusKey] ?? 25);
      }

      return {
        ...scaled,
        [focusKey]: focusWeight,
      };
    });
  };

  const w = weights || { title: 25, frag: 25, shallow: 25, deep: 25 };

  const total =
    (w.title || 0) + (w.frag || 0) + (w.shallow || 0) + (w.deep || 0);

  const isValid = total === 100;

  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="text-[20px] font-semibold text-neutral-100">
          깔끔지수 가중치 조절
        </div>

        <div className="flex flex-col items-end gap-2 text-right">
          <div className="text-[11px] text-neutral-500">
            네 가지 항목 가중치 합이 100이 되도록 조정해 주세요.
          </div>
          <div className="flex flex-wrap justify-end gap-1">
            <button
              type="button"
              onClick={applyEqualWeights}
              className="px-2 py-0.5 rounded-full border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-[11px] text-neutral-100">
              균등 가중치
            </button>
            <button
              type="button"
              onClick={() => applyFocusPreset("title")}
              className="px-2 py-0.5 rounded-full border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-[11px] text-neutral-100">
              무의미한 제목↑
            </button>
            <button
              type="button"
              onClick={() => applyFocusPreset("frag")}
              className="px-2 py-0.5 rounded-full border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-[11px] text-neutral-100">
              파편화↑
            </button>
            <button
              type="button"
              onClick={() => applyFocusPreset("shallow")}
              className="px-2 py-0.5 rounded-full border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-[11px] text-neutral-100">
              얕은 깊이↑
            </button>
            <button
              type="button"
              onClick={() => applyFocusPreset("deep")}
              className="px-2 py-0.5 rounded-full border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-[11px] text-neutral-100">
              깊은 깊이↑
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <WeightInputRow
          label="무의미한 제목"
          description="Untitled / 새 문서 등 의미 없는 제목 비율"
          value={w.title}
          onChange={(v) => handleChange("title", v)}
        />
        <WeightInputRow
          label="파편화된 파일"
          description="같은 제목이 여러 폴더에 흩어진 비율"
          value={w.frag}
          onChange={(v) => handleChange("frag", v)}
        />
        <WeightInputRow
          label="얕은 깊이"
          description="루트/바탕화면 등 depth ≤ 1 비율"
          value={w.shallow}
          onChange={(v) => handleChange("shallow", v)}
        />
        <WeightInputRow
          label="깊은 깊이"
          description="폴더 depth ≥ 5 비율"
          value={w.deep}
          onChange={(v) => handleChange("deep", v)}
        />
      </div>

      <div className="flex items-center justify-between text-[12px] mt-2">
        <div>
          <span className="text-neutral-400">현재 합계:&nbsp;</span>
          <span>{total} / 100</span>
        </div>
        {!isValid && (
          <div className="text-rose-400">
            합계가 100이 되도록 슬라이더나 입력값을 조정해 주세요.
          </div>
        )}
      </div>
    </div>
  );
}

function WeightInputRow({ label, description, value, onChange }) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[13px] text-neutral-100 font-semibold">
          {label}
        </div>
        <div className="text-[11px] text-neutral-300 font-medium">{value}%</div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full flex-1"
        />
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={0}
            max={100}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-14 bg-neutral-950 border border-neutral-700 rounded px-1 py-0.5 text-[11px] text-right text-neutral-100"
          />
          <span className="text-[11px] text-neutral-400">%</span>
        </div>
      </div>

      <p className="text-[11px] text-neutral-500 mt-1">{description}</p>
    </div>
  );
}

function MetricDetails({ CIStats }) {
  const [openIndex, setOpenIndex] = useState(null);
  const toggle = (i) => setOpenIndex((p) => (p === i ? null : i));

  const data = [
    {
      key: "title",
      label: "무의미한 제목 비율",
      ratio: CIStats.penaltyRatios.title,
      color: "bg-rose-500",
      count: CIStats.stats.title.count,
      files: CIStats.stats.title.files,
      desc: "Untitled / 새 문서 / Copy of … 등 의미 없는 제목의 비율입니다.",
    },
    {
      key: "frag",
      label: "파편화된 파일 비율",
      ratio: CIStats.penaltyRatios.frag,
      color: "bg-sky-500",
      count: CIStats.stats.frag.count,
      files: CIStats.stats.frag.files,
      desc: "같은 제목이 여러 폴더에 흩어져 있는 비율입니다.",
    },
    {
      key: "shallow",
      label: "얕은 깊이 비율",
      ratio: CIStats.penaltyRatios.shallow,
      color: "bg-sky-600",
      count: CIStats.stats.shallow.count,
      files: CIStats.stats.shallow.files,
      desc: "루트/바탕화면 등 depth ≤ 1에 있는 파일 비율입니다.",
    },
    {
      key: "deep",
      label: "깊은 깊이 비율",
      ratio: CIStats.penaltyRatios.deep,
      color: "bg-indigo-500",
      count: CIStats.stats.deep.count,
      files: CIStats.stats.deep.files,
      desc: "폴더 depth ≥ 5 파일의 비율입니다.",
    },
  ].sort((a, b) => b.ratio - a.ratio);

  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 h-full">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">감점 요소 확인</div>
      </div>

      <div className="space-y-3">
        {data.map((m, i) => (
          <div
            key={m.key}
            className="rounded-xl bg-neutral-900 border border-neutral-800">
            <button
              onClick={() => toggle(i)}
              className="w-full p-3 flex items-center justify-between text-left hover:bg-neutral-800/60 rounded-xl transition">
              <div className="flex-1 pr-3">
                <div className="flex items-center justify-between text-[12px] mb-1">
                  <span className="text-neutral-200 font-semibold">
                    {m.label}{" "}
                    <span className="text-neutral-500">({m.count}개)</span>
                  </span>
                  <span className="font-bold text-neutral-100">
                    {m.ratio.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-neutral-800 rounded-full h-2">
                  <div
                    className={`${m.color} h-2 rounded-full`}
                    style={{ width: `${m.ratio}%` }}
                  />
                </div>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-neutral-500 transition-transform ${
                  openIndex === i ? "rotate-180" : ""
                }`}
              />
            </button>

            {openIndex === i && (
              <div className="px-3 pb-3 text-[12px] text-neutral-400">
                <p className="mb-2">{m.desc}</p>
                {m.files && m.files.length > 0 && (
                  <>
                    <p className="text-[11px] text-neutral-300 mb-1">
                      감점된 파일 예시
                    </p>
                    <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-2 max-h-32 overflow-auto space-y-1">
                      {m.files.map((f, idx) => (
                        <div
                          key={idx}
                          className="truncate text-neutral-300 flex items-center">
                          <FileTextIcon className="w-3 h-3 mr-1" />
                          {f.title}{" "}
                          <span className="text-neutral-500">
                            &nbsp;· {f.path}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CoachingHeader({ CI, maxPenaltyKey }) {
  const penaltyMap = {
    title: "무의미한 제목",
    frag: "파편화된 파일",
    shallow: "얕은 깊이",
    deep: "깊은 깊이",
  };
  const topName = penaltyMap[maxPenaltyKey] || "정리 항목";

  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 flex items-center gap-3">
      <div className="flex-1">
        <div className="text-[18px] text-neutral-100 font-semibold">
          깔끔지수란?
        </div>

        <div className="text-[12px] text-neutral-400 mt-1 space-y-0.5">
          <p>
            <span className="font-medium text-neutral-200">깔끔지수</span>는
            무의미한 제목 비율, 파편화된 파일 비율, 폴더 깊이가 너무 얕거나 깊은
            비율을 고려해서 0~100점으로 환산한 점수예요. 점수가 높을수록 폴더
            구조·파일이 잘 정리되어 있다는 뜻입니다.
          </p>
          <p>
            지금은 특히{" "}
            <span className="font-medium text-neutral-200">{topName}</span>
            이(가) 감점에 가장 크게 영향을 주고 있어요.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function CleanlinessPage() {
  const [neatness, setNeatness] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // 가중치 상태 (슬라이더 값)
  const [weights, setWeights] = useState(null);

  useEffect(() => {
    const fetchNeatness = async () => {
      try {
        setLoading(true);
        setError("");
        const res = await fetch(`${API_BASE_URL}/neatness-score/?format=json`, {
          method: "GET",
          headers: getHeaders(),
        });
        const json = await handleResponse(res);
        const transformed = transformNeatnessFromBackend(json);
        setNeatness(transformed);

        // 백엔드 비율 기반 기본 가중치 세팅
        if (transformed?.penaltyRatios) {
          setWeights(computeWeightsFromRatios(transformed.penaltyRatios));
        } else {
          setWeights({ title: 25, frag: 25, shallow: 25, deep: 25 });
        }
      } catch (e) {
        console.error(e);
        setError(e.message || "깔끔지수 데이터를 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    };

    fetchNeatness();
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-neutral-900 text-neutral-300 text-sm">
        깔끔지수를 계산하는 중입니다...
      </div>
    );
  }

  if (error || !neatness) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-neutral-900 text-neutral-300 text-sm">
        <p className="mb-2">깔끔지수 데이터를 불러오는 중 오류가 발생했어요.</p>
        {error && (
          <p className="text-neutral-400 text-xs whitespace-pre-line">
            {error}
          </p>
        )}
      </div>
    );
  }

  // 현재 가중치 기준으로 재계산
  const adjustedCI = computeAdjustedCI(neatness, weights);

  return (
    <div className="flex-1 bg-neutral-900 text-neutral-200 p-4">
      <div className="w-full space-y-4 md:space-y-6">
        <CoachingHeader
          CI={neatness.CI}
          maxPenaltyKey={neatness.maxPenaltyKey}
        />

        <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col items-center justify-center">
              <Donut value={adjustedCI} />
            </div>

            <MetricDetails CIStats={neatness} />
          </div>
        </div>

        <WeightAdjustCard
          penaltyRatios={neatness.penaltyRatios}
          weights={weights}
          setWeights={setWeights}
        />
      </div>
    </div>
  );
}
