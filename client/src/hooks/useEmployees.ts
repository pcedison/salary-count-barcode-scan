import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { cacheEmployees, getCachedEmployees, Employee } from '../utils/dataCache';

export type { Employee };

// 從 API 獲取員工數據的函數，支持緩存
async function fetchEmployees(): Promise<Employee[]> {
  try {
    // 嘗試從 API 獲取員工數據
    console.log('開始從 API 獲取員工數據');
    const response = await fetch('/api/employees');
    
    if (!response.ok) {
      throw new Error(`獲取員工數據失敗: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`從 API 獲取到 ${data.length} 名員工數據`);
    
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
    staleTime: 60 * 1000, // 1分鐘後數據過期
    refetchOnMount: true, // 每次組件掛載時重新獲取數據
    refetchOnWindowFocus: true, // 窗口獲得焦點時重新獲取數據
  });

  // 記錄員工數據獲取狀態
  console.log('useEmployees hook:', { 
    employees: employees?.length || 0, 
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

  return {
    employees: employees || [],
    activeEmployees,
    isLoading,
    error,
    refetch
  };
}