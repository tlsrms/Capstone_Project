import React, { useState } from "react";
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from "./AuthContext";

function RegisterPage() {
    const { login } = useAuth(); 
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");

    const handleGoogleSuccess = async (credentialResponse) => {
        try {
            const response = await fetch('http://localhost:8000/api/auth/google/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_token: credentialResponse.credential })
            });

            const data = await response.json();

            if (response.ok) {
                const loginResponse = await fetch('http://localhost:8000/api/auth/login/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });

    const loginData = await loginResponse.json();

    if (loginResponse.ok) {
        login(loginData.access, loginData.refresh, loginData.user);
        window.location.href = "/profile-select"; 
    } else {
        alert("회원가입은 성공했지만 자동 로그인에 실패했습니다.");
        window.location.href = "/login";
    }
            } else {
                setError(data.detail || "구글 로그인에 실패했습니다.");
            }
        } catch (error) {
            console.error("Error:", error);
            setError("서버와 연결할 수 없습니다.");
        }
    };

    const handleGoogleError = () => {
        setError("구글 로그인이 취소되었습니다.");
    };

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

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            setError("올바른 이메일 형식이 아닙니다.");
            return;
        }

        try {
            const response = await fetch('http://localhost:8000/api/auth/register/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok) {
                const loginResponse = await fetch('http://localhost:8000/api/auth/login/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });

    const loginData = await loginResponse.json();

    if (loginResponse.ok) {
        login(loginData.access, loginData.refresh, loginData.user);
        window.location.href = "/profile-select";  // 프로필 선택
    }
            } else {
                const errorMsg = data.email?.[0] || data.password?.[0] || data.detail || "회원가입에 실패했습니다.";
                setError(errorMsg);
            }
        } catch (error) {
            console.error("Error:", error);
            setError("서버와 연결할 수 없습니다.");
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            width: '100vw',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#1a1a1a',
            padding: '1rem',
            margin: 0,
            position: 'fixed',
            top: 0,
            left: 0
        }}>
            <div style={{
                backgroundColor: '#2d2d2d',
                padding: '2rem',
                borderRadius: '0.5rem',
                boxShadow: '0 8px 16px rgba(0, 0, 0, 0.4)',
                width: '24rem',
                maxWidth: '90%',
                margin: '0 auto'
            }}>
                <h2 style={{
                    fontSize: '1.5rem',
                    fontWeight: 'bold',
                    textAlign: 'center',
                    marginBottom: '1.5rem',
                    color: '#ffffff'
                }}>회원가입</h2>

                {error && (
                    <div style={{
                        backgroundColor: '#dc2626',
                        color: 'white',
                        padding: '0.75rem',
                        borderRadius: '0.375rem',
                        marginBottom: '1rem',
                        fontSize: '0.875rem'
                    }}>
                        {error}
                    </div>
                )}
                
                <div>
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{
                            display: 'block',
                            color: '#d1d5db',
                            marginBottom: '0.5rem'
                        }}>이메일</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="example@email.com"
                            style={{
                                width: '100%',
                                padding: '0.5rem 1rem',
                                border: '1px solid #404040',
                                borderRadius: '0.5rem',
                                outline: 'none',
                                fontSize: '1rem',
                                color: '#fafafa',
                                backgroundColor: '#262626',
                                boxSizing: 'border-box'
                            }}
                        />
                    </div>
                    
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{
                            display: 'block',
                            color: '#d1d5db',
                            marginBottom: '0.5rem'
                        }}>비밀번호</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="8자 이상 입력"
                            onKeyPress={(e) => {
                                if (e.key === 'Enter') {
                                    handleSubmit(e);
                                }
                            }}
                            style={{
                                width: '100%',
                                padding: '0.5rem 1rem',
                                border: '1px solid #404040',
                                borderRadius: '0.5rem',
                                outline: 'none',
                                fontSize: '1rem',
                                color: '#fafafa',
                                backgroundColor: '#262626',
                                boxSizing: 'border-box'
                            }}
                        />
                    </div>

                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{
                            display: 'block',
                            color: '#d1d5db',
                            marginBottom: '0.5rem'
                        }}>비밀번호 확인</label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="비밀번호 재입력"
                            onKeyPress={(e) => {
                                if (e.key === 'Enter') {
                                    handleSubmit(e);
                                }
                            }}
                            style={{
                                width: '100%',
                                padding: '0.5rem 1rem',
                                border: '1px solid #404040',
                                borderRadius: '0.5rem',
                                outline: 'none',
                                fontSize: '1rem',
                                color: '#fafafa',
                                backgroundColor: '#262626',
                                boxSizing: 'border-box'
                            }}
                        />
                    </div>
                    
                    <button
                        type="button"
                        onClick={handleSubmit}
                        style={{
                            width: '100%',
                            backgroundColor: '#fff',
                            color: '#000',
                            padding: '0.5rem',
                            borderRadius: '0.5rem',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '1rem',
                            fontWeight: '700',
                            marginBottom: '1rem'
                        }}
                        onMouseOver={(e) => e.target.style.backgroundColor = '#e5e5e5'}
                        onMouseOut={(e) => e.target.style.backgroundColor = '#fff'}
                    >
                        회원가입
                    </button>

                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        margin: '1.5rem 0',
                        color: '#9ca3af'
                    }}>
                        <div style={{ flex: 1, height: '1px', backgroundColor: '#4b5563' }}></div>
                        <span style={{ padding: '0 1rem', fontSize: '0.875rem' }}>또는</span>
                        <div style={{ flex: 1, height: '1px', backgroundColor: '#4b5563' }}></div>
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                        <GoogleLogin
                            onSuccess={handleGoogleSuccess}
                            onError={handleGoogleError}
                            theme="filled_black"
                            size="large"
                            text="signup_with"
                            locale="ko"
                        />
                    </div>

                    <div style={{
                        textAlign: 'center',
                        color: '#9ca3af',
                        fontSize: '0.875rem'
                    }}>
                        이미 계정이 있으신가요?{' '}
                        <a 
                            href="/login" 
                            style={{
                                color: '#3b82f6',
                                textDecoration: 'none',
                                fontWeight: '500'
                            }}
                            onMouseOver={(e) => e.target.style.textDecoration = 'underline'}
                            onMouseOut={(e) => e.target.style.textDecoration = 'none'}
                        >
                            로그인
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default RegisterPage;