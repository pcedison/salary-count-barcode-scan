import { createContext, useState, useContext, ReactNode, useEffect, useRef, useCallback } from "react";
import { toast } from "@/hooks/use-toast";
import { ADMIN_SESSION_INVALIDATED_EVENT, apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";

type AdminContextType = {
  isAdmin: boolean;
  verifyPin: (pin: string) => Promise<boolean>;
  logout: () => Promise<void>;
  updatePin: (oldPin: string, newPin: string) => Promise<boolean>;
  resetIdleTimer: () => void; // 新增重置計時器方法
};

// 管理員會話超時時間（毫秒）- 5分鐘
const ADMIN_SESSION_TIMEOUT = 5 * 60 * 1000;

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const isAdminRef = useRef<boolean>(false);
  const queryClient = useQueryClient();

  const clearLegacyAdminStorage = useCallback(() => {
    localStorage.removeItem("isAdmin");
    localStorage.removeItem("adminLoginTime");
    localStorage.removeItem("adminPin");
  }, []);

  const clearAdminQueries = useCallback(() => {
    const adminQueryPrefixes = [
      '/api/employees/admin',
      '/api/salary-records',
      '/api/db-status',
      '/api/supabase-config',
      '/api/supabase-connection',
      '/api/dashboard'
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

    if (options?.showToast) {
      toast({
        title: options.title || "登出成功",
        description: options.description || "您已登出管理員模式",
      });
    }
  }, [clearAdminQueries, clearLegacyAdminStorage]);

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
      const authenticated = result?.isAdmin === true;

      setIsAdmin(authenticated);
      isAdminRef.current = authenticated;

      if (authenticated) {
        lastActivityRef.current = Date.now();
      } else {
        clearAdminQueries();
      }

      return authenticated;
    } catch (error) {
      console.error("Admin session restore error:", error);
      clearAdminState();
      return false;
    }
  }, [clearAdminQueries, clearAdminState, clearLegacyAdminStorage]);

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

  // 重置閒置計時器
  const resetIdleTimer = useCallback(() => {
    if (!isAdmin) return; // 如果不是管理員，不需要重置計時器
    
    // 更新最後活動時間
    lastActivityRef.current = Date.now();
    
    // 清除現有計時器
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    
    // 設置新計時器
    idleTimerRef.current = setTimeout(() => {
      // 檢查距離上次活動時間是否超過閒置時間限制
      const timeSinceLastActivity = Date.now() - lastActivityRef.current;
      if (timeSinceLastActivity >= ADMIN_SESSION_TIMEOUT) {
        void logout({
          showToast: true,
          title: "自動登出",
          description: "因為閒置時間超過5分鐘，您已被自動登出管理員模式",
        });
      }
    }, ADMIN_SESSION_TIMEOUT);
  }, [isAdmin, logout]);

  // 當管理員狀態改變時，處理計時器
  useEffect(() => {
    if (isAdmin) {
      // 如果是管理員，重置計時器
      resetIdleTimer();
      
      // 設置活動監聽器
      const handleActivity = () => resetIdleTimer();
      window.addEventListener("mousemove", handleActivity);
      window.addEventListener("mousedown", handleActivity);
      window.addEventListener("keypress", handleActivity);
      window.addEventListener("touchmove", handleActivity);
      window.addEventListener("touchstart", handleActivity);
      window.addEventListener("scroll", handleActivity);
      
      return () => {
        // 清理監聽器
        window.removeEventListener("mousemove", handleActivity);
        window.removeEventListener("mousedown", handleActivity);
        window.removeEventListener("keypress", handleActivity);
        window.removeEventListener("touchmove", handleActivity);
        window.removeEventListener("touchstart", handleActivity);
        window.removeEventListener("scroll", handleActivity);
        
        // 清理計時器
        if (idleTimerRef.current) {
          clearTimeout(idleTimerRef.current);
        }
      };
    }
  }, [isAdmin, resetIdleTimer]);

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

  const verifyPin = async (pin: string): Promise<boolean> => {
    try {
      const response = await apiRequest("POST", "/api/verify-admin", { pin });
      const result = await response.json();
      
      if (result.success) {
        setIsAdmin(true);
        isAdminRef.current = true;
        lastActivityRef.current = Date.now();
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
  };

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
