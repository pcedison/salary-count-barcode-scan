import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { constants } from '@/lib/constants';

interface Deduction {
  name: string;
  amount: number;
  description: string;
}

interface Allowance {
  name: string;
  amount: number;
  description: string;
}

interface Settings {
  baseHourlyRate: number;
  ot1Multiplier: number;
  ot2Multiplier: number;
  baseMonthSalary: number;
  welfareAllowance: number;
  deductions: Deduction[];
  allowances: Allowance[];
}

const defaultSettings: Settings = {
  baseHourlyRate: constants.BASE_HOURLY_RATE,
  ot1Multiplier: constants.OT1_MULTIPLIER,
  ot2Multiplier: constants.OT2_MULTIPLIER,
  baseMonthSalary: constants.BASE_HOURLY_RATE * constants.STANDARD_WORK_HOURS * constants.STANDARD_WORK_DAYS,
  welfareAllowance: constants.DEFAULT_WELFARE_ALLOWANCE,
  deductions: [],
  allowances: []
};

export function useSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch settings from API
  const {
    data: settings,
    isLoading,
    error
  } = useQuery<Settings>({
    queryKey: ['/api/settings']
  });
  
  // Update settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (newSettings: Settings) => {
      return await apiRequest('POST', '/api/settings', newSettings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings'] });
    },
    onError: (error) => {
      console.error('Error updating settings:', error);
      toast({
        title: "設定更新失敗",
        description: "無法更新系統設定，請稍後再試。",
        variant: "destructive"
      });
    }
  });
  
  // Fetch holidays mutation
  const { 
    data: holidays = [], 
    isLoading: isHolidaysLoading 
  } = useQuery({
    queryKey: ['/api/holidays']
  });
  
  // Add holiday mutation
  const addHolidayMutation = useMutation({
    mutationFn: async (holiday: { 
      employeeId: number;
      date: string; 
      name: string; 
      holidayType: 'worked' | 'sick_leave' | 'personal_leave' | 'national_holiday' | 'typhoon_leave' | 'special_leave';
      description?: string; 
    }) => {
      return await apiRequest('POST', '/api/holidays', holiday);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/holidays'] });
    },
    onError: (error) => {
      console.error('Error adding holiday:', error);
      toast({
        title: "假日新增失敗",
        description: "無法新增假日資料，請稍後再試。",
        variant: "destructive"
      });
    }
  });
  
  // Delete holiday mutation
  const deleteHolidayMutation = useMutation({
    mutationFn: async (id: number) => {
      try {
        return await apiRequest('DELETE', `/api/holidays/${id}`);
      } catch (error: any) {
        if (error.message && error.message.startsWith('404')) {
          return null;
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/holidays'] });
      queryClient.invalidateQueries({ queryKey: ['/api/attendance'] });
      queryClient.invalidateQueries({ queryKey: ['/api/employees'] });
      queryClient.invalidateQueries({ queryKey: ['/api/employees/admin'] });
    },
    onError: (error) => {
      console.error('Error deleting holiday:', error);
      toast({
        title: "假日刪除失敗",
        description: "無法刪除假日資料，請稍後再試。",
        variant: "destructive"
      });
    }
  });
  
  // Show toast on settings fetch error
  useEffect(() => {
    if (error) {
      console.error("Error fetching settings:", error);
      toast({
        title: "設定載入失敗",
        description: "無法取得系統設定，使用預設值。",
        variant: "destructive"
      });
    }
  }, [error, toast]);
  
  // Update settings
  const updateSettings = async (newSettings: Settings) => {
    try {
      await updateSettingsMutation.mutateAsync(newSettings);
      return true;
    } catch (error) {
      return false;
    }
  };
  
  // Add holiday
  const addHoliday = async (holiday: { 
    employeeId: number;
    date: string; 
    name: string; 
    holidayType: 'worked' | 'sick_leave' | 'personal_leave' | 'national_holiday' | 'typhoon_leave' | 'special_leave';
    description?: string; 
  }) => {
    try {
      await addHolidayMutation.mutateAsync(holiday);
      return true;
    } catch (error) {
      return false;
    }
  };
  
  // Delete holiday
  const deleteHoliday = async (id: number) => {
    try {
      await deleteHolidayMutation.mutateAsync(id);
      return true;
    } catch (error) {
      return false;
    }
  };
  
  return {
    settings: settings ?? defaultSettings,
    isLoading,
    updateSettings,
    holidays,
    isHolidaysLoading,
    addHoliday,
    deleteHoliday
  };
}
