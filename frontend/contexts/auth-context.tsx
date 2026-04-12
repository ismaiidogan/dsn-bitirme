"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { auth, setAccessToken, getAccessToken, ApiError } from "@/lib/api";

interface User {
  id: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    try {
      const me = await auth.me();
      setUser(me);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // On mount: try to get a new access token using the HttpOnly refresh cookie
  useEffect(() => {
    async function init() {
      try {
        const data = await auth.refresh();
        setAccessToken(data.access_token);
        await loadUser();
      } catch {
        setLoading(false);
      }
    }
    init();
  }, [loadUser]);

  const login = async (email: string, password: string) => {
    const data = await auth.login(email, password);
    setAccessToken(data.access_token);
    await loadUser();
  };

  const register = async (email: string, password: string) => {
    const data = await auth.register(email, password);
    setAccessToken(data.access_token);
    await loadUser();
  };

  const logout = async () => {
    try {
      await auth.logout();
    } catch {}
    setAccessToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
