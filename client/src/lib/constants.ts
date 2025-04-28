export const constants = {
  // Supabase configuration
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL || 'YOUR_SUPABASE_URL',
  SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY',
  
  // Table names
  TEMP_TABLE_NAME: 'temporary_attendance',
  FINAL_TABLE_NAME: 'salary_records',
  
  // Default calculation settings
  DEFAULT_BASE_HOURLY_RATE: 119,
  DEFAULT_OT1_MULTIPLIER: 1.34,
  DEFAULT_OT2_MULTIPLIER: 1.67,
  DEFAULT_BASE_MONTH_SALARY: 28590,
  DEFAULT_WELFARE_ALLOWANCE: 0,
  
  // Default deductions
  DEFAULT_DEDUCTIONS: [
    { name: '勞保費', amount: 1042, description: '勞工保險費用' },
    { name: '健保費', amount: 600, description: '全民健康保險費用' },
    { name: '服務費', amount: 500, description: '各種服務處理費用' },
    { name: '住宿費', amount: 3000, description: '公司宿舍住宿費用' }
  ],
  
  // Working hours
  STANDARD_HOURS: 8,
  
  // App version
  APP_VERSION: '1.1.0'
};
