import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useSettings } from '@/hooks/useSettings';
import { useAdmin } from '@/hooks/useAdmin';
import { useMemo, useCallback, useEffect, useRef } from 'react';
import { 
  calculateSalary, 
  validateSalaryRecord,
  calculateOvertime 
} from '@/lib/salaryCalculations';

interface SalaryRecord {
  id: number;
  salaryYear: number;
  salaryMonth: number;
  employeeId?: number; // 員工ID，可選
  employeeName?: string; // 員工姓名，可選 
  baseSalary: number;
  housingAllowance: number;
  welfareAllowance?: number; // 福利津貼（總額）
  allowances?: Array<{ name: string; amount: number; description?: string }>; // 津貼明細
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
  attendanceData: Array<{
    date: string;
    clockIn: string;
    clockOut: string;
    isHoliday: boolean;
  }>;
  createdAt: string;
}

/**
 * 薪資數據標準化處理函數
 * 
 * 使用統一的計算模塊來確保所有月份和所有員工（現有和未來）使用一致的計算邏輯
 * 主要功能:
 * 1. 根據各月份的實際加班時數計算正確的加班費
 * 2. 運用特殊規則處理系統，支持不同員工在不同月份的特殊要求
 * 3. 計算並確保總薪資(grossSalary)和實發金額(netSalary)的一致性
 * 4. 為所有員工、所有月份提供標準化計算，便於擴展
 * 5. 支持新增員工的計算正確性
 */
function recalculateSalaryWithAccountingMethod(record: SalaryRecord, settings: any): SalaryRecord {
  if (!record || !settings) return record;
  
  // 確保有員工ID，如果沒有則使用預設值
  const employeeId = record.employeeId || 1;
  
  // 創建計算設置物件（與後端格式一致）
  const calculationSettings = {
    baseHourlyRate: settings.baseHourlyRate,
    ot1Multiplier: settings.ot1Multiplier,
    ot2Multiplier: settings.ot2Multiplier,
    baseMonthSalary: settings.baseMonthSalary,
    welfareAllowance: settings.welfareAllowance
  };
  
  // 檢查記錄是否需要標準化修正 - 考慮員工ID、年份和月份
  const isValid = validateSalaryRecord(
    record.salaryYear, 
    record.salaryMonth, 
    {
      totalOT1Hours: record.totalOT1Hours,
      totalOT2Hours: record.totalOT2Hours,
      totalOvertimePay: record.totalOvertimePay,
      grossSalary: record.grossSalary,
      netSalary: record.netSalary,
      baseSalary: record.baseSalary,
      welfareAllowance: record.welfareAllowance,
      housingAllowance: record.housingAllowance
    }, 
    record.totalDeductions,
    calculationSettings,
    employeeId
  );
  
  // 如果記錄已經是有效的，則直接返回
  if (isValid) {
    return record;
  }
  
  // 計算正確的薪資數據 - 使用標準計算函數
  const salaryResult = calculateSalary(
    record.salaryYear,
    record.salaryMonth,
    { 
      totalOT1Hours: record.totalOT1Hours, 
      totalOT2Hours: record.totalOT2Hours 
    },
    record.baseSalary,
    record.totalDeductions,
    calculationSettings,
    record.totalHolidayPay || 0,
    record.welfareAllowance,
    record.housingAllowance || 0,
    employeeId
  );
  
  // 輸出日誌以供檢查 - 包含員工ID資訊
  console.log(`修正員工ID:${employeeId} ${record.employeeName || ''} ${record.salaryYear}年${record.salaryMonth}月薪資數據:`, salaryResult);
  
  // 返回修正後的記錄
  return {
    ...record,
    totalOT1Hours: salaryResult.totalOT1Hours,
    totalOT2Hours: salaryResult.totalOT2Hours,
    totalOvertimePay: salaryResult.totalOvertimePay,
    grossSalary: salaryResult.grossSalary,
    netSalary: salaryResult.netSalary
  };
}

export function useHistoryData() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { settings } = useSettings();
  const { isAdmin } = useAdmin();
  
  // Fetch all salary records
  const { 
    data: rawSalaryRecords = [], 
    isLoading,
    error,
    refetch
  } = useQuery<SalaryRecord[]>({
    queryKey: ['/api/salary-records'],
    enabled: isAdmin
  });
  
  // 暫時停用重新計算以修復CSV下載問題 - 直接使用資料庫中的正確數值
  const salaryRecords = useMemo(() => {
    // 直接返回原始資料庫記錄，避免計算錯誤導致實發金額變為0
    return rawSalaryRecords;
  }, [rawSalaryRecords]);
  
  // Delete a salary record
  const deleteSalaryRecordMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/salary-records/${id}`, undefined);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/salary-records'] });
      toast({
        title: "刪除成功",
        description: "薪資紀錄已成功刪除",
      });
    },
    onError: (error) => {
      console.error('Error deleting salary record:', error);
      toast({
        title: "刪除失敗",
        description: "無法刪除薪資紀錄，請稍後再試",
        variant: "destructive"
      });
    }
  });
  
  // Update a salary record
  const updateSalaryRecordMutation = useMutation({
    mutationFn: async ({ id, data, forceUpdate = false }: { id: number; data: Partial<Omit<SalaryRecord, 'id' | 'createdAt'>>; forceUpdate?: boolean }) => {
      const response = await apiRequest(
        'PATCH',
        `/api/salary-records/${id}`,
        data,
        forceUpdate
          ? {
              headers: {
                'x-force-update': 'true'
              }
            }
          : undefined
      );
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/salary-records'] });
      console.log("薪資紀錄更新成功");
    },
    onError: (error) => {
      console.error('Error updating salary record:', error);
      toast({
        title: "更新失敗",
        description: "無法更新薪資紀錄，請稍後再試",
        variant: "destructive"
      });
    }
  });

  const deleteSalaryRecord = async (id: number) => {
    return await deleteSalaryRecordMutation.mutateAsync(id);
  };
  
  // 更新薪資紀錄，支援 forceUpdate 選項以跳過伺服器端重新計算
  const updateSalaryRecord = async (id: number, data: Partial<Omit<SalaryRecord, 'id' | 'createdAt'>>, forceUpdate = true) => {
    return await updateSalaryRecordMutation.mutateAsync({ id, data, forceUpdate });
  };
  
  // 單獨的函數來更新數據庫中的薪資記錄 - 使用統一的計算模塊
  const fixAndUpdateSalaryRecords = useCallback(async () => {
    if (!isAdmin || !settings || !rawSalaryRecords.length) return;
    
    // 已修正的月份計數
    let fixedCount = 0;
    
    // 尋找需要更新的記錄
    for (const record of rawSalaryRecords) {
      // 檢查記錄是否需要標準化修正
      const isValid = validateSalaryRecord(
        record.salaryYear, 
        record.salaryMonth, 
        {
          totalOT1Hours: record.totalOT1Hours,
          totalOT2Hours: record.totalOT2Hours,
          totalOvertimePay: record.totalOvertimePay,
          grossSalary: record.grossSalary,
          netSalary: record.netSalary,
          baseSalary: record.baseSalary,
          welfareAllowance: record.welfareAllowance,
          housingAllowance: record.housingAllowance
        }, 
        record.totalDeductions,
        settings,
        record.employeeId || 1
      );
      
      // 如果記錄已經是有效的，則跳過
      if (isValid) continue;
      
      // 計算正確的薪資數據
      const salaryResult = calculateSalary(
        record.salaryYear,
        record.salaryMonth,
        { 
          totalOT1Hours: record.totalOT1Hours, 
          totalOT2Hours: record.totalOT2Hours 
        },
        record.baseSalary,
        record.totalDeductions,
        settings,
        record.totalHolidayPay,
        record.welfareAllowance,
        record.housingAllowance,
        record.employeeId || 1 // 提供員工ID以支持特殊規則
      );
      
      // 創建更新數據對象
      const updatedValues = {
        totalOT1Hours: salaryResult.totalOT1Hours,
        totalOT2Hours: salaryResult.totalOT2Hours,
        totalOvertimePay: salaryResult.totalOvertimePay,
        grossSalary: salaryResult.grossSalary,
        netSalary: salaryResult.netSalary
      };
      
      console.log(`需要更新${record.salaryYear}年${record.salaryMonth}月薪資記錄到數據庫:`, updatedValues);
      
      try {
        console.log(`正在更新數據庫中${record.salaryYear}年${record.salaryMonth}月的薪資記錄...`);
        await updateSalaryRecord(record.id, updatedValues);
        console.log(`成功更新${record.salaryYear}年${record.salaryMonth}月的薪資記錄`);
        
        // 計數已修正的月份
        fixedCount++;
        
        // 不再顯示每個階段的通知，避免干擾用戶界面
        // 注釋掉通知代碼，僅保留記錄功能
        /*
        if (fixedCount === 1) {
          toast({
            title: "薪資數據修正中",
            description: `正在套用統一計算標準至所有薪資記錄...`,
          });
        }
        */
      } catch (error) {
        console.error(`更新${record.salaryYear}年${record.salaryMonth}月薪資記錄失敗:`, error);
      }
    }
    
    // 不再顯示完成通知，避免干擾用戶界面
    // 注釋掉通知代碼，僅保留記錄功能
    if (fixedCount > 0) {
      console.log(`薪資數據標準化完成：已修正 ${fixedCount} 筆薪資記錄`);
      /*
      toast({
        title: "薪資數據標準化完成",
        description: `已修正 ${fixedCount} 筆薪資記錄，確保所有月份使用統一的計算邏輯`,
      });
      */
    }
  }, [isAdmin, rawSalaryRecords, settings, updateSalaryRecord, toast]);
  
  // 當數據加載完成後，檢查並更新薪資記錄
  // 使用ref來追蹤是否已執行過修正，避免循環更新
  const hasFixedRecordsRef = useRef(false);
  
  useEffect(() => {
    // 重置標記，強制執行修正
    hasFixedRecordsRef.current = false;
    
    if (!isAdmin) {
      return;
    }

    if (!isLoading && rawSalaryRecords.length > 0 && !hasFixedRecordsRef.current && settings) {
      // 設置標記，表示已經執行過修正
      hasFixedRecordsRef.current = true;
      fixAndUpdateSalaryRecords();
    }
  }, [isAdmin, isLoading, rawSalaryRecords, settings, fixAndUpdateSalaryRecords]);
  
  // Fetch a specific salary record by ID - 直接返回資料庫原始數據
  const getSalaryRecordById = useCallback(async (id: number) => {
    if (!isAdmin) {
      throw new Error('需要管理員權限才能讀取薪資紀錄');
    }

    try {
      const response = await apiRequest('GET', `/api/salary-records/${id}`, undefined);
      const record = await response.json() as SalaryRecord;
      
      // 直接返回原始資料庫記錄，避免計算錯誤
      console.log('獲取薪資記錄ID:', id, '實發金額:', record.netSalary);
      return record;
    } catch (error) {
      console.error('Error fetching salary record:', error);
      toast({
        title: "資料載入失敗",
        description: "無法取得薪資紀錄詳情，請稍後再試。",
        variant: "destructive"
      });
      throw error;
    }
  }, [isAdmin, toast]);
  
  // Check for errors in data fetching
  if (error && isAdmin) {
    console.error("Error fetching salary records:", error);
    toast({
      title: "資料載入失敗",
      description: "無法取得歷史薪資紀錄，請稍後再試。",
      variant: "destructive"
    });
  }
  
  // 增強版 CSV 匯出功能 - 匯出詳細考勤記錄
  // 注意：此功能已經淘汰，僅保留作為參考。使用者應使用批量下載 ZIP 功能代替
  // 此方法有bug - 只會下載最新月份，而不是使用者選擇的月份
  const exportSalaryRecordAsCsv = (record: SalaryRecord) => {
    try {
      // 統一的CSV格式 - 包含薪資摘要和詳細考勤記錄
      let csvContent = `員工薪資記錄 - ${record.salaryYear}年${record.salaryMonth}月\n`;
      csvContent += `員工姓名,${record.employeeName || ''}\n`;
      csvContent += `薪資年份,${record.salaryYear}\n`;
      csvContent += `薪資月份,${record.salaryMonth}\n\n`;
      
      // 安全數值轉換函數
      const safeNumber = (value: any): number => {
        if (value === null || value === undefined) return 0;
        const num = Number(value);
        return isNaN(num) ? 0 : num;
      };
      
      // 調試記錄實發金額
      console.log('CSV 下載 - 檢查實發金額:', {
        netSalary: record.netSalary,
        safeNetSalary: safeNumber(record.netSalary),
        grossSalary: record.grossSalary,
        totalDeductions: record.totalDeductions
      });
      
      // 薪資摘要
      csvContent += "薪資摘要\n";
      csvContent += `基本底薪,${safeNumber(record.baseSalary)}\n`;
      csvContent += `住宿津貼,${safeNumber(record.housingAllowance)}\n`;
      csvContent += `福利津貼,${safeNumber(record.welfareAllowance)}\n`;
      csvContent += `加班總時數OT1,${safeNumber(record.totalOT1Hours)}\n`;
      csvContent += `加班總時數OT2,${safeNumber(record.totalOT2Hours)}\n`;
      csvContent += `加班總費用,${safeNumber(record.totalOvertimePay)}\n`;
      csvContent += `假日天數,${safeNumber(record.holidayDays)}\n`;
      csvContent += `假日總薪資,${safeNumber(record.totalHolidayPay)}\n`;
      csvContent += `總薪資,${safeNumber(record.grossSalary)}\n`;
      csvContent += `總扣除額,${safeNumber(record.totalDeductions)}\n`;
      csvContent += `實領金額,${safeNumber(record.netSalary)}\n\n`;
      
      // 扣除項明細
      csvContent += "扣除項明細\n";
      csvContent += "項目,金額\n";
      if (record.deductions && Array.isArray(record.deductions)) {
        record.deductions.forEach(deduction => {
          const deductionName = deduction.name || '未知扣除項';
          const deductionAmount = safeNumber(deduction.amount);
          csvContent += `${deductionName},${deductionAmount}\n`;
        });
      }
      
      csvContent += "\n考勤詳細記錄\n";
      csvContent += "日期,上班時間,下班時間,是否假日,OT1時數,OT2時數,當日加班費\n";
      
      // 計算每條記錄的加班詳情
      record.attendanceData.forEach(attendance => {
        // 計算加班時數
        const { ot1, ot2 } = calculateOvertime(attendance.clockIn, attendance.clockOut);
        
        // 計算總工作時數 - 增強錯誤處理
        let totalHours = 0;
        try {
          if (attendance.clockIn && attendance.clockOut && 
              attendance.clockIn.includes(':') && attendance.clockOut.includes(':')) {
            const [inHours, inMinutes] = attendance.clockIn.split(':').map(Number);
            const [outHours, outMinutes] = attendance.clockOut.split(':').map(Number);
            
            // 驗證時間格式
            if (!isNaN(inHours) && !isNaN(inMinutes) && !isNaN(outHours) && !isNaN(outMinutes)) {
              let totalMinutes = (outHours * 60 + outMinutes) - (inHours * 60 + inMinutes);
              if (totalMinutes < 0) totalMinutes += 24 * 60;
              totalHours = totalMinutes / 60;
            }
          }
        } catch (error) {
          console.error('Error calculating total hours:', error);
          totalHours = 0;
        }
        
        // 使用會計部門計算方法計算加班費
        const baseHourlyRate = 119; // 基本時薪
        const ot1HourlyRate = baseHourlyRate * 1.34;
        const ot2HourlyRate = baseHourlyRate * 1.67;
        
        // 確保所有計算值都是有效數字
        const safeOt1 = isNaN(ot1) ? 0 : ot1;
        const safeOt2 = isNaN(ot2) ? 0 : ot2;
        const ot1Pay = Math.round(ot1HourlyRate * safeOt1);
        const ot2Pay = Math.round(ot2HourlyRate * safeOt2);
        const dailyOTPay = ot1Pay + ot2Pay;
        
        // 確保所有數值安全
        const safeDailyOTPay = safeNumber(dailyOTPay);
        
        // 統一格式的考勤記錄行
        csvContent += `${attendance.date || ''},${attendance.clockIn || ''},${attendance.clockOut || ''},${attendance.isHoliday ? "是" : "否"},${safeOt1.toFixed(1)},${safeOt2.toFixed(1)},${safeDailyOTPay}\n`;
      });
      
      // 生成單一統一格式的CSV文件
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `薪資記錄_${record.employeeName}_${record.salaryYear}年${record.salaryMonth}月.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      
      // 清理資源
      setTimeout(() => {
        URL.revokeObjectURL(url);
        document.body.removeChild(link);
        
        toast({
          title: "匯出成功",
          description: `${record.salaryYear}年${record.salaryMonth}月薪資記錄已匯出，包含完整薪資摘要和考勤詳細資料。`,
        });
      }, 500);
    } catch (error) {
      console.error('Error exporting salary record as CSV:', error);
      toast({
        title: "匯出失敗",
        description: "無法匯出薪資紀錄，請稍後再試。",
        variant: "destructive"
      });
    }
  };

  return {
    salaryRecords,
    isLoading,
    refetch,
    getSalaryRecordById,
    exportSalaryRecordAsCsv,
    deleteSalaryRecord,
    updateSalaryRecord,
    isDeletingRecord: deleteSalaryRecordMutation.isPending,
    isUpdatingRecord: updateSalaryRecordMutation.isPending
  };
}
