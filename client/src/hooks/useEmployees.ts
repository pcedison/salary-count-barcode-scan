import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

export interface Employee {
  id: number;
  name: string;
  idNumber: string;
  department: string;
  position: string;
  isEncrypted: boolean;
  active: boolean;
  phone?: string;
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
    retry: 1,
    staleTime: 60000, // 1分鐘後數據過期
  });

  // 獲取活躍員工（在職中）
  const activeEmployees = employees.filter(employee => employee.active);

  return {
    employees,
    activeEmployees,
    isLoading,
    error,
    refetch
  };
}