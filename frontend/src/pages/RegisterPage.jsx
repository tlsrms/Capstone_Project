// src/pages/RegisterPage.jsx
import React, { useState } from "react";
import { useGoogleLogin } from "@react-oauth/google"; // 👈 Hook 사용
import { useAuth } from "./AuthContext";
import { useNavigate } from "react-router-dom";

// 🔹 백엔드 사용 여부 플래그
const USE_BACKEND = true;

// 🔹 실제 백엔드 기본 URL
const API_BASE_URL = "https://theosophic-gumlike-jeffery.ngrok-free.dev/api";

function RegisterPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  // ─────────────────────────────
  // [수정] 구글 로그인 (Authorization Code Flow)
  // ─────────────────────────────
  const googleLogin = useGoogleLogin({
    flow: "auth-code", // 👈 핵심: 인증 코드(code) 요청

    // Gmail 권한 등 필요한 스코프 명시
    scope:
      "https://www.googleapis.com/auth/gmail.readonly openid email profile",

    // Refresh Token을 받기 위한 필수 설정
    access_type: "offline",
    prompt: "consent",

    onSuccess: async (codeResponse) => {
      console.log("Google Auth Code:", codeResponse.code);

      if (!USE_BACKEND) {
        // 임시 모드
        const fakeUser = {
          id: 2,
          email: "googleuser@example.com",
          name: "구글 회원가입 유저",
          provider: "google",
        };
        await login("dummy-access", "dummy-refresh", fakeUser);
        alert("💡 [임시] 구글 회원가입 성공");
        navigate("/profile-select");
        return;
      }

      // ✅ 백엔드로 'code' 전송
      try {
        const response = await fetch(`${API_BASE_URL}/auth/google/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "69420", // ngrok 경고 회피
          },
          body: JSON.stringify({ code: codeResponse.code }),
        });

        const data = await response.json();

        if (response.ok) {
          // 로그인/가입 성공 처리
          await login(data.access, data.refresh, data.user);
          alert("구글 계정으로 회원가입 완료! 프로필을 선택해 주세요.");
          navigate("/profile-select");
        } else {
          setError(data.detail || "구글 로그인에 실패했습니다.");
        }
      } catch (error) {
        console.error("Google Login Error:", error);
        setError("서버와 연결할 수 없습니다.");
      }
    },
    onError: (errorResponse) => {
      console.error(errorResponse);
      setError("구글 로그인이 취소되었습니다.");
    },
  });

  // ─────────────────────────────
  // 이메일/비밀번호 회원가입
  // ─────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email || !password || !confirmPassword) {
      setError("모든 필드를 입력해주세요.");
      return;
    }

    if (password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }

    if (password !== confirmPassword) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }

    // 임시 모드
    if (!USE_BACKEND) {
      const fakeUser = {
        id: 3,
        email,
        name: "임시 회원가입 유저",
      };
      await login("dummy-access", "dummy-refresh", fakeUser);
      alert("💡 회원가입 성공 (임시)");
      navigate("/profile-select");
      return;
    }

    // 실제 서버 모드
    try {
      // 1) 회원가입 요청
      const response = await fetch(`${API_BASE_URL}/auth/register/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "69420", // 👈 필수 헤더 추가
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        // 2) 회원가입 성공 후 자동 로그인
        const loginResponse = await fetch(`${API_BASE_URL}/auth/login/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "69420", // 👈 필수 헤더 추가
          },
          body: JSON.stringify({ email, password }),
        });

        const loginData = await loginResponse.json();

        if (loginResponse.ok) {
          await login(loginData.access, loginData.refresh, loginData.user);
          navigate("/profile-select");
        } else {
          setError("회원가입은 성공했지만 자동 로그인에 실패했습니다.");
          navigate("/login");
        }
      } else {
        const errorMsg =
          data.email?.[0] ||
          data.password?.[0] ||
          data.detail ||
          "회원가입에 실패했습니다.";
        setError(errorMsg);
      }
    } catch (error) {
      console.error("Error:", error);
      setError("서버와 연결할 수 없습니다.");
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100vw",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#1a1a1a",
        padding: "1rem",
        margin: 0,
        position: "fixed",
        top: 0,
        left: 0,
      }}>
      <div
        style={{
          backgroundColor: "#2d2d2d",
          padding: "2rem",
          borderRadius: "0.5rem",
          boxShadow: "0 8px 16px rgba(0, 0, 0, 0.4)",
          width: "24rem",
          maxWidth: "90%",
          margin: "0 auto",
        }}>
        <h2
          style={{
            fontSize: "1.5rem",
            fontWeight: "bold",
            textAlign: "center",
            marginBottom: "1.5rem",
            color: "#ffffff",
          }}>
          회원가입
        </h2>

        {error && (
          <div
            style={{
              backgroundColor: "#dc2626",
              color: "white",
              padding: "0.75rem",
              borderRadius: "0.375rem",
              marginBottom: "1rem",
              fontSize: "0.875rem",
            }}>
            {error}
          </div>
        )}

        <div>
          <div style={{ marginBottom: "1rem" }}>
            <label
              style={{
                display: "block",
                color: "#d1d5db",
                marginBottom: "0.5rem",
              }}>
              이메일 (Gmail을 입력해주세요.)
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@gmail.com"
              style={{
                width: "100%",
                padding: "0.5rem 1rem",
                border: "1px solid #404040",
                borderRadius: "0.5rem",
                outline: "none",
                fontSize: "1rem",
                color: "#fafafa",
                backgroundColor: "#262626",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label
              style={{
                display: "block",
                color: "#d1d5db",
                marginBottom: "0.5rem",
              }}>
              비밀번호
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8자 이상 입력"
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  handleSubmit(e);
                }
              }}
              style={{
                width: "100%",
                padding: "0.5rem 1rem",
                border: "1px solid #404040",
                borderRadius: "0.5rem",
                outline: "none",
                fontSize: "1rem",
                color: "#fafafa",
                backgroundColor: "#262626",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: "1.5rem" }}>
            <label
              style={{
                display: "block",
                color: "#d1d5db",
                marginBottom: "0.5rem",
              }}>
              비밀번호 확인
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="비밀번호 재입력"
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  handleSubmit(e);
                }
              }}
              style={{
                width: "100%",
                padding: "0.5rem 1rem",
                border: "1px solid #404040",
                borderRadius: "0.5rem",
                outline: "none",
                fontSize: "1rem",
                color: "#fafafa",
                backgroundColor: "#262626",
                boxSizing: "border-box",
              }}
            />
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            style={{
              width: "100%",
              backgroundColor: "#fff",
              color: "#000",
              padding: "0.5rem",
              borderRadius: "0.5rem",
              border: "none",
              cursor: "pointer",
              fontSize: "1rem",
              fontWeight: "700",
              marginBottom: "1rem",
            }}
            onMouseOver={(e) => (e.target.style.backgroundColor = "#e5e5e5")}
            onMouseOut={(e) => (e.target.style.backgroundColor = "#fff")}>
            회원가입
          </button>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              margin: "1.5rem 0",
              color: "#9ca3af",
            }}>
            <div
              style={{
                flex: 1,
                height: "1px",
                backgroundColor: "#4b5563",
              }}></div>
            <span style={{ padding: "0 1rem", fontSize: "0.875rem" }}>
              또는
            </span>
            <div
              style={{
                flex: 1,
                height: "1px",
                backgroundColor: "#4b5563",
              }}></div>
          </div>

          {/* [수정] 커스텀 구글 로그인 버튼 */}
          <div style={{ marginBottom: "1rem" }}>
            <button
              onClick={() => googleLogin()}
              style={{
                width: "100%",
                backgroundColor: "#404040",
                color: "#fff",
                padding: "0.5rem",
                borderRadius: "0.5rem",
                border: "1px solid #404040",
                cursor: "pointer",
                fontSize: "1rem",
                fontWeight: "500",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
              }}
              onMouseOver={(e) => (e.target.style.backgroundColor = "#1a1a1a")}
              onMouseOut={(e) => (e.target.style.backgroundColor = "#404040")}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 48 48"
                width="20px"
                height="20px">
                <path
                  fill="#FFC107"
                  d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"
                />
                <path
                  fill="#FF3D00"
                  d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"
                />
                <path
                  fill="#4CAF50"
                  d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"
                />
                <path
                  fill="#1976D2"
                  d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"
                />
              </svg>
              Google 계정으로 회원가입
            </button>
          </div>

          <div
            style={{
              textAlign: "center",
              color: "#9ca3af",
              fontSize: "0.875rem",
            }}>
            이미 계정이 있으신가요?{" "}
            <button
              type="button"
              onClick={() => navigate("/login")}
              style={{
                color: "#3b82f6",
                textDecoration: "none",
                fontWeight: "500",
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
              }}
              onMouseOver={(e) => (e.target.style.textDecoration = "underline")}
              onMouseOut={(e) => (e.target.style.textDecoration = "none")}>
              로그인
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RegisterPage;
