import { useState, useEffect, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useSettings } from '@/hooks/useSettings';
import { 
  calculateOvertime, 
  getDeductionAmount, 
  getCurrentYearMonth,
  formatDate
} from '@/lib/utils';

// Define types
interface AttendanceRecord {
  id: number;
  employeeId?: number;           // 員工ID
  _employeeName?: string;        // 員工名稱（暫存用，不存入數據庫）
  _employeeDepartment?: string;  // 員工部門（暫存用，不存入數據庫）
  date: string;
  clockIn: string;
  clockOut: string;
  isHoliday: boolean;
}

interface NewAttendanceRecord {
  date: string;
  clockIn: string;
  clockOut: string;
  isHoliday: boolean;
}

interface SalaryResult {
  salaryYear: number;
  salaryMonth: number;
  employeeId?: number;           // 新增員工ID欄位
  employeeName?: string;         // 新增員工姓名欄位
  baseSalary: number;
  housingAllowance: number;
  welfareAllowance: number;    // 添加福利金字段
  totalOT1Hours: number;
  totalOT2Hours: number;
  totalOvertimePay: number;
  holidayDays: number;
  holidayDailySalary: number;
  totalHolidayPay: number;
  grossSalary: number;
  deductions: Array<{ name: string; amount: number }>;
  totalDeductions: number;
  netSalary: number;
  attendanceData: AttendanceRecord[];
}

export function useAttendanceData() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { settings } = useSettings();
  
  const [salaryResult, setSalaryResult] = useState<SalaryResult | null>(null);
  const [syncStatus, setSyncStatus] = useState<{ synced: boolean; lastSynced: string | null }>({
    synced: true,
    lastSynced: null
  });
  
  // Fetch attendance data
  const { 
    data: attendanceData = [], 
    isLoading,
    error
  } = useQuery({ 
    queryKey: ['/api/attendance'],
    refetchInterval: 5000, // 加快刷新頻率到5秒，以更快獲取打卡更新
    staleTime: 1000 // 縮短緩存的有效時間，使數據更快過期並重新獲取
  });
  
  // Check for errors in data fetching
  useEffect(() => {
    if (error) {
      toast({
        title: "資料載入失敗",
        description: "無法取得考勤資料，請檢查網路連線後重試。",
        variant: "destructive"
      });
      console.error("Error fetching attendance data:", error);
    }
  }, [error, toast]);
  
  // Update sync status when data changes
  useEffect(() => {
    if (!isLoading && !error) {
      setSyncStatus({
        synced: true,
        lastSynced: new Date().toLocaleString()
      });
    } else if (error) {
      setSyncStatus({
        synced: false,
        lastSynced: syncStatus.lastSynced
      });
    }
  }, [attendanceData, isLoading, error]);
  
  // Sort attendance data by date
  const sortedAttendanceData = useMemo(() => {
    if (!Array.isArray(attendanceData) || attendanceData.length === 0) return [];
    
    return [...attendanceData].sort((a, b) => {
      const dateA = new Date(a.date.replace(/\//g, '-'));
      const dateB = new Date(b.date.replace(/\//g, '-'));
      return dateA.getTime() - dateB.getTime();
    });
  }, [attendanceData]);
  
  // Create attendance record
  const createAttendanceMutation = useMutation({
    mutationFn: async (newRecord: NewAttendanceRecord) => {
      const formattedRecord = {
        ...newRecord,
        date: formatDate(newRecord.date) // Ensure date is in YYYY/MM/DD format
      };
      
      return await apiRequest('POST', '/api/attendance', formattedRecord);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/attendance'] });
    },
    onError: (error) => {
      console.error('Error adding attendance record:', error);
      toast({
        title: "新增失敗",
        description: "無法新增考勤記錄，請稍後再試。",
        variant: "destructive"
      });
    }
  });
  
  // Update attendance record
  const updateAttendanceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<NewAttendanceRecord> }) => {
      const formattedData = {
        ...data,
        date: data.date ? formatDate(data.date) : undefined
      };
      
      return await apiRequest('PUT', `/api/attendance/${id}`, formattedData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/attendance'] });
    },
    onError: (error) => {
      console.error('Error updating attendance record:', error);
      toast({
        title: "更新失敗",
        description: "無法更新考勤記錄，請稍後再試。",
        variant: "destructive"
      });
    }
  });
  
  // Delete a single attendance record
  const deleteSingleAttendanceMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest('DELETE', `/api/attendance/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/attendance'] });
    },
    onError: (error) => {
      console.error('Error deleting attendance record:', error);
      toast({
        title: "刪除失敗",
        description: "無法刪除考勤記錄，請稍後再試。",
        variant: "destructive"
      });
    }
  });
  
  // Delete attendance records with optional employee filter
  const deleteFilteredAttendanceMutation = useMutation({
    mutationFn: async ({ ids, employeeId }: { ids?: number[], employeeId?: number }) => {
      if (ids && ids.length > 0) {
        // 刪除特定ID的考勤記錄
        const deletePromises = ids.map(id => apiRequest('DELETE', `/api/attendance/${id}`));
        return Promise.all(deletePromises);
      } else if (employeeId !== undefined) {
        // 刪除特定員工的考勤記錄
        return await apiRequest('DELETE', `/api/attendance/employee/${employeeId}`);
      } else {
        // 刪除所有考勤記錄
        return await apiRequest('DELETE', '/api/attendance');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/attendance'] });
    },
    onError: (error) => {
      console.error('Error deleting attendance records:', error);
      toast({
        title: "清除失敗",
        description: "無法清除指定的考勤記錄，請稍後再試。",
        variant: "destructive"
      });
    }
  });
  
  // Create salary record
  const createSalaryRecordMutation = useMutation({
    mutationFn: async (salaryRecord: any) => {
      return await apiRequest('POST', '/api/salary-records', salaryRecord);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/salary-records'] });
    },
    onError: (error) => {
      console.error('Error creating salary record:', error);
      toast({
        title: "結算失敗",
        description: "無法儲存薪資結算記錄，請稍後再試。",
        variant: "destructive"
      });
    }
  });
  
  // Add a new attendance record
  const addAttendance = async (record: NewAttendanceRecord) => {
    try {
      setSyncStatus({ ...syncStatus, synced: false });
      await createAttendanceMutation.mutateAsync(record);
      return true;
    } catch (error) {
      return false;
    }
  };
  
  // Update an attendance record
  const updateAttendance = async (id: number, data: Partial<NewAttendanceRecord>) => {
    try {
      setSyncStatus({ ...syncStatus, synced: false });
      await updateAttendanceMutation.mutateAsync({ id, data });
      return true;
    } catch (error) {
      return false;
    }
  };
  
  // Delete an attendance record
  const deleteAttendance = async (id: number) => {
    try {
      setSyncStatus({ ...syncStatus, synced: false });
      await deleteSingleAttendanceMutation.mutateAsync(id);
      return true;
    } catch (error) {
      return false;
    }
  };
  
  // Clear all attendance records
  const clearAllData = async () => {
    try {
      setSyncStatus({ ...syncStatus, synced: false });
      await deleteFilteredAttendanceMutation.mutateAsync({});
      setSalaryResult(null);
      return true;
    } catch (error) {
      return false;
    }
  };
  
  // Calculate salary based on attendance records - now accepts filtered data
  const calculateSalary = (dataToUse?: any[]) => {
    // 使用傳入的數據或默認使用所有數據
    const recordsToProcess = dataToUse || attendanceData;
    
    if (!Array.isArray(recordsToProcess) || recordsToProcess.length === 0 || !settings) {
      toast({
        title: "無法計算",
        description: "沒有考勤記錄或設定資料不完整。",
        variant: "destructive"
      });
      return null;
    }
    
    try {
      // Extract settings
      const baseHourlyRate = settings.baseHourlyRate || 119;
      const ot1Multiplier = settings.ot1Multiplier || 1.34;
      const ot2Multiplier = settings.ot2Multiplier || 1.67;
      const baseMonthSalary = settings.baseMonthSalary || 28590;
      const welfareAllowance = settings.welfareAllowance || 0; // 從設定中提取福利金，預設為0
      const housingAllowance = 0; // Default to 0 if not provided
      const deductions = settings.deductions || [];
      
      // 對傳入的數據進行排序
      const sortedData = [...recordsToProcess].sort((a, b) => {
        // 對日期進行排序
        const dateA = a.date.split('/').map(Number);
        const dateB = b.date.split('/').map(Number);
        
        // 先比較年
        if (dateA[0] !== dateB[0]) return dateA[0] - dateB[0];
        // 再比較月
        if (dateA[1] !== dateB[1]) return dateA[1] - dateB[1];
        // 最後比較日
        return dateA[2] - dateB[2];
      });
      
      // Separate normal days and holidays
      const normalDays = sortedData.filter(day => !day.isHoliday);
      const holidayDays = sortedData.filter(day => day.isHoliday);
      
      // Calculate overtime hours and pay
      let totalOT1Hours = 0;
      let totalOT2Hours = 0;
      
      normalDays.forEach(day => {
        const { ot1, ot2 } = calculateOvertime(day.clockIn, day.clockOut);
        totalOT1Hours += ot1;
        totalOT2Hours += ot2;
      });
      
      // 使用會計部門的計算方法 - 修正計算邏輯：
      // 1. 每小時加班費率先無條件進位到整數
      // 2. 乘以小時數得到總金額
      // 3. 最終結果使用四捨五入確保整數
      const ot1HourlyRate = baseHourlyRate * ot1Multiplier;
      const ot2HourlyRate = baseHourlyRate * ot2Multiplier;
      const ot1PayCeiled = Math.ceil(ot1HourlyRate) * totalOT1Hours;
      const ot2PayCeiled = Math.ceil(ot2HourlyRate) * totalOT2Hours;
      
      // 移除固定調整金額，改用四捨五入確保加班費的一致性和準確性
      const totalOvertimePay = Math.round(ot1PayCeiled + ot2PayCeiled);
      
      // Calculate holiday pay
      const holidayDailySalary = Math.ceil(baseMonthSalary / 30); // Daily rate based on monthly salary (使用無條件進位)
      const totalHolidayPay = Math.round(holidayDays.length * holidayDailySalary); // 使用四捨五入確保整數
      
      // Calculate gross salary
      const grossSalary = Math.round(baseMonthSalary + housingAllowance + welfareAllowance + totalOvertimePay + totalHolidayPay);
      
      // Calculate deductions
      const totalDeductions = deductions.reduce((sum: number, deduction: { name: string; amount: number }) => sum + deduction.amount, 0);
      
      // Calculate net salary - 修正實發金額的計算，確保將加班費差異正確反映在實發金額中
      const netSalary = Math.round(grossSalary - totalDeductions);
      
      // Get year and month for the salary record based on attendance records
      // Extract from first record if available, otherwise use current date
      let salaryYear, salaryMonth;
      
      if (sortedData.length > 0) {
        const firstRecordDate = sortedData[0].date.split('/');
        salaryYear = parseInt(firstRecordDate[0]);
        salaryMonth = parseInt(firstRecordDate[1]);
      } else {
        const { year, month } = getCurrentYearMonth();
        salaryYear = year;
        salaryMonth = month;
      }
      
      // 獲取員工資訊以添加到結果中
      const employeeInfo = sortedData.length > 0 && sortedData[0].employeeId ? 
        {
          employeeId: sortedData[0].employeeId,
          employeeName: sortedData[0]._employeeName || '未知員工'
        } : undefined;
      
      // Prepare result
      const result: SalaryResult = {
        salaryYear: salaryYear,
        salaryMonth: salaryMonth,
        baseSalary: baseMonthSalary,
        housingAllowance,
        welfareAllowance,  // 添加福利金到結果中
        totalOT1Hours,
        totalOT2Hours,
        totalOvertimePay,
        holidayDays: holidayDays.length,
        holidayDailySalary,
        totalHolidayPay,
        grossSalary,
        deductions: deductions.map((d: { name: string; amount: number; description?: string }) => ({ name: d.name, amount: d.amount })),
        totalDeductions,
        netSalary,
        attendanceData: sortedData,
        ...(employeeInfo ? employeeInfo : {})
      };
      
      // Save result
      setSalaryResult(result);
      return result;
    } catch (error) {
      console.error('Error calculating salary:', error);
      toast({
        title: "計算錯誤",
        description: "薪資計算過程中發生錯誤，請稍後再試。",
        variant: "destructive"
      });
      return null;
    }
  };
  
  // Finalize and save salary record - 全面重構版，支持多位員工獨立結算
  const finalizeAndSave = async () => {
    if (!salaryResult) {
      toast({
        title: "無法結算",
        description: "請先計算薪資。",
        variant: "destructive"
      });
      return false;
    }
    
    try {
      // 全部考勤記錄
      const allAttendanceData = attendanceData as AttendanceRecord[];
      
      // 檢查是否為單一員工模式或全部員工模式
      const isSingleEmployeeMode = salaryResult.attendanceData && 
                                 salaryResult.attendanceData.length > 0 && 
                                 salaryResult.attendanceData.every(record => 
                                   (record as any).employeeId === (salaryResult.attendanceData[0] as any).employeeId);
      
      // 單一員工模式 - 直接保存當前薪資結果並只刪除該員工的考勤記錄
      if (isSingleEmployeeMode) {
        // 創建包含員工信息的記錄
        const singleRecord: any = { ...salaryResult };
        
        // 從考勤數據中提取員工信息
        if (singleRecord.attendanceData && singleRecord.attendanceData.length > 0) {
          const employeeData = singleRecord.attendanceData[0];
          singleRecord.employeeId = employeeData.employeeId;
          singleRecord.employeeName = employeeData._employeeName || `員工 ID: ${employeeData.employeeId}`;
          console.log(`保存單一員工薪資記錄: ${singleRecord.employeeName} (ID: ${singleRecord.employeeId})`);
        
          // 保存薪資記錄
          await createSalaryRecordMutation.mutateAsync(singleRecord);
          
          // 只刪除處理過的員工的考勤記錄，保留其他員工的記錄
          if (singleRecord.employeeId) {
            await deleteFilteredAttendanceMutation.mutateAsync({ employeeId: singleRecord.employeeId });
            console.log(`已刪除員工 ${singleRecord.employeeName} (ID: ${singleRecord.employeeId}) 的考勤記錄`);
          }
        } else {
          await createSalaryRecordMutation.mutateAsync(singleRecord);
        }
      } 
      // 全部員工模式 - 為每位員工生成單獨的薪資記錄
      else {
        // 按員工ID分組考勤數據
        const employeeMap: Record<number, any[]> = {};
        
        allAttendanceData.forEach((record: AttendanceRecord) => {
          if ((record as any).employeeId) {
            const employeeId = (record as any).employeeId as number;
            if (!employeeMap[employeeId]) {
              employeeMap[employeeId] = [];
            }
            employeeMap[employeeId].push(record);
          }
        });
        
        // 為每位員工計算並保存薪資記錄
        const employeeIds = Object.keys(employeeMap).map(Number);
        
        if (employeeIds.length === 0) {
          toast({
            title: "結算失敗",
            description: "無法識別員工信息，請確保考勤記錄包含員工ID。",
            variant: "destructive"
          });
          return false;
        }
        
        console.log(`處理 ${employeeIds.length} 位員工的薪資結算...`);
        
        // 依次計算每位員工的薪資並保存
        for (const employeeId of employeeIds) {
          const employeeAttendance = employeeMap[employeeId];
          
          if (employeeAttendance.length === 0) continue;
          
          // 計算當前員工的薪資
          const employeeResult = calculateSalary(employeeAttendance);
          
          if (employeeResult) {
            // 添加員工信息
            const recordToSave: any = { ...employeeResult };
            recordToSave.employeeId = employeeId;
            recordToSave.employeeName = employeeAttendance[0]._employeeName || `員工 ID: ${employeeId}`;
            
            console.log(`保存員工薪資記錄: ${recordToSave.employeeName} (ID: ${recordToSave.employeeId})`);
            
            // 保存薪資記錄
            await createSalaryRecordMutation.mutateAsync(recordToSave);
          }
        }
        
        // 全部員工模式下，清除所有處理過的考勤記錄
        await deleteFilteredAttendanceMutation.mutateAsync({});
        console.log('所有臨時考勤記錄已清除');
      }
      
      // 重置薪資結果
      setSalaryResult(null);
      
      // 刷新薪資記錄查詢以更新歷史記錄
      queryClient.invalidateQueries({ queryKey: ['/api/salary-records'] });
      
      return true;
    } catch (error) {
      console.error('Error finalizing salary:', error);
      toast({
        title: "結算失敗",
        description: "無法完成薪資結算，請稍後再試。",
        variant: "destructive"
      });
      return false;
    }
  };
  
  return {
    attendanceData: sortedAttendanceData,
    isLoading,
    addAttendance,
    updateAttendance,
    deleteAttendance,
    calculateSalary,
    salaryResult,
    clearAllData,
    finalizeAndSave,
    syncStatus
  };
}
