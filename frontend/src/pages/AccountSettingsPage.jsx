// src/pages/AccountSettingsPage.jsx
import React, { useEffect } from "react";
import { useAuth } from "./AuthContext";
import { useNavigate } from "react-router-dom";

function AccountSettingsPage() {
  const { user, isLoading, fetchUserInfo, logout } = useAuth();
  const navigate = useNavigate();

  // user 정보가 없으면 한 번 더 me 호출해서 최신 정보 가져오기
  useEffect(() => {
    if (!user) {
      fetchUserInfo().catch((err) =>
        console.error("사용자 정보 갱신 실패:", err)
      );
    }
  }, [user, fetchUserInfo]);

  const handleLogout = () => {
    logout(); // 토큰 + 유저 상태 정리 (AuthContext에서 처리)
    navigate("/"); // 로그인 페이지로 이동
  };

  const handleChangeJob = () => {
    navigate("/profile-select"); // 직업 선택 페이지로 이동
  };

  const formatDate = (iso) => {
    if (!iso) return "-";
    try {
      return new Date(iso).toLocaleString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const jobLabelMap = {
    student: "학생",
    employee: "직장인",
    developer: "개발자",
    general: "일반",
  };

  const jobLabel = user?.job_template
    ? jobLabelMap[user.job_template] || user.job_template
    : "미설정";

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100vw",
        backgroundColor: "#141414",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        margin: 0,
        position: "fixed",
        top: 0,
        left: 0,
      }}>
      <div
        style={{
          width: "100%",
          maxWidth: "540px",
          backgroundColor: "#1f1f1f",
          borderRadius: "1rem",
          padding: "2rem",
          boxShadow: "0 18px 40px rgba(0,0,0,0.6)",
          border: "1px solid #3f3f46",
          color: "#f4f4f5",
        }}>
        {/* 헤더 */}
        <div
          style={{
            marginBottom: "1.5rem",
          }}>
          {/* 첫 줄: 제목 + 돌아가기 버튼을 한 줄에 */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.4rem",
            }}>
            <h1
              style={{
                fontSize: "1.5rem",
                fontWeight: "bold",
              }}>
              계정 관리
            </h1>

            <button
              type="button"
              onClick={() => navigate("/app/memos")}
              style={{
                fontSize: "0.75rem",
                padding: "0.35rem 0.9rem",
                borderRadius: "999px",
                border: "1px solid #4b5563",
                backgroundColor: "#18181b", // 🔹 남색 대신 진한 회색/검정톤
                color: "#e5e7eb",
                cursor: "pointer",
              }}>
              ← 돌아가기
            </button>
          </div>

          {/* 둘째 줄: 설명 문구 */}
          <p
            style={{
              fontSize: "0.85rem",
              color: "#9ca3af",
            }}>
            현재 로그인된 계정 정보를 확인하고, 직업 프로필과 로그아웃을 관리할
            수 있어요.
          </p>
        </div>

        {/* 로딩 상태 */}
        {isLoading && !user && (
          <div
            style={{
              padding: "2rem 0",
              textAlign: "center",
              color: "#9ca3af",
              fontSize: "0.9rem",
            }}>
            <div
              style={{
                display: "inline-block",
                width: "2rem",
                height: "2rem",
                borderRadius: "999px",
                border: "3px solid #4b5563",
                borderTopColor: "#6366f1",
                animation: "spin 1s linear infinite",
                marginBottom: "0.75rem",
              }}
            />
            <div>계정 정보를 불러오는 중입니다...</div>

            <style>{`
              @keyframes spin {
                to { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        )}

        {/* 실제 정보 영역 */}
        {user && (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {/* 기본 정보 카드 */}
            <section
              style={{
                padding: "1.25rem 1rem",
                borderRadius: "0.75rem",
                backgroundColor: "#18181b",
                border: "1px solid #27272f",
              }}>
              <h2
                style={{
                  fontSize: "0.95rem",
                  fontWeight: 600,
                  marginBottom: "0.75rem",
                }}>
                기본 정보
              </h2>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "110px 1fr",
                  rowGap: "0.4rem",
                  columnGap: "0.75rem",
                  fontSize: "0.85rem",
                }}>
                <div style={{ color: "#9ca3af" }}>이메일</div>
                <div style={{ wordBreak: "break-all" }}>{user.email}</div>

                <div style={{ color: "#9ca3af" }}>가입일</div>
                <div>{formatDate(user.date_joined)}</div>

                <div style={{ color: "#9ca3af" }}>상태</div>
                <div>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      fontSize: "0.8rem",
                      padding: "0.15rem 0.6rem",
                      borderRadius: "999px",
                      backgroundColor: user.is_active ? "#022c22" : "#3f3f46",
                      color: user.is_active ? "#6ee7b7" : "#e5e7eb",
                    }}>
                    <span
                      style={{
                        width: "0.4rem",
                        height: "0.4rem",
                        borderRadius: "999px",
                        backgroundColor: user.is_active ? "#6ee7b7" : "#9ca3af",
                      }}
                    />
                    {user.is_active ? "활성" : "비활성"}
                  </span>
                </div>
              </div>
            </section>

            {/* 직업/프로필 섹션 */}
            <section
              style={{
                padding: "1.25rem 1rem",
                borderRadius: "0.75rem",
                backgroundColor: "#18181b",
                border: "1px solid #27272f",
              }}>
              <h2
                style={{
                  fontSize: "1rem",
                  fontWeight: 700,
                }}>
                직업 프로필
              </h2>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "0.75rem",
                  marginBottom: "0.75rem",
                }}>
                <div>
                  <div
                    style={{
                      fontSize: "0.9rem",
                      fontWeight: 600,
                    }}>
                    {jobLabel}
                    {user.job_template && (
                      <span
                        style={{
                          fontSize: "0.75rem",
                          color: "#9ca3af",
                          marginLeft: "0.4rem",
                        }}>
                        ({user.job_template})
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleChangeJob}
                  style={{
                    padding: "0.45rem 0.9rem",
                    borderRadius: "999px",
                    border: "1px solid #4b5563",
                    backgroundColor: "#18181b",
                    color: "#e5e7eb",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}>
                  직업 다시 선택하기
                </button>
              </div>
            </section>
          </div>
        )}

        {/* 하단 로그아웃 / 새로고침 버튼들 */}
        <div
          style={{
            marginTop: "1.75rem",
            display: "flex",
            justifyContent: "space-between",
            gap: "0.75rem",
            fontSize: "0.8rem",
          }}>
          <button
            type="button"
            onClick={() => fetchUserInfo()}
            style={{
              flex: "0 0 auto",
              padding: "0.45rem 0.9rem",
              borderRadius: "999px",
              border: "1px solid #4b5563",
              backgroundColor: "#18181b",
              color: "#e5e7eb",
              cursor: "pointer",
            }}>
            정보 다시 불러오기
          </button>

          <button
            type="button"
            onClick={handleLogout}
            style={{
              flex: 1,
              padding: "0.5rem 0.9rem",
              borderRadius: "999px",
              border: "none",
              background: "linear-gradient(135deg, #ef4444, #b91c1c)",
              color: "#f9fafb",
              cursor: "pointer",
              fontWeight: 600,
              textAlign: "center",
            }}>
            로그아웃
          </button>
        </div>
      </div>
    </div>
  );
}

export default AccountSettingsPage;
