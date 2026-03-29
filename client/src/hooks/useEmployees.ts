import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import type { Employee } from '../types/employee';

export type { Employee };

const EMPLOYEES_QUERY_KEY = ['/api/employees'] as const;

export function useEmployees() {
  const {
    data: employees = [],
    isLoading,
    error,
    refetch
  } = useQuery<Employee[]>({
    queryKey: EMPLOYEES_QUERY_KEY,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    retry: 1
  });

  const activeEmployees = useMemo(
    () => employees.filter((employee) => employee.active),
    [employees]
  );

  const forceRefreshEmployees = async () => {
    const result = await refetch();

    if (result.error) {
      throw result.error;
    }

    return {
      success: true as const,
      data: result.data ?? []
    };
  };

  return {
    employees,
    activeEmployees,
    isLoading,
    error: error instanceof Error ? error : null,
    refetch,
    forceRefreshEmployees
  };
}
