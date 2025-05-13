import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { cacheEmployees, getCachedEmployees, Employee } from '../utils/dataCache';

export type { Employee };

export function useEmployees() {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [activeEmployees, setActiveEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // 加載員工數據
  const fetchEmployees = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('開始從 API 獲取員工數據');
      const response = await fetch('/api/employees');
      
      if (!response.ok) {
        throw new Error(`獲取員工數據失敗: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log(`從 API 獲取到 ${data.length} 名員工數據`);
      
      // 輸出員工數據以便調試
      if (data && data.length > 0) {
        console.log('員工數據示例:', data[0]);
      }
      
      // 更新狀態
      setEmployees(data);
      
      // 設置活躍員工
      const active = data.filter((employee: Employee) => employee.active);
      setActiveEmployees(active);
      
      // 記錄活躍員工數量
      console.log(`找到 ${active.length} 名活躍員工`);
      if (active.length > 0) {
        console.log('活躍員工名單:', active.map((emp: Employee) => emp.name).join(', '));
      }
      
      // 緩存獲取的數據
      cacheEmployees(data);
      
      return data;
    } catch (error) {
      console.error('獲取員工數據時出錯:', error);
      
      // 嘗試從緩存獲取
      const cachedData = getCachedEmployees();
      
      if (cachedData && cachedData.length > 0) {
        console.log(`使用緩存的員工數據，共 ${cachedData.length} 名員工`);
        setEmployees(cachedData);
        const active = cachedData.filter((employee: Employee) => employee.active);
        setActiveEmployees(active);
        return cachedData;
      }
      
      setError(error as Error);
      return [];
    } finally {
      setIsLoading(false);
    }
  };
  
  // 初始化加載數據
  useEffect(() => {
    fetchEmployees();
    
    // 設置定期刷新員工數據的計時器
    const refreshTimer = setInterval(() => {
      fetchEmployees();
    }, 60000); // 每分鐘刷新一次
    
    return () => clearInterval(refreshTimer);
  }, []);
  
  // 強制刷新員工數據的函數
  const forceRefreshEmployees = async () => {
    try {
      console.log('強制刷新員工數據...');
      const data = await fetchEmployees();
      
      toast({
        title: "員工資料已更新",
        description: `成功載入 ${data.length} 名員工資料`,
        variant: "default",
      });
      
      return { success: true, data };
    } catch (error) {
      console.error('強制刷新員工數據出錯:', error);
      
      toast({
        title: "更新失敗",
        description: `載入員工資料時發生錯誤: ${(error as Error).message}`,
        variant: "destructive",
      });
      
      return { success: false, error };
    }
  };

  // 返回數據和操作函數
  return {
    employees,
    activeEmployees,
    isLoading,
    error,
    refetch: fetchEmployees,
    forceRefreshEmployees
  };
}