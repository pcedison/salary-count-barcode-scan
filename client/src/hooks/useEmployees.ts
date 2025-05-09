import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { cacheEmployees, getCachedEmployees, Employee } from '../utils/dataCache';

// 從 API 獲取員工數據的函數，支持緩存
async function fetchEmployees(): Promise<Employee[]> {
  try {
    // 嘗試從 API 獲取員工數據
    const response = await fetch('/api/employees');
    
    if (!response.ok) {
      throw new Error(`獲取員工數據失敗: ${response.status}`);
    }
    
    const data = await response.json();
    
    // 緩存獲取的數據
    cacheEmployees(data);
    
    return data;
  } catch (error) {
    console.error('獲取員工數據時出錯:', error);
    
    // 嘗試從緩存獲取
    const cachedData = getCachedEmployees();
    
    if (cachedData) {
      console.log('使用緩存的員工數據');
      return cachedData;
    }
    
    // 如果沒有緩存，則拋出錯誤
    throw error;
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
    retry: 3,      // 增加重試次數
    retryDelay: attempt => Math.min(1000 * 2 ** attempt, 30000), // 指數回退重試
    staleTime: 5 * 60 * 1000, // 5分鐘後數據過期
  });

  // 獲取活躍員工（在職中）
  const activeEmployees = employees?.filter(employee => employee.active) || [];

  return {
    employees: employees || [],
    activeEmployees,
    isLoading,
    error,
    refetch
  };
}