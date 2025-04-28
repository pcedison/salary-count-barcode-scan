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
// 參考正確的計算邏輯 (16:00 正常下班時間)
export function calculateOvertime(clockIn: string, clockOut: string): { 
  ot1: number; // First phase overtime (1.34x)
  ot2: number; // Second phase overtime (1.67x)
  total: number; // Total hours worked
} {
  if (!clockIn || !clockOut) {
    return { ot1: 0, ot2: 0, total: 0 };
  }

  try {
    const inTime = timeToMinutes(clockIn);
    const outTime = timeToMinutes(clockOut);
    
    // Handle overnight shifts (if needed)
    let totalMinutes = outTime - inTime;
    if (totalMinutes < 0) {
      totalMinutes += 24 * 60; // Add a full day's minutes
    }
    
    const totalHours = totalMinutes / 60;
    
    // 正常下班時間 16:00 (960分鐘)
    const STANDARD_END = timeToMinutes('16:00'); // 960
    // 第一階段加班結束 18:00 (1080分鐘)
    const OT1_END = timeToMinutes('18:00'); // 1080
    // 第二階段加班結束 20:00 (1200分鐘)
    const OT2_END = timeToMinutes('20:00'); // 1200
    
    let ot1 = 0;
    let ot2 = 0;
    const bufferMinutes = 7; // 7分鐘緩衝時間
    
    // --- OT1 計算 (16:00 - 18:00) ---
    if (outTime > STANDARD_END + bufferMinutes) {
      const ot1Duration = Math.min(outTime, OT1_END) - STANDARD_END;
      if (ot1Duration > (1*60 + 30 + bufferMinutes)) ot1 = 2.0;    // > 1:37 -> 2.0h
      else if (ot1Duration > (1*60 + bufferMinutes)) ot1 = 1.5;    // > 1:07 -> 1.5h
      else if (ot1Duration > (0*60 + 30 + bufferMinutes)) ot1 = 1.0; // > 0:37 -> 1.0h
      else if (ot1Duration > (0*60 + bufferMinutes)) ot1 = 0.5;     // > 0:07 -> 0.5h
    }
    
    // --- OT2 計算 (18:00 - 20:00 以及更晚) ---
    if (outTime > OT1_END + bufferMinutes) {
      // 18:00 - 20:00 範圍內的時間
      const ot2Range1Duration = Math.max(0, Math.min(outTime, OT2_END) - OT1_END);
      if (ot2Range1Duration > (1*60 + 30 + bufferMinutes)) ot2 += 2.0;
      else if (ot2Range1Duration > (1*60 + bufferMinutes)) ot2 += 1.5;
      else if (ot2Range1Duration > (0*60 + 30 + bufferMinutes)) ot2 += 1.0;
      else if (ot2Range1Duration > (0*60 + bufferMinutes)) ot2 += 0.5;
      
      // 20:00 之後的時間 (加到 ot2)
      if (outTime > OT2_END + bufferMinutes) {
        const ot2Range2Duration = outTime - OT2_END;
        // 簡化: 每30分鐘增加0.5小時加班
        let additionalOt2 = 0;
        if (ot2Range2Duration > bufferMinutes) {
          // 計算緩衝時間後的完整30分鐘區塊
          additionalOt2 = Math.floor((ot2Range2Duration - bufferMinutes) / 30) * 0.5;
          // 檢查最後一個不完整區塊是否有超過緩衝時間
          if (((ot2Range2Duration - bufferMinutes) % 30) > 0) {
            additionalOt2 += 0.5;
          }
        }
        ot2 += additionalOt2;
      }
    }
    
    // 確保 ot1 不超過 2 小時
    ot1 = Math.min(ot1, 2.0);
    
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
