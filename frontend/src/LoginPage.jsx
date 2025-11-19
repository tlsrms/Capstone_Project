import React, { useState } from "react";
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from "./AuthContext";

function LoginPage() {
    const { login } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    
    const handleGoogleSuccess = async (credentialResponse) => {
        try {
            const response = await fetch('http://localhost:8000/api/auth/google/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_token: credentialResponse.credential })
            });

            const data = await response.json();

            if (response.ok) {
    login(data.access, data.refresh, data.user);
                
                if (data.is_new_user) {
                    alert("구글 계정으로 회원가입 완료!");
                } else {
                    alert("구글 로그인 성공!");
                }
                
                console.log("User:", data.user);
            } else {
                alert(data.detail || "구글 로그인에 실패했습니다.");
            }
        } catch (error) {
            console.error("Error:", error);
            alert("서버와 연결할 수 없습니다.");
        }
    };

    const handleGoogleError = () => {
        alert("구글 로그인이 취소되었습니다.");
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!email || !password) {
            alert("이메일과 비밀번호를 입력해주세요.");
            return;
        }

        try {
            const response = await fetch('http://localhost:8000/api/auth/login/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok) {
                login(data.access, data.refresh, data.user);
                
                alert("로그인 성공!");
                console.log("User:", data.user);
                console.log("Access Token:", data.access);
            } else {
                const errorMsg = data.detail || data.non_field_errors?.[0] || "로그인에 실패했습니다.";
                alert(errorMsg);
            }
        } catch (error) {
            console.error("Error:", error);
            alert("서버와 연결할 수 없습니다.");
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
                }}>로그인</h2>
                
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
                    
                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{
                            display: 'block',
                            color: '#d1d5db',
                            marginBottom: '0.5rem'
                        }}>비밀번호</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="비밀번호 입력"
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
                        로그인
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
                            text="continue_with"
                            locale="ko"
                        />
                    </div>

                    <div style={{
                        textAlign: 'center',
                        color: '#9ca3af',
                        fontSize: '0.875rem'
                    }}>
                        계정이 없으신가요?{' '}
                        <a 
                            href="/register" 
                            style={{
                                color: '#3b82f6',
                                textDecoration: 'none',
                                fontWeight: '500'
                            }}
                            onMouseOver={(e) => e.target.style.textDecoration = 'underline'}
                            onMouseOut={(e) => e.target.style.textDecoration = 'none'}
                        >
                            회원가입
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default LoginPage;