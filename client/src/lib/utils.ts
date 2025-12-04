import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format date as YYYY/MM/DD
export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  
  // If already in YYYY/MM/DD format, return as is
  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(dateStr)) {
    return dateStr;
  }
  
  try {
    const date = new Date(dateStr.replace(/\//g, '-'));
    if (isNaN(date.getTime())) return dateStr;
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${year}/${month}/${day}`;
  } catch (e) {
    console.error('Error formatting date:', e);
    return dateStr;
  }
}

// 將時間字串轉換為分鐘數
function timeToMinutes(timeStr: string): number {
  if (!timeStr || !timeStr.includes(':')) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

// Calculate overtime hours based on clock-in and clock-out times
// OT1 加班時間範圍（16:00-18:10）：
// 1. 16:10 前，加班 0 小時
// 2. 16:10 - 16:35，加班 0.5 小時
// 3. 16:36 - 17:10，加班 1 小時
// 4. 17:11 - 17:35，加班 1.5 小時
// 5. 17:36 - 18:10，加班 2 小時
export function calculateOvertime(clockIn: string, clockOut: string): { 
  ot1: number; // First phase overtime (1.34x)
  ot2: number; // Second phase overtime (1.67x)
  total: number; // Total hours worked
} {
  if (!clockIn || !clockOut) {
    return { ot1: 0, ot2: 0, total: 0 };
  }

  try {
    let inTime = timeToMinutes(clockIn);
    const outTime = timeToMinutes(clockOut);
    
    // 1. 早到處理：如果早於8:00上班，從8:00開始記薪
    const WORK_START = timeToMinutes('08:00'); // 480分鐘
    if (inTime < WORK_START) {
      inTime = WORK_START;
    }
    
    // Handle overnight shifts (if needed)
    let totalMinutes = outTime - inTime;
    if (totalMinutes < 0) {
      totalMinutes += 24 * 60; // Add a full day's minutes
    }
    
    const totalHours = totalMinutes / 60;
    
    const STANDARD_END = timeToMinutes('16:00'); // 正常下班時間 16:00
    
    // 定義加班時間節點（從16:00起算的分鐘數）
    const OT_THRESHOLDS = {
      START: 10,      // 16:10 開始計算加班
      HALF_HOUR: 35,  // 16:35 之前算 0.5 小時
      ONE_HOUR: 70,   // 17:10 之前算 1 小時
      ONE_HALF: 95,   // 17:35 之前算 1.5 小時
      TWO_HOURS: 130  // 18:10 之前算 2 小時
    };
    
    let ot1 = 0;
    let ot2 = 0;
    
    // 2. 計算超過 16:00 的分鐘數
    const totalOvertimeMinutes = outTime - STANDARD_END;
    
    // 3. 根據時間範圍計算 OT1
    if (totalOvertimeMinutes >= OT_THRESHOLDS.START) {
      if (totalOvertimeMinutes <= OT_THRESHOLDS.HALF_HOUR) {
        // 16:10 - 16:35：0.5 小時
        ot1 = 0.5;
      } else if (totalOvertimeMinutes <= OT_THRESHOLDS.ONE_HOUR) {
        // 16:36 - 17:10：1 小時
        ot1 = 1.0;
      } else if (totalOvertimeMinutes <= OT_THRESHOLDS.ONE_HALF) {
        // 17:11 - 17:35：1.5 小時
        ot1 = 1.5;
      } else if (totalOvertimeMinutes <= OT_THRESHOLDS.TWO_HOURS) {
        // 17:36 - 18:10：2 小時
        ot1 = 2.0;
      } else {
        // 4. 超過 18:10：前 2 小時算 OT1，之後按 0.5 小時遞增計算 OT2
        ot1 = 2.0;
        const ot2Minutes = totalOvertimeMinutes - OT_THRESHOLDS.TWO_HOURS; // 18:10 後的分鐘數
        
        // 每 30 分鐘算 0.5 小時 OT2
        ot2 = Math.ceil(ot2Minutes / 30) * 0.5;
      }
    }
    
    return {
      ot1: ot1,
      ot2: ot2,
      total: parseFloat(totalHours.toFixed(1))
    };
  } catch (e) {
    console.error('Error calculating overtime:', e);
    return { ot1: 0, ot2: 0, total: 0 };
  }
}

// Calculate overtime pay based on hours and rates
export function calculateOvertimePay(
  ot1Hours: number, 
  ot2Hours: number, 
  hourlyRate: number = 119,
  ot1Multiplier: number = 1.34,
  ot2Multiplier: number = 1.67
): number {
  // Calculate pay for each overtime phase using respective multipliers
  const ot1Pay = ot1Hours * hourlyRate * ot1Multiplier;
  const ot2Pay = ot2Hours * hourlyRate * ot2Multiplier;
  
  // 根據正確的邏輯，分別對 OT1 和 OT2 進行無條件進位，然後相加
  return Math.ceil(ot1Pay) + Math.ceil(ot2Pay);
}

// Format currency to show with commas
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('zh-TW').format(amount);
}

// Get month name from numeric month
export function getMonthName(month: number): string {
  return `${month}月`;
}

// Get the current year and month
export function getCurrentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { 
    year: now.getFullYear(),
    month: now.getMonth() + 1
  };
}

// Extract year and month from a date string (YYYY/MM/DD)
export function extractYearMonth(dateStr: string): { year: number | null; month: number | null } {
  if (!dateStr) return { year: null, month: null };
  
  try {
    const [year, month] = dateStr.split('/').map(Number);
    if (!isNaN(year) && !isNaN(month)) {
      return { year, month };
    }
    return { year: null, month: null };
  } catch (e) {
    console.error('Error extracting year and month:', e);
    return { year: null, month: null };
  }
}

// Get deduction amount from deductions array
export function getDeductionAmount(deductions: Array<{ name: string; amount: number }> | undefined, name: string): number {
  if (!deductions) return 0;
  const item = deductions.find(d => d.name === name);
  return item ? item.amount : 0;
}

// Check if a date is a weekend
export function isWeekend(dateStr: string): boolean {
  try {
    const date = new Date(dateStr.replace(/\//g, '-'));
    const day = date.getDay();
    // 0 is Sunday, 6 is Saturday
    return day === 0 || day === 6;
  } catch (e) {
    console.error('Error checking if date is weekend:', e);
    return false;
  }
}

// Check if a date is in the list of holidays
export function isHoliday(dateStr: string, holidays: Array<{ date: string }>): boolean {
  return holidays.some(holiday => holiday.date === dateStr);
}

// Get the current time in HH:MM format (Taiwan time UTC+8)
export function getCurrentTime(): string {
  // 使用台灣時區 (UTC+8)
  const now = new Date();
  const taiwanTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const hours = String(taiwanTime.getUTCHours()).padStart(2, '0');
  const minutes = String(taiwanTime.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

// Get today's date in YYYY/MM/DD format (Taiwan time UTC+8)
export function getTodayDate(): string {
  // 使用台灣時區 (UTC+8)
  const now = new Date();
  const taiwanTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const year = taiwanTime.getUTCFullYear();
  const month = String(taiwanTime.getUTCMonth() + 1).padStart(2, '0');
  const day = String(taiwanTime.getUTCDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}
