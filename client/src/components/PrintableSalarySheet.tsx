import React from 'react';
import { calculateOvertime, calculateDailyOvertimePay } from '@/lib/salaryCalculations';
import { constants } from '@/lib/constants';

interface PrintableSalarySheetProps {
  result: {
    salaryYear: number;
    salaryMonth: number;
    baseSalary: number;
    housingAllowance?: number;
    welfareAllowance?: number;
    totalOT1Hours: number;
    totalOT2Hours: number;
    totalOvertimePay: number;
    holidayDays: number;
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
  };
}

// 將時間字串轉換為分鐘數
function timeToMinutesForPrint(timeStr: string): number {
  if (!timeStr || !timeStr.includes(':')) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

export default function PrintableSalarySheet({ result }: PrintableSalarySheetProps) {

// 計算日期對應加班費 - 使用統一模組
const calculateDailyOT = (clockIn: string, clockOut: string): {ot1: number, ot2: number, pay: number} => {
  if (!clockIn || !clockOut) return { ot1: 0, ot2: 0, pay: 0 };
  
  // 使用統一的加班計算函數
  const { ot1, ot2 } = calculateOvertime(clockIn, clockOut);
  
  // 使用共享模組的標準化函數計算加班費
  const dailyOTPay = calculateDailyOvertimePay(clockIn, clockOut, result.baseSalary);
    
  return { 
    ot1, 
    ot2, 
    pay: dailyOTPay
  };
  };
  
  // 按日期排序考勤記錄
  const sortedAttendance = [...result.attendanceData].sort((a, b) => {
    return new Date(a.date.replace(/\//g, '-')).getTime() - new Date(b.date.replace(/\//g, '-')).getTime();
  });

  // 計算每條記錄的加班費
  const attendanceWithOT = sortedAttendance.map(record => {
    const dailyOT = calculateDailyOT(record.clockIn, record.clockOut);
    return {
      ...record,
      ot1: dailyOT.ot1,
      ot2: dailyOT.ot2,
      pay: dailyOT.pay
    };
  });

  // 獲取扣款項目
  const getDeduction = (name: string): number => {
    const item = result.deductions.find((d: {name: string; amount: number}) => d.name === name);
    return item ? item.amount : 0;
  };

  // 計算合計加班時數
  const totalOT1 = attendanceWithOT.reduce((sum, record) => sum + record.ot1, 0);
  const totalOT2 = attendanceWithOT.reduce((sum, record) => sum + record.ot2, 0);
  // 總加班費
  const totalOTPay = attendanceWithOT.reduce((sum, record) => sum + record.pay, 0);

  // 渲染出勤記錄行
  const renderAttendanceRows = () => {
    return attendanceWithOT.map((record, index) => (
      <tr key={index} className={record.isHoliday ? 'holiday-row' : ''}>
        <td className="date-cell">{record.date}</td>
        <td className="time-cell">{record.clockIn}</td>
        <td className="time-cell">{record.clockOut}</td>
        <td className="number-cell">{record.ot1.toFixed(1)}</td>
        <td className="number-cell">{record.ot2.toFixed(1)}</td>
        <td className="amount-cell">{record.pay}</td>
      </tr>
    ));
  };

  // 渲染住宿津貼行（如果存在）
  const renderHousingAllowanceRow = () => {
    if (result.housingAllowance && result.housingAllowance > 0) {
      return (
        <tr className="summary-size-row">
          <td colSpan={5}>住宿津貼：</td>
          <td className="amount-cell">{result.housingAllowance}</td>
        </tr>
      );
    }
    return null;
  };

  // 渲染福利津貼行（如果存在）- 粗體顯示
  const renderWelfareAllowanceRow = () => {
    if (result.welfareAllowance && result.welfareAllowance > 0) {
      return (
        <tr className="summary-size-row welfare-row" style={{ fontWeight: 'bold' }}>
          <td colSpan={5}>福利津貼：</td>
          <td className="amount-cell">{result.welfareAllowance}</td>
        </tr>
      );
    }
    return null;
  };

  return (
    <div className="print-container max-w-[210mm] mx-auto text-black bg-white">
      <style>
        {`
        .print-page {
          width: 210mm;
          height: 297mm;
          padding: 10mm;
          background-color: white;
          box-sizing: border-box;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          margin: 0 auto;
          overflow: hidden;
          page-break-after: always;
        }
        
        @media print {
          html, body {
            width: 210mm;
            height: 297mm;
            margin: 0;
            padding: 0;
            background-color: white;
          }

          body * {
            visibility: hidden;
          }
          
          .print-page, .print-page * {
            visibility: visible !important;
          }
          
          .print-page {
            position: absolute;
            left: 0;
            top: 0;
            margin: 0;
            padding: 10mm;
            box-shadow: none;
          }
          
          .print-container {
            box-shadow: none;
          }
          
          .no-print {
            display: none !important;
          }
          
          table, tr, td, th, tbody, thead {
            page-break-inside: avoid !important;
          }
          
          th, td, tr {
            color-adjust: exact !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          
          @page {
            size: A4 portrait;
            margin: 0;
          }
        }
        
        .salary-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
          margin-top: 0px;
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
        }
        
        .deduction-row td {
          color: #e53935;
        }
        
        .header-section {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-bottom: 10px;
        }
        
        .holiday-row {
          color: red;
        }
        
        .system-title {
          font-size: 16px;
          font-weight: bold;
          margin-bottom: 4px;
          font-family: Arial, sans-serif;
        }
        
        .month-title {
          font-size: 32px;
          font-weight: bold;
          margin-top: 0;
          font-family: Arial, sans-serif;
          line-height: 1;
        }
        
        .calculation-label {
          text-align: right;
          font-size: 14px;
          color: #666;
        }
        
        .summary-row {
          background-color: #f9f9f9;
          font-weight: 700;
          font-size: 13px;
        }
        
        .summary-row .number-cell,
        .summary-row .amount-cell {
          font-weight: 700;
          font-size: 13px;
        }
        
        .base-salary-row {
          font-weight: 700;
          font-size: 13px;
        }
        
        .base-salary-row .amount-cell {
          font-weight: 700;
          font-size: 13px;
        }
        
        .summary-size-row {
          font-size: 13px;
        }
        
        .summary-size-row .amount-cell {
          font-size: 13px;
        }
        
        .total-amount {
          font-weight: bold;
        }
        
        /* 確保表格內數字對齊 */
        .number-cell {
          text-align: center !important;
          white-space: nowrap;
        }
        
        .amount-cell {
          text-align: right !important;
          white-space: nowrap;
          font-family: 'Roboto Mono', monospace;
        }
        
        .date-cell {
          white-space: nowrap;
        }
        
        .time-cell {
          white-space: nowrap;
          text-align: center;
        }
        
        .salary-table tr:nth-child(even):not(.deduction-row):not(.summary-row):not(.total-amount) {
          background-color: #fcfcfc;
        }
        `}
      </style>
      
      <div className="print-page">
        <div className="header-section">
          <div>
            <h1 className="system-title">員工薪資計算系統</h1>
            <h2 className="month-title">{result.salaryMonth}月考勤打卡</h2>
          </div>
          <div>
            <span className="calculation-label">計算薪資</span>
          </div>
        </div>
        
        <table className="salary-table">
          <thead>
            <tr>
              <th style={{width: '90px'}}>日期</th>
              <th style={{width: '70px'}}>上班時間</th>
              <th style={{width: '70px'}}>下班時間</th>
              <th style={{width: '90px'}}>第一階段加班</th>
              <th style={{width: '90px'}}>第二階段加班</th>
              <th style={{width: '110px'}}>加班/假日薪資</th>
            </tr>
          </thead>
          <tbody>
            {renderAttendanceRows()}
            
            <tr className="summary-row">
              <td colSpan={3}>一般加班時數總計：</td>
              <td className="number-cell">{totalOT1.toFixed(1)}</td>
              <td className="number-cell">{totalOT2.toFixed(1)}</td>
              <td className="amount-cell">{totalOTPay}</td>
            </tr>
            <tr className="summary-size-row">
              <td colSpan={5}>假日給薪總計：</td>
              <td className="amount-cell">{result.holidayDays > 0 ? result.totalHolidayPay : '0'}</td>
            </tr>
            <tr className="base-salary-row">
              <td colSpan={5}>基本底薪：</td>
              <td className="amount-cell">{result.baseSalary}</td>
            </tr>
            {renderHousingAllowanceRow()}
            {renderWelfareAllowanceRow()}
            <tr className="deduction-row summary-size-row">
              <td colSpan={5}>勞保費：</td>
              <td className="amount-cell">-{getDeduction('勞保費')}</td>
            </tr>
            <tr className="deduction-row summary-size-row">
              <td colSpan={5}>健保費：</td>
              <td className="amount-cell">-{getDeduction('健保費')}</td>
            </tr>
            <tr className="deduction-row summary-size-row">
              <td colSpan={5}>服務費：</td>
              <td className="amount-cell">-{getDeduction('服務費')}</td>
            </tr>
            <tr className="deduction-row summary-size-row">
              <td colSpan={5}>宿舍費：</td>
              <td className="amount-cell">{getDeduction('宿舍費') > 0 ? `-${getDeduction('宿舍費')}` : '0'}</td>
            </tr>
            <tr className="total-amount summary-size-row">
              <td colSpan={5}>實領金額：</td>
              <td className="amount-cell">{result.netSalary}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}