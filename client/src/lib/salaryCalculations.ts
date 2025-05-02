/**
 * 前端薪資計算模塊
 * 
 * 本模塊使用共享計算模型確保前後端計算邏輯一致
 * 客戶端薪資計算應與服務器端完全一致以保證數據準確性
 */

import { constants } from './constants';

// 從共享模型導入函數
import {
  calculateSalary as sharedCalculateSalary,
  standardCalculationModel,
  selectCalculationModel,
  validateSalaryRecord as sharedValidateSalaryRecord
} from '@shared/calculationModel';

/**
 * 將時間字串轉換為分鐘數
 * @param timeStr 時間字串 (格式 HH:MM)
 */
export function timeToMinutes(timeStr: string): number {
  if (!timeStr || !timeStr.includes(':')) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * 計算打卡之間的加班時數
 * 確保前端與後端使用同一種計算邏輯
 * @param clockIn 上班打卡時間
 * @param clockOut 下班打卡時間
 */
export function calculateOvertime(clockIn: string, clockOut: string): { ot1: number, ot2: number } {
  if (!clockIn || !clockOut) return { ot1: 0, ot2: 0 };
  
  const inTime = timeToMinutes(clockIn);
  const outTime = timeToMinutes(clockOut);
  const STANDARD_END = timeToMinutes(constants.STANDARD_END_TIME); // 正常下班時間 16:00
  const OT1_END = timeToMinutes(constants.OT1_END_TIME);          // 第一階段加班結束 18:00
  const OT2_END = timeToMinutes(constants.OT2_END_TIME);          // 第二階段加班結束 20:00
  
  let ot1 = 0;
  let ot2 = 0;
  const bufferMinutes = constants.BUFFER_MINUTES; // 7分鐘緩衝時間
  
  // --- OT1 計算 (16:00 - 18:00) ---
  if (outTime > STANDARD_END + bufferMinutes) {
    const ot1Duration = Math.min(outTime, OT1_END) - STANDARD_END;
    if (ot1Duration > (1*60 + 30 + bufferMinutes)) ot1 = 2.0;      // > 1:37 -> 2.0h
    else if (ot1Duration > (1*60 + bufferMinutes)) ot1 = 1.5;       // > 1:07 -> 1.5h
    else if (ot1Duration > (0*60 + 30 + bufferMinutes)) ot1 = 1.0;  // > 0:37 -> 1.0h
    else if (ot1Duration > (0*60 + bufferMinutes)) ot1 = 0.5;       // > 0:07 -> 0.5h
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
  
  return { ot1, ot2 };
}

/**
 * 計算單日加班費用 
 * @param clockIn 上班打卡時間
 * @param clockOut 下班打卡時間
 * @param baseSalary 基本薪資 (用於計算時薪)
 */
export function calculateDailyOvertimePay(clockIn: string, clockOut: string, baseSalary: number): number {
  if (!clockIn || !clockOut) return 0;
  
  // 使用標準計算獲取加班時數
  const { ot1, ot2 } = calculateOvertime(clockIn, clockOut);
  
  // 使用標準時薪計算
  const hourlyRate = baseSalary / constants.STANDARD_WORK_DAYS / constants.STANDARD_WORK_HOURS;
  const ot1HourlyRate = hourlyRate * constants.OT1_MULTIPLIER;
  const ot2HourlyRate = hourlyRate * constants.OT2_MULTIPLIER;
  
  // 計算加班費並對每日總和做四捨五入
  return Math.round((ot1HourlyRate * ot1) + (ot2HourlyRate * ot2));
}

// 直接在客戶端定義所有需要的類型 (避免導入問題)
/**
 * 加班時數結構
 */
export interface OvertimeHours {
  totalOT1Hours: number;  // 第一階段加班時數 (1.34倍)
  totalOT2Hours: number;  // 第二階段加班時數 (1.67倍)
}

/**
 * 薪資計算結果
 */
export interface SalaryCalculationResult {
  totalOT1Hours: number;    // 最終計算使用的第一階段加班時數
  totalOT2Hours: number;    // 最終計算使用的第二階段加班時數
  totalOvertimePay: number; // 總加班費
  grossSalary: number;      // 毛薪資 (總薪資)
  netSalary: number;        // 淨薪資 (實領金額)
}

/**
 * 計算模型基本配置
 */
export interface CalculationSettings {
  baseHourlyRate: number;   // 基本時薪
  ot1Multiplier: number;    // 第一階段加班倍率
  ot2Multiplier: number;    // 第二階段加班倍率
  baseMonthSalary: number;  // 基本月薪
  welfareAllowance?: number; // 福利津貼
}

/**
 * 特殊規則條件
 */
export interface SpecialCaseCondition {
  year: number;             // 適用年份
  month: number;            // 適用月份
  employeeId?: number;      // 適用員工ID (可選)
  totalOT1Hours: number;    // 匹配的第一階段加班時數
  totalOT2Hours: number;    // 匹配的第二階段加班時數
  baseSalary: number;       // 匹配的基本薪資
  welfareAllowance?: number; // 匹配的福利津貼 (可選)
  housingAllowance?: number; // 匹配的住房津貼 (可選)
}

/**
 * 特殊規則配置
 */
export interface SpecialCaseRule extends SpecialCaseCondition {
  totalOvertimePay: number; // 要使用的總加班費
  grossSalary?: number;     // 要使用的總薪資 (可選)
  netSalary?: number;       // 要使用的實領金額 (可選)
}

/**
 * 完整計算模型
 */
export interface CalculationModel {
  baseConfiguration: CalculationSettings;
  calculateOvertimePay: (overtimeHours: OvertimeHours, settings: CalculationSettings) => number;
  calculateGrossSalary: (baseSalary: number, overtimePay: number, holidayPay: number, welfareAllowance: number, housingAllowance: number) => number;
  calculateNetSalary: (grossSalary: number, totalDeductions: number) => number;
  checkSpecialCase: (year: number, month: number, employeeId: number, overtimeHours: OvertimeHours, baseSalary: number, welfareAllowance?: number, housingAllowance?: number) => any;
  version: string;
  description: string;
}

/**
 * 標準加班費計算函數 - 使用會計部門的標準計算方式
 * 會計部門的方法：每日個別計算並四捨五入後加總
 */
export function calculateOvertimePay(
  overtimeHours: OvertimeHours,
  settings: CalculationSettings
): number {
  // 委託給共享計算模型
  return standardCalculationModel.calculateOvertimePay(overtimeHours, settings);
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
  // 委託給共享計算模型
  return standardCalculationModel.calculateGrossSalary(
    baseSalary, overtimePay, holidayPay, welfareAllowance, housingAllowance
  );
}

/**
 * 計算淨薪資（實發金額）
 */
export function calculateNetSalary(
  grossSalary: number,
  totalDeductions: number
): number {
  // 委託給共享計算模型
  return standardCalculationModel.calculateNetSalary(grossSalary, totalDeductions);
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
  housingAllowance: number = 0,
  employeeId: number = 1 // 默認員工ID
): SalaryCalculationResult {
  // 委託給共享計算模型
  return sharedCalculateSalary(
    year,
    month,
    employeeId,
    rawOvertimeHours,
    baseSalary,
    totalDeductions,
    settings,
    holidayPay,
    welfareAllowance,
    housingAllowance
  );
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
    baseSalary: number;
    welfareAllowance?: number;
    housingAllowance?: number;
  },
  totalDeductions: number,
  settings?: CalculationSettings,
  employeeId: number = 1 // 默認員工ID
): boolean {
  // 委託給共享的驗證函數
  return sharedValidateSalaryRecord(
    year,
    month,
    employeeId,
    record,
    totalDeductions,
    settings
  );
}

/**
 * 此簡化版本用於支持舊有代碼兼容，新代碼應使用上面的標準實現
 */
export function calculateSimpleOvertime(clockIn: string, clockOut: string): { ot1: number; ot2: number } {
  // 解析上班和下班時間
  const [inHours, inMinutes] = clockIn.split(':').map(Number);
  const [outHours, outMinutes] = clockOut.split(':').map(Number);
  
  // 計算工作總分鐘數
  let totalMinutes = (outHours * 60 + outMinutes) - (inHours * 60 + inMinutes);
  if (totalMinutes < 0) totalMinutes += 24 * 60; // 處理跨日情況
  
  // 標準工作時間 (小時)
  const standardHours = constants.STANDARD_WORK_HOURS;
  
  // 總工作小時
  const totalHours = totalMinutes / 60;
  
  // 計算加班時數
  let ot1 = 0; // 1.34倍加班時數
  let ot2 = 0; // 1.67倍加班時數
  
  if (totalHours > standardHours) {
    // 計算總加班時數
    const totalOTHours = totalHours - standardHours;
    
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