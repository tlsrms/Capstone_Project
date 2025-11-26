// src/AuthContext.jsx
import React, { createContext, useState, useContext, useEffect } from "react";

const AuthContext = createContext(null);

// ✅ 실제 백엔드 기본 URL
const API_BASE_URL = "https://theosophic-gumlike-jeffery.ngrok-free.dev/api";

// Authorization 헤더 생성
const getAuthHeaders = () => {
  const token = localStorage.getItem("access_token");
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "ngrok-skip-browser-warning": "69420",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null); // { id, email, job_template, ... }
  const [isLoading, setIsLoading] = useState(true);

  const setTokens = (access, refresh) => {
    if (access) localStorage.setItem("access_token", access);
    if (refresh) localStorage.setItem("refresh_token", refresh);
  };

  // 현재 사용자 정보 조회: GET /api/auth/me/
  // 현재 사용자 정보 조회: GET /api/auth/me/
  const fetchUserInfo = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/me/?format=json`, {
        method: "GET",
        headers: getAuthHeaders(),
      });

      const contentType = res.headers.get("content-type") || "";
      const isJson = contentType.includes("application/json");

      if (!res.ok) {
        // 401이면 토큰 정리
        if (res.status === 401) {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
        }

        // 디버깅용으로 응답 앞부분 찍기
        if (isJson) {
          const errData = await res.json().catch(() => null);
          console.error(
            "현재 사용자 정보 조회 실패(상태):",
            res.status,
            errData
          );
        } else {
          const text = await res.text().catch(() => "");
          console.error(
            "현재 사용자 정보 조회 실패(HTML):",
            res.status,
            text.slice(0, 100).replace(/\n/g, " ")
          );
        }
        throw new Error("사용자 정보를 불러오지 못했습니다.");
      }

      // 성공인데 JSON이 아님 → 여기도 방어
      if (!isJson) {
        const text = await res.text().catch(() => "");
        console.error(
          "현재 사용자 정보 조회 응답이 JSON이 아님:",
          text.slice(0, 100).replace(/\n/g, " ")
        );
        throw new Error("서버에서 JSON이 아닌 응답을 받았습니다.");
      }

      const data = await res.json();
      // data 예시: { id, email, date_joined, is_active, job_template: "student" }
      setUser(data);
    } catch (err) {
      console.error("현재 사용자 정보 조회 실패:", err);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  // 앱 처음 로드 시 토큰이 있으면 me 호출
  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setIsLoading(false);
      return;
    }
    fetchUserInfo();
  }, []);

  // 🔹 login: 2가지 모드 지원
  // 1) login({ email, password })  → 내부에서 /auth/login/ 호출
  // 2) login(access, refresh, user) → 토큰/유저를 이미 받은 경우 (RegisterPage, LoginPage에서 사용)
  const login = async (arg1, arg2, arg3) => {
    // 모드 1: { email, password }
    if (
      typeof arg1 === "object" &&
      arg1 !== null &&
      "email" in arg1 &&
      "password" in arg1
    ) {
      const { email, password } = arg1;

      const res = await fetch(`${API_BASE_URL}/auth/login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        throw new Error("로그인에 실패했습니다.");
      }

      const data = await res.json(); // { access, refresh, ... }
      setTokens(data.access, data.refresh);
      await fetchUserInfo();
      return;
    }

    // 모드 2: (access, refresh, user)
    const access = arg1;
    const refresh = arg2;
    const userData = arg3;

    setTokens(access, refresh);

    if (userData) {
      setUser(userData);
      setIsLoading(false);
    } else {
      await fetchUserInfo();
    }
  };

  const logout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    setUser(null);
  };

  // 🔹 직업 템플릿 변경: PATCH /api/auth/me/
  const updateJobTemplate = async (job_template) => {
    const res = await fetch(`${API_BASE_URL}/auth/me/`, {
      method: "PATCH",
      headers: getAuthHeaders(),
      body: JSON.stringify({ job_template }),
    });

    if (!res.ok) {
      throw new Error("직업 템플릿 변경에 실패했습니다.");
    }

    const data = await res.json();
    // 응답: { id, email, ..., job_template: "developer" }
    setUser(data);
    return data;
  };

  const value = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    fetchUserInfo,
    updateJobTemplate,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
