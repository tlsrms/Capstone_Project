import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./AuthContext";
import LoginPage from "./LoginPage";
import RegisterPage from "./RegisterPage";
import MemoMainPage from "./MemoMainPage";
import ProfileSelectPage from './ProfileSelectPage';

function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route path="/" element={<Navigate to="/login" replace />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/register" element={<RegisterPage />} />
                    <Route path="/memos" element={<MemoMainPage />} />
                    <Route path="/profile-select" element={<ProfileSelectPage />} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
}

export default App;