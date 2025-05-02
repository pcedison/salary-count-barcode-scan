/**
 * 全局常量定義
 * 確保前端計算使用與後端一致的數值
 */

// 導入共享常量
// @ts-ignore - 忽略模塊無聲明檔案的錯誤
import { constants as sharedConstants } from '@shared/constants.js';

// 擴展共享常量，添加客戶端特有的常量
export const constants = {
  ...sharedConstants,
  
  // 前端特有的數據庫連接常量
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL || "YOUR_SUPABASE_URL",       // Supabase URL
  SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_KEY || "YOUR_SUPABASE_ANON_KEY", // Supabase 匿名密鑰
  
  // 客戶端特有常量可在此處添加
  UI_UPDATE_INTERVAL: 60000,  // UI自動更新間隔（毫秒）
  TOAST_DURATION: 5000,      // 提示訊息顯示時間（毫秒）
};