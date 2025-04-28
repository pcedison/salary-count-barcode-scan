import { createContext, useState, useContext, ReactNode, useEffect, useRef, useCallback } from "react";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type AdminContextType = {
  isAdmin: boolean;
  adminPin: string | null;
  verifyPin: (pin: string) => Promise<boolean>;
  logout: () => void;
  updatePin: (oldPin: string, newPin: string) => Promise<boolean>;
  resetIdleTimer: () => void; // 新增重置計時器方法
};

// 管理員會話超時時間（毫秒）- 5分鐘
const ADMIN_SESSION_TIMEOUT = 5 * 60 * 1000;

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [adminPin, setAdminPin] = useState<string | null>(null);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

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
        // 自動登出管理員
        setIsAdmin(false);
        setAdminPin(null);
        localStorage.removeItem("isAdmin");
        toast({
          title: "自動登出",
          description: "因為閒置時間超過5分鐘，您已被自動登出管理員模式",
        });
      }
    }, ADMIN_SESSION_TIMEOUT);
  }, [isAdmin]);

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

  // Try to restore admin session from localStorage
  useEffect(() => {
    const storedIsAdmin = localStorage.getItem("isAdmin");
    if (storedIsAdmin === "true") {
      // 檢查是否有存儲的登入時間
      const lastLoginTime = localStorage.getItem("adminLoginTime");
      if (lastLoginTime) {
        const elapsed = Date.now() - parseInt(lastLoginTime, 10);
        // 如果超過閒置時限，則不恢復登入狀態
        if (elapsed > ADMIN_SESSION_TIMEOUT) {
          localStorage.removeItem("isAdmin");
          localStorage.removeItem("adminLoginTime");
          return;
        }
      }
      setIsAdmin(true);
      // 初始化活動時間
      lastActivityRef.current = Date.now();
    }
  }, []);

  const verifyPin = async (pin: string): Promise<boolean> => {
    try {
      const response = await apiRequest("POST", "/api/verify-admin", { pin });
      const result = await response.json();
      
      if (result.success) {
        setIsAdmin(true);
        setAdminPin(pin);
        // 存儲登入狀態和登入時間
        localStorage.setItem("isAdmin", "true");
        localStorage.setItem("adminLoginTime", Date.now().toString());
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
        setAdminPin(newPin);
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

  const logout = () => {
    setIsAdmin(false);
    setAdminPin(null);
    localStorage.removeItem("isAdmin");
    localStorage.removeItem("adminLoginTime");
    
    // 清除閒置計時器
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    
    toast({
      title: "登出成功",
      description: "您已登出管理員模式",
    });
  };

  return (
    <AdminContext.Provider value={{ isAdmin, adminPin, verifyPin, logout, updatePin, resetIdleTimer }}>
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