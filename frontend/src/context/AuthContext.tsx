import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { api, ApiError } from "../api/client";
import type { User } from "../api/types";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (
    username: string,
    password: string,
    extra?: { supportedTeamId?: string | null; avatar?: string | null; onboardingCompleted?: boolean }
  ) => Promise<User>;
  updateProfile: (updates: {
    avatar?: string | null;
    supportedTeamId?: string | null;
    onboardingCompleted?: boolean;
  }) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const { user } = await api.get<{ user: User }>("/auth/me");
      setUser(user);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  const login = useCallback(async (username: string, password: string) => {
    const { user } = await api.post<{ user: User }>("/auth/login", {
      username: username.trim(),
      password,
    });
    setUser(user);
  }, []);

  const register = useCallback(
    async (
      username: string,
      password: string,
      extra?: { supportedTeamId?: string | null; avatar?: string | null; onboardingCompleted?: boolean }
    ) => {
      const { user } = await api.post<{ user: User }>("/auth/register", {
        username: username.trim(),
        password,
        supportedTeamId: extra?.supportedTeamId !== undefined ? extra.supportedTeamId : undefined,
        avatar: extra?.avatar?.trim() || undefined,
        onboardingCompleted: extra?.onboardingCompleted ?? (extra?.supportedTeamId !== undefined),
      });
      setUser(user);
      return user;
    },
    []
  );

  const updateProfile = useCallback(
    async (updates: {
      avatar?: string | null;
      supportedTeamId?: string | null;
      onboardingCompleted?: boolean;
    }) => {
      const { user } = await api.patch<{ user: User }>("/auth/profile", updates);
      setUser(user);
      return user;
    },
    []
  );

  const logout = useCallback(async () => {
    await api.post("/auth/logout");
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, updateProfile, logout, refreshUser }}
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

export { ApiError };
