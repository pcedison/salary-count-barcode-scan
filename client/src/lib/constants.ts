/**
 * 全局常量定義
 * 確保前端計算使用與後端一致的數值
 */

export const constants = {
  // 時薪計算基礎
  BASE_HOURLY_RATE: 119,     // 基本時薪
  OT1_MULTIPLIER: 1.34,      // 第一階段加班倍率 (16:00-18:00)
  OT2_MULTIPLIER: 1.67,      // 第二階段加班倍率 (18:00以後)
  STANDARD_WORK_DAYS: 30,    // 標準工作天數/月
  STANDARD_WORK_HOURS: 8,    // 標準工作時數/天
  
  // 時間相關常量
  STANDARD_END_TIME: '16:00',   // 正常下班時間
  OT1_END_TIME: '18:00',        // 第一階段加班結束時間
  OT2_END_TIME: '20:00',        // 第二階段加班基準時間
  BUFFER_MINUTES: 7,            // 加班計算緩衝時間（分鐘）
  
  // 打卡相關常量
  MIN_WORK_HOURS: 8,            // 最少工作時數視為全天
  HALF_DAY_HOURS: 4,            // 半天工作時數
  
  // 津貼相關常量
  DEFAULT_WELFARE_ALLOWANCE: 2500,  // 默認福利津貼
  DEFAULT_HOUSING_ALLOWANCE: 0,     // 默認住宿津貼
  
  // 特殊月份常量
  MONTHS_WITH_31_DAYS: [1, 3, 5, 7, 8, 10, 12],
  MONTHS_WITH_30_DAYS: [4, 6, 9, 11],
  
  // 計算相關常量
  OT_ROUNDING_PRECISION: 1,      // 加班時數四捨五入小數位數
  SALARY_ROUNDING_PRECISION: 0,  // 薪資四捨五入小數位數
};