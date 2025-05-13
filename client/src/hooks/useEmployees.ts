import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { cacheEmployees, getCachedEmployees, Employee } from '../utils/dataCache';

export type { Employee };

// 從 API 獲取員工數據的函數，支持緩存
async function fetchEmployees(): Promise<Employee[]> {
  try {
    // 嘗試從 API 獲取員工數據
    console.log('開始從 API 獲取員工數據');
    
    // 使用直接fetch以確保獲取到數據
    const response = await fetch('/api/employees');
    
    if (!response.ok) {
      throw new Error(`獲取員工數據失敗: ${response.status} ${response.statusText}`);
    }
    
    // 解析JSON回應
    const data = await response.json();
    console.log(`從 API 獲取到 ${data.length} 名員工數據`);
    
    // 輸出員工數據以便調試
    if (data && data.length > 0) {
      console.log('員工數據示例:', data[0]);
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
      return cachedData;
    }
    
    // 如果沒有緩存或緩存為空，返回空數組而不是拋出錯誤
    console.warn('無法獲取員工數據且無有效緩存，返回空數組');
    return [];
  }
}

export function useEmployees() {
  const queryClient = useQueryClient();
  const [isFetching, setIsFetching] = useState(false);
  
  // 獲取所有員工
  const { 
    data: employees = [], 
    isLoading, 
    error,
    refetch
  } = useQuery<Employee[]>({
    queryKey: ['/api/employees'],
    queryFn: fetchEmployees,
    retry: 3,             // 增加重試次數
    retryDelay: attempt => Math.min(1000 * 2 ** attempt, 30000), // 指數回退重試
    staleTime: 10 * 1000, // 10秒後數據過期
    refetchOnMount: true, // 每次組件掛載時重新獲取數據
    refetchOnWindowFocus: true, // 窗口獲得焦點時重新獲取數據
    enabled: true, // 確保查詢自動運行
  });

  // 記錄員工數據獲取狀態
  console.log('useEmployees hook:', { 
    dataLength: employees?.length || 0, 
    isLoading, 
    hasError: !!error 
  });

  // 獲取活躍員工（在職中）
  const activeEmployees = employees?.filter(employee => employee.active) || [];

  // 記錄活躍員工數量
  console.log(`找到 ${activeEmployees.length} 名活躍員工`);
  
  // 如果有活躍員工，輸出他們的名稱以便調試
  if (activeEmployees.length > 0) {
    console.log('活躍員工名單:', activeEmployees.map(emp => emp.name).join(', '));
  }

  // 使用useEffect直接加載數據
  useEffect(() => {
    const loadEmployees = async () => {
      console.log('初始化加載員工數據');
      setIsFetching(true);
      try {
        // 直接使用fetch獲取員工數據
        const response = await fetch('/api/employees');
        if (!response.ok) throw new Error(`API回應不成功: ${response.status}`);
        
        const data = await response.json();
        console.log(`直接獲取到 ${data.length} 名員工`);
        
        // 手動設置到查詢緩存中
        queryClient.setQueryData(['/api/employees'], data);
        
        // 保存到localStorage緩存
        cacheEmployees(data);
      } catch (error) {
        console.error('直接加載員工數據出錯:', error);
      } finally {
        setIsFetching(false);
      }
    };
    
    // 如果目前沒有員工數據，則加載
    if (employees.length === 0 && !isLoading && !isFetching) {
      loadEmployees();
    }
  }, [employees.length, isLoading, isFetching, queryClient]);
  
  // 強制刷新員工數據的函數
  const forceRefreshEmployees = async () => {
    console.log('強制刷新員工數據...');
    setIsFetching(true);
    
    try {
      // 直接使用fetch獲取員工數據
      const response = await fetch('/api/employees');
      if (!response.ok) throw new Error(`API回應不成功: ${response.status}`);
      
      const data = await response.json();
      console.log(`強制刷新: 獲取到 ${data.length} 名員工`);
      
      // 手動設置到查詢緩存中
      queryClient.setQueryData(['/api/employees'], data);
      
      // 保存到localStorage緩存
      cacheEmployees(data);
      
      return { data, error: null };
    } catch (error) {
      console.error('強制刷新員工數據出錯:', error);
      return { data: null, error };
    } finally {
      setIsFetching(false);
    }
  };

  return {
    employees: employees || [],
    activeEmployees,
    isLoading,
    error,
    refetch,
    forceRefreshEmployees
  };
}