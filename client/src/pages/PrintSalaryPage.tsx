import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import PrintableSalarySheet from '@/components/PrintableSalarySheet';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Printer, ArrowLeft, Lock, Shield } from 'lucide-react';
import { useHistoryData } from '@/hooks/useHistoryData';
import { useAdmin } from '@/hooks/useAdmin';
import AdminLoginDialog from '@/components/AdminLoginDialog';
import { calculateOvertime, calculateDailyOvertimePay } from '@/lib/salaryCalculations';

export default function PrintSalaryPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isAdmin } = useAdmin();
  const { getSalaryRecordById } = useHistoryData();
  const [salaryRecord, setSalaryRecord] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdminDialogOpen, setIsAdminDialogOpen] = useState(false);
  
  // 從URL獲取記錄ID - 改善錯誤處理
  const getRecordIdFromUrl = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const idParam = urlParams.get('id');
    return idParam ? parseInt(idParam, 10) : null;
  };
  
  const recordId = getRecordIdFromUrl();
  
  useEffect(() => {
    // 如果沒有有效的ID，靜默返回歷史頁面而不顯示錯誤訊息
    if (!recordId || isNaN(recordId)) {
      console.log('No valid record ID found, redirecting to history page');
      setLocation('/history');
      return;
    }

    if (!isAdmin) {
      setSalaryRecord(null);
      setIsLoading(false);
      return;
    }
    
    // 載入薪資記錄
    const loadSalaryRecord = async () => {
      try {
        setIsLoading(true);
        const record = await getSalaryRecordById(recordId);
        setSalaryRecord(record);
      } catch (error) {
        console.error('Error loading salary record:', error);
        // 靜默返回歷史頁面，避免顯示錯誤訊息給用戶
        setLocation('/history');
      } finally {
        setIsLoading(false);
      }
    };
    
    loadSalaryRecord();
  }, [isAdmin, recordId, setLocation, getSalaryRecordById]);
  
  // 列印功能 - 使用新的打印視窗和組裝式HTML結構
  const handlePrint = () => {
    // 創建新的列印視窗，只包含我們的薪資表格
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      toast({
        title: "無法開啟列印視窗",
        description: "請檢查瀏覽器是否阻止彈出視窗",
        variant: "destructive"
      });
      return;
    }
    
    // 設定必要的全局樣式
    document.querySelectorAll('style').forEach(styleElement => {
      if (styleElement.textContent?.includes('@media print')) {
        styleElement.setAttribute('media', 'print');
      }
    });
    
    // 按日期排序考勤記錄
    const sortedAttendance = [...salaryRecord.attendanceData].sort((a, b) => {
      return new Date(a.date.replace(/\//g, '-')).getTime() - new Date(b.date.replace(/\//g, '-')).getTime();
    });
    
    // 計算每條記錄的加班詳情
    let totalOT1 = 0;
    let totalOT2 = 0;
    let totalOTPay = 0;
    
    // 獲取扣款項目
    const getDeduction = (name: string): number => {
      const item = salaryRecord.deductions.find((d: {name: string; amount: number}) => d.name === name);
      return item ? item.amount : 0;
    };
    
    // 計算單日加班時數和加班費 - 使用統一計算模組
    const calculateDailyOT = (clockIn: string, clockOut: string): {ot1: number, ot2: number, pay: number} => {
      if (!clockIn || !clockOut || clockIn === '--:--' || clockOut === '--:--') {
        return { ot1: 0, ot2: 0, pay: 0 };
      }
      
      // 使用統一的加班計算函數
      const { ot1, ot2 } = calculateOvertime(clockIn, clockOut);
      
      // 使用統一模組計算加班費
      const pay = calculateDailyOvertimePay(clockIn, clockOut, salaryRecord.baseSalary);
      
      return { ot1, ot2, pay };
    };
    
    // 構建考勤記錄的HTML
    let attendanceRowsHtml = '';
    
    sortedAttendance.forEach(record => {
      // 重新計算每日加班時數和加班費，避免使用可能丟失的記錄資料
      const dailyOT = calculateDailyOT(record.clockIn, record.clockOut);
      const ot1 = dailyOT.ot1;
      const ot2 = dailyOT.ot2;
      const pay = dailyOT.pay;
      
      totalOT1 += ot1;
      totalOT2 += ot2;
      totalOTPay += pay;
      
      const isHolidayClass = record.isHoliday ? 'holiday-row' : '';
      
      attendanceRowsHtml += `
<tr class="${isHolidayClass}">
  <td class="date-cell">${record.date}</td>
  <td class="time-cell">${record.clockIn}</td>
  <td class="time-cell">${record.clockOut}</td>
  <td class="number-cell">${ot1.toFixed(1)}</td>
  <td class="number-cell">${ot2.toFixed(1)}</td>
  <td class="amount-cell">${pay}</td>
</tr>`;
    });
    
    // 構建摘要部分的HTML
    let summaryRowsHtml = `
<tr class="summary-row">
  <td colspan="3">一般加班時數總計：</td>
  <td class="number-cell">${totalOT1.toFixed(1)}</td>
  <td class="number-cell">${totalOT2.toFixed(1)}</td>
  <td class="amount-cell">${totalOTPay}</td>
</tr>`;

    // 添加特休項目（如果存在）
    if (salaryRecord.paidLeaveDays && salaryRecord.paidLeaveDays > 0) {
      summaryRowsHtml += `
<tr class="summary-size-row">
  <td colspan="5">特休：</td>
  <td class="amount-cell">${salaryRecord.paidLeaveDays}天 (有薪假)</td>
</tr>`;
    }

    summaryRowsHtml += `
<tr class="summary-size-row">
  <td colspan="5">假日給薪總計：</td>
  <td class="amount-cell">${salaryRecord.holidayDays > 0 ? salaryRecord.totalHolidayPay : '0'}</td>
</tr>
<tr class="base-salary-row">
  <td colspan="5">基本底薪：</td>
  <td class="amount-cell">${salaryRecord.baseSalary}</td>
</tr>`;
    
    // 添加住宿津貼（如果存在）
    if (salaryRecord.housingAllowance && salaryRecord.housingAllowance > 0) {
      summaryRowsHtml += `
<tr class="summary-size-row">
  <td colspan="5">住宿津貼：</td>
  <td class="amount-cell">${salaryRecord.housingAllowance}</td>
</tr>`;
    }
    
    // 添加津貼明細（如果存在 allowances 陣列則逐項顯示，否則使用舊的 welfareAllowance）
    if (salaryRecord.allowances && salaryRecord.allowances.length > 0) {
      salaryRecord.allowances.forEach((allowance: { name: string; amount: number; description?: string }) => {
        if (allowance.amount > 0) {
          summaryRowsHtml += `
<tr class="summary-size-row welfare-row" style="font-weight: bold;">
  <td colspan="5">${allowance.name}：</td>
  <td class="amount-cell">${allowance.amount}</td>
</tr>`;
        }
      });
    } else if (salaryRecord.welfareAllowance && salaryRecord.welfareAllowance > 0) {
      // 向下相容：如果沒有 allowances 陣列，使用舊的 welfareAllowance 欄位
      summaryRowsHtml += `
<tr class="summary-size-row welfare-row" style="font-weight: bold;">
  <td colspan="5">福利津貼：</td>
  <td class="amount-cell">${salaryRecord.welfareAllowance}</td>
</tr>`;
    }
    
    // 添加扣款項目 - 遍歷所有扣款項目動態顯示
    if (salaryRecord.deductions && salaryRecord.deductions.length > 0) {
      salaryRecord.deductions.forEach((deduction: { name: string; amount: number }) => {
        if (deduction.amount > 0) {
          summaryRowsHtml += `
<tr class="deduction-row summary-size-row">
  <td colspan="5">${deduction.name}：</td>
  <td class="amount-cell">-${deduction.amount}</td>
</tr>`;
        }
      });
    }
    
    summaryRowsHtml += `
<tr class="total-amount summary-size-row">
  <td colspan="5">實領金額：</td>
  <td class="amount-cell">${salaryRecord.netSalary}</td>
</tr>`;
    
    // 構建完整HTML
    const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <title>${salaryRecord.salaryYear}年${salaryRecord.salaryMonth}月薪資單</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: Arial, sans-serif;
      background-color: white;
    }
    
    @page {
      size: A4 portrait;
      margin: 0;
    }
    
    @media print {
      body {
        background-color: white;
      }
      
      .print-page, .print-page * {
        visibility: visible !important;
        color-adjust: exact !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      
      table, tr, td, th, tbody, thead {
        page-break-inside: avoid !important;
      }
    }
    
    .print-page {
      width: 210mm;
      height: 297mm;
      padding: 10mm;
      box-sizing: border-box;
      margin: 0 auto;
      background-color: white;
    }
    
    .header-section {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-bottom: 10px;
    }
    
    .system-title {
      font-size: 16px;
      font-weight: bold;
      margin-bottom: 4px;
    }
    
    .month-title {
      font-size: 32px;
      font-weight: bold;
      margin-top: 0;
      line-height: 1;
    }
    
    .calculation-label {
      text-align: right;
      font-size: 14px;
      color: #666;
    }
    
    .salary-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      margin: 0;
    }
    
    .salary-table th, .salary-table td {
      border: 1px solid #000;
      padding: 2px 5px;
      text-align: left;
      height: 22px;
      line-height: 1.2;
    }
    
    .salary-table th {
      font-weight: normal;
      background-color: #f8f8f8;
      text-align: center;
    }
    
    .number-cell {
      text-align: center;
      white-space: nowrap;
    }
    
    .amount-cell {
      text-align: right;
      white-space: nowrap;
      font-family: monospace;
    }
    
    .date-cell {
      white-space: nowrap;
    }
    
    .time-cell {
      white-space: nowrap;
      text-align: center;
    }
    
    .holiday-row {
      color: red;
    }
    
    .summary-row {
      background-color: #f9f9f9;
      font-weight: 500;
    }
    
    .deduction-row td:last-child {
      color: #e53935;
    }
    
    .total-amount {
      font-weight: bold;
    }
    
    .salary-table tr:nth-child(even):not(.deduction-row):not(.summary-row):not(.total-amount) {
      background-color: #fcfcfc;
    }
    
    @media print {
      .print-button {
        display: none;
      }
    }
    
    .print-button {
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 8px 16px;
      background-color: #0f172a;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
    }
    
    .print-button:hover {
      background-color: #1e293b;
    }
  </style>
</head>
<body>
  <button class="print-button" onclick="window.print(); setTimeout(() => window.close(), 500);">列印</button>
  <div class="print-page">
    <div class="header-section">
      <div>
        <h1 class="system-title">員工薪資計算系統</h1>
        <h2 class="month-title">${salaryRecord.salaryMonth}月考勤打卡</h2>
      </div>
      <div>
        <span class="calculation-label">計算薪資</span>
      </div>
    </div>
    
    <table class="salary-table">
      <thead>
        <tr>
          <th style="width: 90px;">日期</th>
          <th style="width: 70px;">上班時間</th>
          <th style="width: 70px;">下班時間</th>
          <th style="width: 90px;">第一階段加班</th>
          <th style="width: 90px;">第二階段加班</th>
          <th style="width: 110px;">加班/假日薪資</th>
        </tr>
      </thead>
      <tbody>
${attendanceRowsHtml}${summaryRowsHtml}
      </tbody>
    </table>
  </div>
</body>
</html>`;
    
    // 寫入HTML到新視窗
    printWindow.document.open();
    printWindow.document.write(fullHtml);
    printWindow.document.close();
    
    // 等待資源加載完畢後自動列印
    if (navigator.userAgent.indexOf('Chrome') > -1) {
      // Chrome需要一點時間來完全渲染
      setTimeout(() => {
        printWindow.focus();
      }, 250);
    } else {
      printWindow.focus();
    }
  };
  
  // 返回歷史頁面
  const handleBack = () => {
    setLocation('/history');
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center rounded-2xl border bg-white p-10 text-center shadow-sm">
          <div className="mb-6 rounded-full bg-amber-100 p-4 text-amber-700">
            <Lock className="h-10 w-10" />
          </div>
          <h1 className="mb-3 text-2xl font-bold text-gray-900">需要管理員權限</h1>
          <p className="mb-8 max-w-lg text-gray-600">
            薪資單列印包含敏感的薪資與考勤資料，僅限管理員檢視與輸出。
          </p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              返回歷史頁
            </Button>
            <Button onClick={() => setIsAdminDialogOpen(true)}>
              <Shield className="mr-2 h-4 w-4" />
              管理員登入
            </Button>
          </div>

          <AdminLoginDialog
            isOpen={isAdminDialogOpen}
            onClose={() => setIsAdminDialogOpen(false)}
            onSuccess={() => {
              setIsAdminDialogOpen(false);
              toast({
                title: "管理員驗證成功",
                description: "您現在可以檢視並列印薪資單。"
              });
            }}
            title="管理員登入"
            description="請輸入管理員 PIN 碼以列印薪資單。"
          />
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }
  
  if (!salaryRecord) {
    return (
      <div className="text-center p-8">
        <h2 className="text-xl font-bold mb-4">找不到薪資記錄</h2>
        <Button onClick={handleBack}>返回</Button>
      </div>
    );
  }
  
  return (
    <div className="pb-8">
      <div className="sticky top-0 bg-white shadow-sm p-4 mb-4 z-10 no-print">
        <div className="flex justify-between items-center">
          <Button variant="outline" onClick={handleBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            返回
          </Button>
          <div className="space-x-2">
            <Button 
              onClick={handlePrint} 
              className="bg-primary hover:bg-primary/90 text-white"
            >
              <Printer className="w-4 h-4 mr-2" />
              列印薪資單
            </Button>
          </div>
        </div>
      </div>
      
      <PrintableSalarySheet result={salaryRecord} />
    </div>
  );
}
