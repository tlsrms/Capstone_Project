import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext();

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    // 초기 로드 시 토큰 확인
    useEffect(() => {
        const token = localStorage.getItem('access_token');
        if (token) {
            // 토큰으로 사용자 정보 가져오기
            fetchUserInfo(token);
        } else {
            setIsLoading(false);
        }
    }, []);

    // 사용자 정보 가져오기
    const fetchUserInfo = async (token) => {
        try {
            const response = await fetch('http://localhost:8000/api/auth/me/', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                setUser(data);
            } else {
                // 토큰이 유효하지 않으면 삭제
                logout();
            }
        } catch (error) {
            console.error('Error fetching user info:', error);
            logout();
        } finally {
            setIsLoading(false);
        }
    };

    // 로그인
    const login = (accessToken, refreshToken, userData) => {
        localStorage.setItem('access_token', accessToken);
        localStorage.setItem('refresh_token', refreshToken);
        setUser(userData);
    };

    // 로그아웃
    const logout = () => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        setUser(null);
    };

    const value = {
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};