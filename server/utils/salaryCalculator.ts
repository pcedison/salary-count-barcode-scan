/**
 * 伺服器端薪資計算統一模組
 * 
 * 這個模組確保所有薪資計算在後端使用一致的邏輯，成為單一真實來源
 * 前端只負責顯示計算結果，確保會計準確性
 */

interface OvertimeHours {
  totalOT1Hours: number;
  totalOT2Hours: number;
}

interface CalculationSettings {
  baseHourlyRate: number;
  ot1Multiplier: number;
  ot2Multiplier: number;
  baseMonthSalary: number;
  welfareAllowance?: number;
}

interface SalaryCalculationResult {
  totalOT1Hours: number;
  totalOT2Hours: number;
  totalOvertimePay: number;
  grossSalary: number;
  netSalary: number;
}

/**
 * 標準加班費計算函數 - 使用會計部門的標準計算方式
 * 會計部門的方法：每日個別計算並四捨五入後加總
 */
export function calculateOvertimePay(
  overtimeHours: OvertimeHours,
  settings: CalculationSettings
): number {
  const { baseHourlyRate, ot1Multiplier, ot2Multiplier } = settings;
  const { totalOT1Hours, totalOT2Hours } = overtimeHours;
  
  // 計算精確時薪 (不取整)
  const ot1HourlyRate = baseHourlyRate * ot1Multiplier;
  const ot2HourlyRate = baseHourlyRate * ot2Multiplier;
  
  // 計算各階段加班費 (不預先四捨五入)
  const ot1Pay = ot1HourlyRate * totalOT1Hours;
  const ot2Pay = ot2HourlyRate * totalOT2Hours;
  
  // 將各階段加班費四捨五入為整數
  const roundedOt1Pay = Math.round(ot1Pay);
  const roundedOt2Pay = Math.round(ot2Pay);
  
  // 返回總加班費
  return roundedOt1Pay + roundedOt2Pay;
}

/**
 * 標準化加班費計算函數
 * 使用統一標準計算所有月份的加班費，確保計算的一致性
 * 
 * 本函數不再區分特殊月份，而是對所有月份使用相同的計算標準
 */
export function getMonthSpecificOvertimePay(
  year: number,
  month: number,
  overtimeHours: OvertimeHours,
  calculatedOvertimePay: number
): number {
  // 使用標準化計算方法 - 對所有月份採用同一標準
  return calculatedOvertimePay;
}

/**
 * 標準化加班時數處理函數
 * 使用統一標準處理所有月份的加班時數，確保計算的一致性
 * 
 * 本函數不再區分特殊月份，而是對所有月份使用相同的標準
 */
export function getMonthSpecificOvertimeHours(
  year: number,
  month: number,
  defaultOvertimeHours: OvertimeHours
): OvertimeHours {
  // 使用標準化處理方法 - 對所有月份採用同一標準
  return defaultOvertimeHours;
}

/**
 * 計算總薪資（毛薪資）
 */
export function calculateGrossSalary(
  baseSalary: number,
  overtimePay: number,
  holidayPay: number = 0,
  welfareAllowance: number = 0,
  housingAllowance: number = 0
): number {
  return baseSalary + overtimePay + holidayPay + welfareAllowance + housingAllowance;
}

/**
 * 計算淨薪資（實發金額）
 */
export function calculateNetSalary(
  grossSalary: number,
  totalDeductions: number
): number {
  return grossSalary - totalDeductions;
}

/**
 * 統一薪資計算函數
 * 整合所有計算步驟，確保一致性
 */
export function calculateSalary(
  year: number,
  month: number,
  rawOvertimeHours: OvertimeHours,
  baseSalary: number,
  totalDeductions: number,
  settings: CalculationSettings,
  holidayPay: number = 0,
  welfareAllowance?: number,
  housingAllowance: number = 0
): SalaryCalculationResult {
  // 1. 確保加班時數正確
  const overtimeHours = getMonthSpecificOvertimeHours(year, month, rawOvertimeHours);
  
  // 2. 計算加班費
  const calculatedOvertimePay = calculateOvertimePay(overtimeHours, settings);
  
  // 3. 應用特定月份的加班費修正
  const finalOvertimePay = getMonthSpecificOvertimePay(year, month, overtimeHours, calculatedOvertimePay);
  
  // 4. 計算總薪資
  const welfareAmount = welfareAllowance || settings.welfareAllowance || 0;
  const grossSalary = calculateGrossSalary(baseSalary, finalOvertimePay, holidayPay, welfareAmount, housingAllowance);
  
  // 5. 計算淨薪資
  const netSalary = calculateNetSalary(grossSalary, totalDeductions);
  
  return {
    totalOT1Hours: overtimeHours.totalOT1Hours,
    totalOT2Hours: overtimeHours.totalOT2Hours,
    totalOvertimePay: finalOvertimePay,
    grossSalary,
    netSalary
  };
}

/**
 * 驗證薪資記錄是否符合統一計算標準
 * 使用單一標準方法驗證所有月份的薪資記錄
 * 不再區分特殊月份，確保系統計算邏輯的一致性
 */
export function validateSalaryRecord(
  year: number,
  month: number,
  record: {
    totalOT1Hours: number;
    totalOT2Hours: number;
    totalOvertimePay: number;
    grossSalary: number;
    netSalary: number;
  },
  settings?: CalculationSettings
): boolean {
  // 所有月份使用統一的標準會計計算方法進行驗證
  if (!settings) return false;
  
  // 1. 使用會計部門標準方法驗證加班費計算
  const baseHourlyRate = settings.baseHourlyRate || 119;
  const ot1Multiplier = settings.ot1Multiplier || 1.34;
  const ot2Multiplier = settings.ot2Multiplier || 1.67;
  
  const ot1HourlyRate = baseHourlyRate * ot1Multiplier;
  const ot2HourlyRate = baseHourlyRate * ot2Multiplier;
  
  // 會計計算方法：使用精確時薪計算後四捨五入
  const ot1Pay = ot1HourlyRate * record.totalOT1Hours;
  const ot2Pay = ot2HourlyRate * record.totalOT2Hours;
  
  // 將各階段加班費四捨五入為整數
  const roundedOt1Pay = Math.round(ot1Pay);
  const roundedOt2Pay = Math.round(ot2Pay);
  
  // 計算預期的總加班費
  const expectedTotalOTPay = roundedOt1Pay + roundedOt2Pay;
  
  // 2. 驗證加班費 - 允許±1元的誤差，處理四捨五入差異
  const isOTPayValid = Math.abs(record.totalOvertimePay - expectedTotalOTPay) <= 1;
  
  // 3. 驗證總薪資和淨薪資計算
  // 此處僅驗證加班費計算，因為其他部分(如基本薪資、扣除額)需要完整的記錄數據
  // 確保加班費計算是符合標準的
  
  return isOTPayValid;
}

/**
 * 計算單一日期的加班時數
 * 根據上下班時間計算標準加班時數
 */
export function calculateOvertime(clockIn: string, clockOut: string): { ot1: number; ot2: number } {
  // 這個函數假設工作日正常工作時間為8小時
  const STANDARD_HOURS = 8;
  
  // 解析上班和下班時間
  const [inHours, inMinutes] = clockIn.split(':').map(Number);
  const [outHours, outMinutes] = clockOut.split(':').map(Number);
  
  // 計算工作總分鐘數
  let totalMinutes = (outHours * 60 + outMinutes) - (inHours * 60 + inMinutes);
  if (totalMinutes < 0) totalMinutes += 24 * 60; // 處理跨日情況
  
  // 總工作小時
  const totalHours = totalMinutes / 60;
  
  // 計算加班時數
  let ot1 = 0; // 1.34倍加班時數
  let ot2 = 0; // 1.67倍加班時數
  
  if (totalHours > STANDARD_HOURS) {
    // 計算總加班時數
    const totalOTHours = totalHours - STANDARD_HOURS;
    
    // 分配到不同級別的加班
    if (totalOTHours <= 2) {
      // 前兩小時按1.34倍計算
      ot1 = totalOTHours;
    } else {
      // 前兩小時按1.34倍，超過部分按1.67倍
      ot1 = 2;
      ot2 = totalOTHours - 2;
    }
  }
  
  return { ot1, ot2 };
}