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
 * 根據公司規定：早到從8:00開始記薪，16:00後開始計算加班，18:00後全部1.67倍
 * @param clockIn 上班打卡時間
 * @param clockOut 下班打卡時間
 */
export function calculateOvertime(clockIn: string, clockOut: string): { ot1: number, ot2: number } {
  if (!clockIn || !clockOut) return { ot1: 0, ot2: 0 };
  
  let inTime = timeToMinutes(clockIn);
  const outTime = timeToMinutes(clockOut);
  
  // 1. 早到處理：如果早於8:00上班，從8:00開始記薪
  const WORK_START = timeToMinutes('08:00'); // 480分鐘
  if (inTime < WORK_START) {
    inTime = WORK_START;
  }
  
  const STANDARD_END = timeToMinutes(constants.STANDARD_END_TIME); // 正常下班時間 16:00
  const OT1_END = timeToMinutes(constants.OT1_END_TIME);          // 第一階段加班結束 18:00
  
  let ot1 = 0;
  let ot2 = 0;
  const bufferMinutes = constants.BUFFER_MINUTES; // 10分鐘緩衝時間
  
  // 2. 16:00後才開始計算加班
  if (outTime > STANDARD_END + bufferMinutes) {
    const totalOvertimeMinutes = outTime - STANDARD_END;
    
    // 3. 階梯式計算OT1：10→40→70→100分鐘
    if (totalOvertimeMinutes <= (120 + bufferMinutes)) { // 不超過18:00
      // 全部算OT1 (1.34倍)
      if (totalOvertimeMinutes > (100 + bufferMinutes)) {
        ot1 = 2.0; // 超過100分鐘 -> 2.0小時
      } else if (totalOvertimeMinutes > (70 + bufferMinutes)) {
        ot1 = 1.5; // 超過70分鐘 -> 1.5小時
      } else if (totalOvertimeMinutes > (40 + bufferMinutes)) {
        ot1 = 1.0; // 超過40分鐘 -> 1.0小時
      } else if (totalOvertimeMinutes > (10 + bufferMinutes)) {
        ot1 = 0.5; // 超過10分鐘 -> 0.5小時
      }
    } else {
      // 4. 超過18:00：前2小時算OT1，18:00後全部算OT2 (1.67倍)
      ot1 = 2.0; // 16:00-18:00固定2小時OT1
      const ot2Minutes = totalOvertimeMinutes - 120; // 18:00後的分鐘數
      ot2 = ot2Minutes / 60; // 18:00後全部按實際時間計算，使用1.67倍
    }
  }
  
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