// src/main.jsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";
import "./index.css";

import App from "./App.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import MemoMainPage from "./pages/MemoMainPage.jsx";
import ProfileSelectPage from "./pages/ProfileSelectPage.jsx";
import { AuthProvider } from "./pages/AuthContext.jsx";
import AccountSettingsPage from "./pages/AccountSettingsPage.jsx";

const GOOGLE_CLIENT_ID =
  "644535033601-kv8h052g252hpu14se2tblo3htu5t5c4.apps.googleusercontent.com";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LoginPage />} />

            <Route path="/register" element={<RegisterPage />} />
            <Route path="/profile-select" element={<ProfileSelectPage />} />
            <Route path="/account" element={<AccountSettingsPage />} />

            <Route path="/app" element={<App />}>
              <Route path="memos" element={<MemoMainPage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </GoogleOAuthProvider>
  </StrictMode>
);
