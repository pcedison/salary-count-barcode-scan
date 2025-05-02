import { useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { 
  calculateSalary, 
  validateSalaryRecord
} from '@/lib/salaryCalculations';

/**
 * 薪資數據修復按鈕
 * 
 * 使用統一計算模塊修正薪資計算中的問題：
 * 1. 加班費計算修正 - 使用統一計算邏輯
 * 2. 加班時數分配調整 - 正確區分一階段(1.34倍)和二階段(1.67倍)加班
 * 3. 實發薪資修正 - 確保與列印文件一致
 * 4. 針對現有和未來的月份自動應用標準化計算邏輯
 */
export default function SalaryDataFixButton() {
  const [isFixing, setIsFixing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { settings } = useSettings();

  // 修復數據庫中的薪資數據 - 使用統一計算模塊
  const fixSalaryData = async () => {
    setIsFixing(true);
    try {
      if (!settings) {
        toast({
          title: "無法獲取設定",
          description: "無法獲取薪資計算設定，請稍後再試",
          variant: "destructive"
        });
        setIsFixing(false);
        return;
      }
      
      // 獲取所有薪資記錄
      const response = await apiRequest('GET', '/api/salary-records', undefined);
      const records = await response.json();
      
      let fixed = 0;
      const fixedMonths: string[] = [];
      
      // 檢查並修正所有月份的薪資記錄
      for (const record of records) {
        // 驗證薪資記錄是否需要修正
        const isValid = validateSalaryRecord(record.salaryYear, record.salaryMonth, {
          totalOT1Hours: record.totalOT1Hours,
          totalOT2Hours: record.totalOT2Hours,
          totalOvertimePay: record.totalOvertimePay,
          grossSalary: record.grossSalary,
          netSalary: record.netSalary
        }, settings);
        
        // 如果記錄已經正確，跳過
        if (isValid) continue;
        
        // 使用統一計算模塊計算正確的薪資數據
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
          record.housingAllowance
        );
        
        // 創建更新數據對象
        const updatedValues = {
          totalOT1Hours: salaryResult.totalOT1Hours,
          totalOT2Hours: salaryResult.totalOT2Hours,
          totalOvertimePay: salaryResult.totalOvertimePay,
          grossSalary: salaryResult.grossSalary,
          netSalary: salaryResult.netSalary
        };
        
        console.log(`套用標準化計算至${record.salaryYear}年${record.salaryMonth}月薪資記錄(ID: ${record.id}):`, updatedValues);
        await apiRequest('PATCH', `/api/salary-records/${record.id}`, updatedValues);
        fixed++;
        fixedMonths.push(`${record.salaryYear}年${record.salaryMonth}月`);
      }
      
      // 刷新數據
      queryClient.invalidateQueries({ queryKey: ['/api/salary-records'] });
      
      if (fixed > 0) {
        toast({
          title: "薪資數據標準化完成",
          description: `已成功修正 ${fixed} 筆薪資記錄，套用統一計算標準`,
        });
      } else {
        toast({
          title: "薪資數據已是最新",
          description: "所有薪資記錄都已符合標準化計算要求，無需修正",
        });
      }
    } catch (error) {
      console.error('修正薪資數據時發生錯誤:', error);
      toast({
        title: "標準化失敗",
        description: "薪資數據標準化過程中發生錯誤，請稍後再試",
        variant: "destructive"
      });
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <Button 
      variant="outline" 
      onClick={fixSalaryData} 
      disabled={isFixing}
      className="flex items-center bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100 mr-2"
    >
      <AlertTriangle className="w-4 h-4 mr-1" />
      {isFixing ? '標準化薪資中...' : '套用統一計算標準'}
    </Button>
  );
}