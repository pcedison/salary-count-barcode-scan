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
 * 計算單一日期的加班時數
 */
export function calculateOvertime(clockIn: string, clockOut: string): { ot1: number; ot2: number } {
  // 解析上班和下班時間
  const [inHours, inMinutes] = clockIn.split(':').map(Number);
  const [outHours, outMinutes] = clockOut.split(':').map(Number);
  
  // 計算工作總分鐘數
  let totalMinutes = (outHours * 60 + outMinutes) - (inHours * 60 + inMinutes);
  if (totalMinutes < 0) totalMinutes += 24 * 60; // 處理跨日情況
  
  // 標準工作時間 (小時)
  const standardHours = constants.STANDARD_HOURS;
  
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