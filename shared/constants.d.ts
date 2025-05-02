/**
 * 系統全局常量的TypeScript類型定義
 */

export interface Constants {
  // 時薪計算基礎
  BASE_HOURLY_RATE: number;     // 基本時薪
  OT1_MULTIPLIER: number;      // 第一階段加班倍率 (16:00-18:00)
  OT2_MULTIPLIER: number;      // 第二階段加班倍率 (18:00以後)
  STANDARD_WORK_DAYS: number;    // 標準工作天數/月
  STANDARD_WORK_HOURS: number;    // 標準工作時數/天
  
  // 時間相關常量
  STANDARD_END_TIME: string;   // 正常下班時間
  OT1_END_TIME: string;        // 第一階段加班結束時間
  OT2_END_TIME: string;        // 第二階段加班基準時間
  BUFFER_MINUTES: number;            // 加班計算緩衝時間（分鐘）
  
  // 打卡相關常量
  MIN_WORK_HOURS: number;            // 最少工作時數視為全天
  HALF_DAY_HOURS: number;            // 半天工作時數
  
  // 津貼相關常量
  DEFAULT_WELFARE_ALLOWANCE: number;  // 默認福利津貼
  DEFAULT_HOUSING_ALLOWANCE: number;     // 默認住宿津貼
  
  // 特殊月份常量
  MONTHS_WITH_31_DAYS: number[];
  MONTHS_WITH_30_DAYS: number[];
  
  // 計算相關常量
  OT_ROUNDING_PRECISION: number;      // 加班時數四捨五入小數位數
  SALARY_ROUNDING_PRECISION: number;  // 薪資四捨五入小數位數
  
  // 數據庫相關常量
  TEMP_TABLE_NAME: string;  // 考勤暫存表名
  FINAL_TABLE_NAME: string;       // 薪資記錄表名
  SETTINGS_TABLE_NAME: string;          // 設置表名
  HOLIDAYS_TABLE_NAME: string;          // 假日表名
  
  // 資料庫默認值
  DEFAULT_LABOR_INSURANCE: number;  // 默認勞保費用
  DEFAULT_HEALTH_INSURANCE: number; // 默認健保費用
  
  // 員工相關常量
  DEFAULT_EMPLOYEE_ID: number;        // 默認員工ID（用於遷移期）
  
  // 加密相關常量
  DEFAULT_CIPHER_SHIFT: number;       // 默認加密偏移量
}

export const constants: Constants;