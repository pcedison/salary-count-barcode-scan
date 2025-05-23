import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useSettings } from '@/hooks/useSettings';
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
  welfareAllowance?: number; // 福利津貼
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
    employeeId // 明確提供員工ID
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
    record.totalHolidayPay,
    record.welfareAllowance,
    record.housingAllowance,
    employeeId // 明確提供員工ID
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
  
  // Fetch all salary records
  const { 
    data: rawSalaryRecords = [], 
    isLoading,
    error,
    refetch
  } = useQuery<SalaryRecord[]>({
    queryKey: ['/api/salary-records']
  });
  
  // 使用會計部門的方法重新計算所有薪資記錄
  const salaryRecords = useMemo(() => {
    if (!settings || !rawSalaryRecords.length) return rawSalaryRecords;
    
    // 只進行前端顯示修正
    return rawSalaryRecords.map(record => 
      recalculateSalaryWithAccountingMethod(record, settings)
    );
  }, [rawSalaryRecords, settings]);
  
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
    mutationFn: async ({ id, data }: { id: number; data: Partial<Omit<SalaryRecord, 'id' | 'createdAt'>> }) => {
      const response = await apiRequest('PATCH', `/api/salary-records/${id}`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/salary-records'] });
      // 移除自動通知，只在必要時顯示通知
      console.log("薪資紀錄更新成功");
      // 移除以下通知，避免不必要的彈出窗口
      /*
      toast({
        title: "更新成功",
        description: "薪資紀錄已成功更新",
      });
      */
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
  
  const updateSalaryRecord = async (id: number, data: Partial<Omit<SalaryRecord, 'id' | 'createdAt'>>) => {
    return await updateSalaryRecordMutation.mutateAsync({ id, data });
  };
  
  // 單獨的函數來更新數據庫中的薪資記錄 - 使用統一的計算模塊
  const fixAndUpdateSalaryRecords = useCallback(async () => {
    if (!settings || !rawSalaryRecords.length) return;
    
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
  }, [rawSalaryRecords, settings, updateSalaryRecord, toast]);
  
  // 當數據加載完成後，檢查並更新薪資記錄
  // 使用ref來追蹤是否已執行過修正，避免循環更新
  const hasFixedRecordsRef = useRef(false);
  
  useEffect(() => {
    // 重置標記，強制執行修正
    hasFixedRecordsRef.current = false;
    
    if (!isLoading && rawSalaryRecords.length > 0 && !hasFixedRecordsRef.current && settings) {
      // 設置標記，表示已經執行過修正
      hasFixedRecordsRef.current = true;
      fixAndUpdateSalaryRecords();
    }
  }, [isLoading, rawSalaryRecords, settings]);
  
  // Fetch a specific salary record by ID and recalculate using the accounting method
  const getSalaryRecordById = async (id: number) => {
    try {
      const response = await apiRequest('GET', `/api/salary-records/${id}`, undefined);
      const record = await response.json() as SalaryRecord;
      
      // 如果設定可用，使用會計部門的方法重新計算薪資
      if (settings) {
        console.log('使用會計部門計算方法重新計算薪資');
        // 返回使用會計部門計算方法重新計算的薪資
        return recalculateSalaryWithAccountingMethod(record, settings);
      }
      
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
  };
  
  // Check for errors in data fetching
  if (error) {
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
      // 考勤數據CSV (基本版)
      let attendanceCsvContent = "日期,上班時間,下班時間,工作小時,第一階段加班,第二階段加班,加班費\n";
      
      // 詳細薪資資料CSV (完整版)
      let fullRecordCsvContent = `薪資年份,薪資月份,基本底薪,住宿津貼,福利津貼,加班總時數OT1,加班總時數OT2,加班總費用,假日天數,假日單日薪資,假日總薪資,總薪資,總扣除額,實領金額\n`;
      fullRecordCsvContent += `${record.salaryYear},${record.salaryMonth},${record.baseSalary},${record.housingAllowance || 0},${record.welfareAllowance || 0},${record.totalOT1Hours},${record.totalOT2Hours},${record.totalOvertimePay},${record.holidayDays},${record.holidayDailySalary},${record.totalHolidayPay},${record.grossSalary},${record.totalDeductions},${record.netSalary}\n\n`;
      
      // 添加扣除項
      fullRecordCsvContent += "扣除項目,金額\n";
      record.deductions.forEach(deduction => {
        fullRecordCsvContent += `${deduction.name},${deduction.amount}\n`;
      });
      
      fullRecordCsvContent += "\n考勤詳細記錄:\n日期,上班時間,下班時間,是否假日,OT1時數,OT2時數,加班費用\n";
      
      // 計算每條記錄的加班詳情
      record.attendanceData.forEach(attendance => {
        // 計算加班時數
        const { ot1, ot2 } = calculateOvertime(attendance.clockIn, attendance.clockOut);
        
        // 計算總工作時數
        const [inHours, inMinutes] = attendance.clockIn.split(':').map(Number);
        const [outHours, outMinutes] = attendance.clockOut.split(':').map(Number);
        let totalMinutes = (outHours * 60 + outMinutes) - (inHours * 60 + inMinutes);
        if (totalMinutes < 0) totalMinutes += 24 * 60;
        const totalHours = totalMinutes / 60;
        
        // 使用會計部門計算方法計算加班費
        const baseHourlyRate = 119; // 基本時薪
        const ot1HourlyRate = baseHourlyRate * 1.34;
        const ot2HourlyRate = baseHourlyRate * 1.67;
        const dailyOTPay = Math.round((ot1HourlyRate * ot1) + (ot2HourlyRate * ot2));
        
        // 基本版
        attendanceCsvContent += `${attendance.date},${attendance.clockIn},${attendance.clockOut},${totalHours.toFixed(1)},${ot1.toFixed(1)},${ot2.toFixed(1)},${dailyOTPay}\n`;
        
        // 完整版
        fullRecordCsvContent += `${attendance.date},${attendance.clockIn},${attendance.clockOut},${attendance.isHoliday ? "是" : "否"},${ot1.toFixed(1)},${ot2.toFixed(1)},${dailyOTPay}\n`;
      });
      
      // 建立兩個文件供下載
      // 1. 簡易版 - 只包含考勤數據
      const attendanceBlob = new Blob([attendanceCsvContent], { type: 'text/csv;charset=utf-8;' });
      const attendanceUrl = URL.createObjectURL(attendanceBlob);
      const attendanceLink = document.createElement('a');
      attendanceLink.setAttribute('href', attendanceUrl);
      attendanceLink.setAttribute('download', `考勤記錄_${record.salaryYear}年${record.salaryMonth}月.csv`);
      attendanceLink.style.visibility = 'hidden';
      document.body.appendChild(attendanceLink);
      attendanceLink.click();
      
      // 2. 完整版 - 包含所有薪資數據與考勤記錄
      const fullDataBlob = new Blob([fullRecordCsvContent], { type: 'text/csv;charset=utf-8;' });
      const fullDataUrl = URL.createObjectURL(fullDataBlob);
      const fullDataLink = document.createElement('a');
      fullDataLink.setAttribute('href', fullDataUrl);
      fullDataLink.setAttribute('download', `完整薪資記錄_${record.salaryYear}年${record.salaryMonth}月.csv`);
      fullDataLink.style.visibility = 'hidden';
      document.body.appendChild(fullDataLink);
      
      // 延遲下載第二個文件，避免瀏覽器阻擋
      setTimeout(() => {
        fullDataLink.click();
        document.body.removeChild(attendanceLink);
        document.body.removeChild(fullDataLink);
        
        toast({
          title: "匯出成功",
          description: `${record.salaryYear}年${record.salaryMonth}月薪資記錄已匯出為兩個CSV檔案，分別包含基本考勤資料和完整薪資記錄。`,
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