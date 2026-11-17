import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiRequest, getAuthToken, setAuthToken } from '../lib/api';
import type { GatewayStatus, UserProfile } from '../types/ecommerce';

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  gatewayConfig: GatewayStatus | null;
  login: (email: string, password: string) => Promise<UserProfile>;
  loginWithPasscode: (passcode: string) => Promise<UserProfile>;
  register: (payload: {
    full_name: string;
    email: string;
    phone: string;
    whatsapp_number: string;
    password: string;
  }) => Promise<UserProfile>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  updateProfile: (payload: {
    full_name: string;
    phone: string;
    whatsapp_number: string;
  }) => Promise<UserProfile>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [gatewayConfig, setGatewayConfig] = useState<GatewayStatus | null>(null);

  const refreshUser = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const data = await apiRequest<{ user: UserProfile }>('/api/auth/me');
      setUser(data.user);
    } catch {
      setAuthToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    apiRequest<GatewayStatus>('/api/config')
      .then(setGatewayConfig)
      .catch(() => {});
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const data = await apiRequest<{ token: string; user: UserProfile }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setAuthToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const loginWithPasscode = async (passcode: string) => {
    const data = await apiRequest<{ token: string; user: UserProfile }>('/api/auth/admin-access', {
      method: 'POST',
      body: JSON.stringify({ passcode }),
    });
    setAuthToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const register = async (payload: {
    full_name: string;
    email: string;
    phone: string;
    whatsapp_number: string;
    password: string;
  }) => {
    const data = await apiRequest<{ token: string; user: UserProfile }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setAuthToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    setAuthToken(null);
    setUser(null);
  };

  const updateProfile = async (payload: {
    full_name: string;
    phone: string;
    whatsapp_number: string;
  }) => {
    const data = await apiRequest<{ user: UserProfile }>('/api/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    setUser(data.user);
    return data.user;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        gatewayConfig,
        login,
        loginWithPasscode,
        register,
        logout,
        refreshUser,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
