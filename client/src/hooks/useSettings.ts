import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { constants } from '@/lib/constants';

interface Deduction {
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
}

export function useSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Local settings state
  const [localSettings, setLocalSettings] = useState<Settings>({
    baseHourlyRate: constants.DEFAULT_BASE_HOURLY_RATE,
    ot1Multiplier: constants.DEFAULT_OT1_MULTIPLIER,
    ot2Multiplier: constants.DEFAULT_OT2_MULTIPLIER,
    baseMonthSalary: constants.DEFAULT_BASE_MONTH_SALARY,
    welfareAllowance: constants.DEFAULT_WELFARE_ALLOWANCE,
    deductions: constants.DEFAULT_DEDUCTIONS
  });
  
  // Fetch settings from API
  const { 
    data: settings, 
    isLoading,
    error,
    refetch
  } = useQuery<Settings>({
    queryKey: ['/api/settings']
  });
  
  // Update local settings when data changes
  useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
    }
  }, [settings]);
  
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
    mutationFn: async (holiday: { date: string; description: string }) => {
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
      return await apiRequest('DELETE', `/api/holidays/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/holidays'] });
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
  
  // Initialize settings if there was an error in fetching
  useEffect(() => {
    if (error) {
      console.error("Error fetching settings:", error);
      toast({
        title: "設定載入失敗",
        description: "無法取得系統設定，使用預設值。",
        variant: "destructive"
      });
      
      // Use default settings from constants
      setLocalSettings({
        baseHourlyRate: constants.DEFAULT_BASE_HOURLY_RATE,
        ot1Multiplier: constants.DEFAULT_OT1_MULTIPLIER,
        ot2Multiplier: constants.DEFAULT_OT2_MULTIPLIER,
        baseMonthSalary: constants.DEFAULT_BASE_MONTH_SALARY,
        welfareAllowance: constants.DEFAULT_WELFARE_ALLOWANCE,
        deductions: constants.DEFAULT_DEDUCTIONS
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
  const addHoliday = async (holiday: { date: string; description: string }) => {
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
    settings: settings || localSettings,
    isLoading,
    updateSettings,
    holidays,
    isHolidaysLoading,
    addHoliday,
    deleteHoliday
  };
}
