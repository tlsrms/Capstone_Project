// src/ProfileSelectPage.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { useNavigate } from "react-router-dom";

// 프로필 옵션 (백엔드 job_template 값과 1:1 매칭)
const PROFILE_OPTIONS = [
  {
    id: "student",
    name: "학생",
    emoji: "🎓",
    description: "공부하고 성장하는 중",
    color: "#3b82f6",
  },
  {
    id: "employee",
    name: "직장인",
    emoji: "💼",
    description: "열심히 일하는 중",
    color: "#8b5cf6",
  },
  {
    id: "developer",
    name: "개발자",
    emoji: "💻",
    description: "코딩하고 있는 중",
    color: "#10b981",
  },
  {
    id: "general",
    name: "일반",
    emoji: "😊",
    description: "그냥 사용하는 중",
    color: "#f59e0b",
  },
];

function ProfileSelectPage() {
  const { user, updateJobTemplate, isLoading } = useAuth();
  const navigate = useNavigate();

  const [selectedProfile, setSelectedProfile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 이미 job_template가 저장돼 있으면 기본 선택
  useEffect(() => {
    if (user?.job_template) {
      setSelectedProfile(user.job_template);
    }
  }, [user]);

  // 카드 클릭 시: 선택 + 백엔드에 저장 + /app 이동
  const handleSelect = async (profileId) => {
    if (isSubmitting || isLoading) return;

    setSelectedProfile(profileId);
    setIsSubmitting(true);

    try {
      await updateJobTemplate(profileId);

      navigate("/app");
    } catch (err) {
      console.error(err);
      alert("직업 템플릿 저장 중 오류가 발생했습니다.");
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100vw",
        backgroundColor: "#141414",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        margin: 0,
        position: "fixed",
        top: 0,
        left: 0,
        color: "#fff",
      }}>
      {/* 로고/제목 */}
      <div
        style={{
          textAlign: "center",
          marginBottom: "3rem",
        }}>
        <h1
          style={{
            fontSize: "3rem",
            fontWeight: "bold",
            color: "#fff",
            marginBottom: "0.5rem",
            letterSpacing: "-0.02em",
          }}>
          환영합니다! 👋
        </h1>
        <p
          style={{
            fontSize: "1.5rem",
            color: "#a0a0a0",
            fontWeight: "400",
          }}>
          어떤 분이신가요?
        </p>
      </div>

      {/* 프로필 카드들 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "2rem",
          maxWidth: "1000px",
          width: "100%",
          marginBottom: "2rem",
        }}>
        {PROFILE_OPTIONS.map((profile) => {
          const isActive = selectedProfile === profile.id;
          return (
            <div
              key={profile.id}
              onClick={() => !isSubmitting && handleSelect(profile.id)}
              style={{
                backgroundColor: isActive ? profile.color : "#2d2d2d",
                border: isActive
                  ? `3px solid ${profile.color}`
                  : "3px solid transparent",
                borderRadius: "0.75rem",
                padding: "2rem 1.5rem",
                cursor: isSubmitting || isLoading ? "not-allowed" : "pointer",
                transition: "all 0.3s ease",
                textAlign: "center",
                position: "relative",
                overflow: "hidden",
                opacity: isSubmitting && !isActive ? 0.5 : 1,
                transform: isActive ? "scale(1.05)" : "scale(1)",
              }}
              onMouseOver={(e) => {
                if (!isSubmitting && !isActive) {
                  e.currentTarget.style.backgroundColor = "#3d3d3d";
                  e.currentTarget.style.transform = "translateY(-8px)";
                  e.currentTarget.style.boxShadow = `0 10px 30px ${profile.color}40`;
                }
              }}
              onMouseOut={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = "#2d2d2d";
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "none";
                }
              }}>
              {/* 이모지 */}
              <div
                style={{
                  fontSize: "4rem",
                  marginBottom: "1rem",
                  filter: isActive
                    ? "drop-shadow(0 0 20px rgba(255,255,255,0.5))"
                    : "none",
                  transition: "all 0.3s ease",
                }}>
                {profile.emoji}
              </div>

              {/* 이름 */}
              <h3
                style={{
                  fontSize: "1.5rem",
                  fontWeight: "bold",
                  color: "#fff",
                  marginBottom: "0.5rem",
                }}>
                {profile.name}
              </h3>

              {/* 설명 */}
              <p
                style={{
                  fontSize: "0.9rem",
                  color: isActive ? "#fff" : "#a0a0a0",
                  fontWeight: isActive ? "500" : "400",
                }}>
                {profile.description}
              </p>

              {/* 선택 표시 */}
              {isActive && (
                <div
                  style={{
                    position: "absolute",
                    top: "1rem",
                    right: "1rem",
                    backgroundColor: "#fff",
                    borderRadius: "50%",
                    width: "2rem",
                    height: "2rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.2rem",
                    animation: "checkmark 0.3s ease",
                    color: "#000",
                  }}>
                  ✓
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 로딩/안내 문구 */}
      {isSubmitting || isLoading ? (
        <div
          style={{
            textAlign: "center",
            marginTop: "2rem",
          }}>
          <div
            style={{
              display: "inline-block",
              width: "2rem",
              height: "2rem",
              border: "3px solid #3b82f6",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}></div>
          <p
            style={{
              color: "#a0a0a0",
              marginTop: "1rem",
              fontSize: "1rem",
            }}>
            설정 중...
          </p>
        </div>
      ) : (
        <p
          style={{
            textAlign: "center",
            color: "#666",
            fontSize: "0.9rem",
            marginTop: "2rem",
          }}>
          💡 나중에 직업을 변경할 수 있어요!
        </p>
      )}

      {/* CSS 애니메이션 */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        @keyframes checkmark {
          0% { 
            transform: scale(0);
            opacity: 0;
          }
          50% { 
            transform: scale(1.2);
          }
          100% { 
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

export default ProfileSelectPage;
