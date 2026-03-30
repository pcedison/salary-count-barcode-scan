import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import type { Employee } from '../types/employee';

export type { Employee };

type UseEmployeesOptions = {
  requireAdminDetails?: boolean;
  enabled?: boolean;
};

export function useEmployees(options: UseEmployeesOptions = {}) {
  const { requireAdminDetails = false, enabled = true } = options;
  const queryPath = requireAdminDetails ? '/api/employees/admin' : '/api/employees';

  const {
    data: employees = [],
    isLoading,
    error,
    refetch
  } = useQuery<Employee[]>({
    queryKey: [queryPath],
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
    enabled
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
