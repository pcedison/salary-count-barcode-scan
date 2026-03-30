import { createContext, useState, useContext, ReactNode, useEffect, useRef, useCallback } from "react";
import { toast } from "@/hooks/use-toast";
import { ADMIN_SESSION_INVALIDATED_EVENT, apiRequest } from "@/lib/queryClient";
import {
  isAdminSessionIdleExpired,
  resolveAdminSessionPolicy,
  shouldRefreshAdminSession,
} from "@/lib/adminSession";
import { useQueryClient } from "@tanstack/react-query";
import { DEFAULT_ADMIN_SESSION_POLICY, type AdminSessionPolicy } from "@shared/utils/adminSessionPolicy";

type AdminContextType = {
  isAdmin: boolean;
  verifyPin: (pin: string) => Promise<boolean>;
  logout: () => Promise<void>;
  updatePin: (oldPin: string, newPin: string) => Promise<boolean>;
  resetIdleTimer: () => void;
};

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const lastSessionRefreshRef = useRef<number>(0);
  const isAdminRef = useRef<boolean>(false);
  const sessionPolicyRef = useRef<AdminSessionPolicy>(DEFAULT_ADMIN_SESSION_POLICY);
  const sessionRefreshInFlightRef = useRef<boolean>(false);
  const queryClient = useQueryClient();

  const clearLegacyAdminStorage = useCallback(() => {
    localStorage.removeItem("isAdmin");
    localStorage.removeItem("adminLoginTime");
    localStorage.removeItem("adminPin");
  }, []);

  const clearAdminQueries = useCallback(() => {
    const adminQueryPrefixes = [
      '/api/attendance',
      '/api/holidays',
      '/api/employees/admin',
      '/api/salary-records',
      '/api/db-status'
    ];

    queryClient.removeQueries({
      predicate: (query) => {
        const key = query.queryKey[0];
        return (
          typeof key === 'string' &&
          adminQueryPrefixes.some(prefix => key.startsWith(prefix))
        );
      }
    });
  }, [queryClient]);

  const clearAdminState = useCallback((options?: {
    showToast?: boolean;
    title?: string;
    description?: string;
  }) => {
    setIsAdmin(false);
    isAdminRef.current = false;
    clearLegacyAdminStorage();
    clearAdminQueries();

    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }

    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }

    lastSessionRefreshRef.current = 0;
    sessionRefreshInFlightRef.current = false;

    if (options?.showToast) {
      toast({
        title: options.title || "登出成功",
        description: options.description || "您已登出管理員模式",
      });
    }
  }, [clearAdminQueries, clearLegacyAdminStorage]);

  const applySessionPolicy = useCallback((payload: unknown) => {
    const nextPolicy = resolveAdminSessionPolicy(payload);
    sessionPolicyRef.current = nextPolicy;
    return nextPolicy;
  }, []);

  const syncAdminSession = useCallback(async () => {
    clearLegacyAdminStorage();

    try {
      const response = await fetch("/api/admin/session", {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`Unable to restore admin session: ${response.status}`);
      }

      const result = await response.json();
      applySessionPolicy(result);
      const authenticated = result?.isAdmin === true;

      setIsAdmin(authenticated);
      isAdminRef.current = authenticated;

      if (authenticated) {
        const now = Date.now();
        lastActivityRef.current = now;
        lastSessionRefreshRef.current = now;
      } else {
        clearAdminState();
      }

      return authenticated;
    } catch (error) {
      console.error("Admin session restore error:", error);
      clearAdminState();
      return false;
    }
  }, [applySessionPolicy, clearAdminState, clearLegacyAdminStorage]);

  const logout = useCallback(async (options?: {
    showToast?: boolean;
    title?: string;
    description?: string;
  }) => {
    try {
      await fetch("/api/admin/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("Admin logout error:", error);
    } finally {
      clearAdminState(options);
    }
  }, [clearAdminState]);

  const refreshActiveSession = useCallback(async () => {
    if (!isAdminRef.current || sessionRefreshInFlightRef.current) {
      return false;
    }

    sessionRefreshInFlightRef.current = true;

    try {
      const response = await fetch("/api/admin/session", {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(`Unable to refresh admin session: ${response.status}`);
      }

      const result = await response.json();
      applySessionPolicy(result);

      if (result?.isAdmin === true) {
        lastSessionRefreshRef.current = Date.now();
        return true;
      }

      clearAdminState({
        showToast: true,
        title: "管理員會話失效",
        description: "管理員會話已過期，請重新登入。"
      });
      return false;
    } catch (error) {
      console.error("Admin session heartbeat error:", error);
      return false;
    } finally {
      sessionRefreshInFlightRef.current = false;
    }
  }, [applySessionPolicy, clearAdminState]);

  const resetIdleTimer = useCallback(() => {
    if (!isAdminRef.current) {
      return;
    }

    lastActivityRef.current = Date.now();

    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }

    const { timeoutMinutes, timeoutMs } = sessionPolicyRef.current;

    idleTimerRef.current = setTimeout(() => {
      if (
        isAdminSessionIdleExpired({
          now: Date.now(),
          lastActivityAt: lastActivityRef.current,
          timeoutMs: sessionPolicyRef.current.timeoutMs,
        })
      ) {
        void logout({
          showToast: true,
          title: "自動登出",
          description: `因為閒置時間超過${timeoutMinutes}分鐘，您已被自動登出管理員模式`,
        });
      }
    }, timeoutMs);
  }, [logout]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    resetIdleTimer();

    const handleActivity = () => resetIdleTimer();
    window.addEventListener("mousemove", handleActivity);
    window.addEventListener("mousedown", handleActivity);
    window.addEventListener("keypress", handleActivity);
    window.addEventListener("touchmove", handleActivity);
    window.addEventListener("touchstart", handleActivity);
    window.addEventListener("scroll", handleActivity);

    return () => {
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("mousedown", handleActivity);
      window.removeEventListener("keypress", handleActivity);
      window.removeEventListener("touchmove", handleActivity);
      window.removeEventListener("touchstart", handleActivity);
      window.removeEventListener("scroll", handleActivity);

      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };
  }, [isAdmin, resetIdleTimer]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    const heartbeatIntervalMs = 60 * 1000;

    heartbeatTimerRef.current = setInterval(() => {
      const { timeoutMs, refreshIntervalMs } = sessionPolicyRef.current;

      if (
        shouldRefreshAdminSession({
          now: Date.now(),
          lastActivityAt: lastActivityRef.current,
          lastRefreshAt: lastSessionRefreshRef.current,
          timeoutMs,
          refreshIntervalMs,
        })
      ) {
        void refreshActiveSession();
      }
    }, heartbeatIntervalMs);

    return () => {
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
    };
  }, [isAdmin, refreshActiveSession]);

  // Restore admin session from the server-side cookie
  useEffect(() => {
    void syncAdminSession();
  }, [syncAdminSession]);

  useEffect(() => {
    isAdminRef.current = isAdmin;
  }, [isAdmin]);

  useEffect(() => {
    const handleSessionInvalidated = () => {
      if (isAdminRef.current) {
        clearAdminState({
          showToast: true,
          title: "管理員會話失效",
          description: "管理員會話已過期，請重新登入。"
        });
        return;
      }

      clearAdminState();
    };

    window.addEventListener(ADMIN_SESSION_INVALIDATED_EVENT, handleSessionInvalidated);
    return () => {
      window.removeEventListener(ADMIN_SESSION_INVALIDATED_EVENT, handleSessionInvalidated);
    };
  }, [clearAdminState]);

  const verifyPin = useCallback(async (pin: string): Promise<boolean> => {
    try {
      const response = await apiRequest("POST", "/api/verify-admin", { pin });
      const result = await response.json();
      
      if (result.success) {
        applySessionPolicy(result);
        setIsAdmin(true);
        isAdminRef.current = true;
        const now = Date.now();
        lastActivityRef.current = now;
        lastSessionRefreshRef.current = now;
        return true;
      } else {
        toast({
          title: "驗證失敗",
          description: "管理員密碼不正確",
          variant: "destructive",
        });
        return false;
      }
    } catch (error) {
      console.error("Admin verification error:", error);
      toast({
        title: "驗證錯誤",
        description: "無法驗證管理員密碼，請稍後再試",
        variant: "destructive",
      });
      return false;
    }
  }, [applySessionPolicy]);

  const updatePin = async (oldPin: string, newPin: string): Promise<boolean> => {
    try {
      const response = await apiRequest("POST", "/api/update-admin-pin", { oldPin, newPin });
      const result = await response.json();
      
      if (result.success) {
        toast({
          title: "更新成功",
          description: "管理員密碼已成功更新",
        });
        return true;
      } else {
        toast({
          title: "更新失敗",
          description: result.message || "無法更新管理員密碼",
          variant: "destructive",
        });
        return false;
      }
    } catch (error) {
      console.error("Admin pin update error:", error);
      toast({
        title: "更新錯誤",
        description: "無法更新管理員密碼，請稍後再試",
        variant: "destructive",
      });
      return false;
    }
  };

  return (
    <AdminContext.Provider value={{ isAdmin, verifyPin, logout, updatePin, resetIdleTimer }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error("useAdmin must be used within an AdminProvider");
  }
  return context;
}
