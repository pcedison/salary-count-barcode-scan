/**
 * 員工數據鉤子
 * 
 * 提供穩定的員工數據獲取機制，具有以下特點：
 * 1. 從服務器獲取最新數據
 * 2. 在服務器請求失敗時使用本地緩存
 * 3. 自動緩存從服務器獲取的數據
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cacheEmployees, getCachedEmployees } from '../utils/dataCache';

// API 請求函數
async function fetchEmployees() {
  try {
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

// 創建員工
async function createEmployee(employeeData) {
  const response = await fetch('/api/employees', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(employeeData),
  });
  
  if (!response.ok) {
    throw new Error(`創建員工失敗: ${response.status}`);
  }
  
  return response.json();
}

// 更新員工
async function updateEmployee(employee) {
  const response = await fetch(`/api/employees/${employee.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(employee),
  });
  
  if (!response.ok) {
    throw new Error(`更新員工失敗: ${response.status}`);
  }
  
  return response.json();
}

// 刪除員工
async function deleteEmployee(id) {
  const response = await fetch(`/api/employees/${id}`, {
    method: 'DELETE',
  });
  
  if (!response.ok) {
    throw new Error(`刪除員工失敗: ${response.status}`);
  }
  
  return true;
}

/**
 * 員工數據鉤子
 * @returns 員工數據和操作函數
 */
export function useEmployees() {
  const queryClient = useQueryClient();
  
  // 查詢員工數據
  const query = useQuery({
    queryKey: ['employees'],
    queryFn: fetchEmployees,
    staleTime: 5 * 60 * 1000, // 5分鐘
    retry: 3, // 失敗時最多重試3次
  });
  
  // 創建員工
  const createMutation = useMutation({
    mutationFn: createEmployee,
    onSuccess: () => {
      // 成功後刷新員工數據
      queryClient.invalidateQueries(['employees']);
    },
  });
  
  // 更新員工
  const updateMutation = useMutation({
    mutationFn: updateEmployee,
    onSuccess: () => {
      // 成功後刷新員工數據
      queryClient.invalidateQueries(['employees']);
    },
  });
  
  // 刪除員工
  const deleteMutation = useMutation({
    mutationFn: deleteEmployee,
    onSuccess: () => {
      // 成功後刷新員工數據
      queryClient.invalidateQueries(['employees']);
    },
  });
  
  return {
    // 數據和狀態
    employees: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isFetching: query.isFetching,
    // 操作函數
    createEmployee: createMutation.mutate,
    updateEmployee: updateMutation.mutate,
    deleteEmployee: deleteMutation.mutate,
    // 操作狀態
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    // 刷新數據
    refetch: query.refetch
  };
}