import { createClient } from '@supabase/supabase-js';
import { constants } from './constants';
import { apiRequest } from './queryClient';

// 嘗試從服務器和本地存儲獲取 Supabase 連接資訊
const getSupabaseConfig = async () => {
  try {
    // 1. 首先嘗試從 localStorage 獲取（立即響應）
    const savedUrl = localStorage.getItem('supabaseUrl');
    const savedKey = localStorage.getItem('supabaseAnonKey');
    
    // 2. 如果本地存儲有有效值，優先使用它們
    if (savedUrl && savedUrl !== 'YOUR_SUPABASE_URL' && 
        savedKey && savedKey !== 'YOUR_SUPABASE_ANON_KEY') {
      return { url: savedUrl, key: savedKey };
    }
    
    // 3. 如果本地存儲沒有有效值，從服務器獲取
    try {
      const response = await fetch('/api/supabase-config');
      const serverConfig = await response.json();
      
      if (serverConfig && serverConfig.url && serverConfig.key && 
          serverConfig.url !== '' && serverConfig.key !== '') {
        // 同時更新本地存儲
        localStorage.setItem('supabaseUrl', serverConfig.url);
        localStorage.setItem('supabaseAnonKey', serverConfig.key);
        return serverConfig;
      }
    } catch (serverError) {
      console.error('Error fetching Supabase config from server:', serverError);
    }
    
    // 4. 如果服務器獲取失敗，使用環境變量
    return { 
      url: constants.SUPABASE_URL, 
      key: constants.SUPABASE_ANON_KEY 
    };
  } catch (e) {
    // 5. 如果所有獲取方式都失敗，使用環境變量
    return { 
      url: constants.SUPABASE_URL, 
      key: constants.SUPABASE_ANON_KEY 
    };
  }
};

// 初始化 Supabase 客戶端（優化版本 - 單例模式）
// 使用明確的類型定義，避免類型錯誤
type SupabaseClientType = ReturnType<typeof createClient>;
let supabaseClient: SupabaseClientType | null = null;
let clientInitialized = false;

/**
 * 創建 Supabase 客戶端的單例工廠函數
 * 避免創建多個實例，防止 "Multiple GoTrueClient instances" 警告
 */
const createSupabaseClient = (url: string, key: string): SupabaseClientType => {
  if (supabaseClient) {
    // 如果 URL 和 key 不同，才重新創建實例（避免無謂的實例創建）
    const currentUrl = localStorage.getItem('supabaseUrl');
    const currentKey = localStorage.getItem('supabaseAnonKey');
    
    if (currentUrl === url && currentKey === key) {
      return supabaseClient;
    }
  }
  
  // 如果客戶端尚未初始化或需要更新配置，創建新實例
  const client = createClient(url, key, {
    auth: {
      persistSession: true, // 持久化會話，但控制實例創建
      autoRefreshToken: true,
      detectSessionInUrl: false, // 避免在 URL 中檢測會話，減少會話碎片
      flowType: 'implicit' // 使用隱式流程類型
    }
  });
  
  supabaseClient = client;
  clientInitialized = true;
  return client;
};

// 直接使用本地存儲進行首次初始化（快速啟動）
const initializeSupabaseClient = () => {
  if (clientInitialized) return; // 避免重複初始化
  
  try {
    const savedUrl = localStorage.getItem('supabaseUrl');
    const savedKey = localStorage.getItem('supabaseAnonKey');
    
    if (savedUrl && savedUrl !== 'YOUR_SUPABASE_URL' && 
        savedKey && savedKey !== 'YOUR_SUPABASE_ANON_KEY') {
      createSupabaseClient(savedUrl, savedKey);
      console.log("Supabase client initialized successfully from localStorage");
      return;
    }
    
    // 如果本地存儲沒有有效值，使用環境變量
    const envUrl = constants.SUPABASE_URL;
    const envKey = constants.SUPABASE_ANON_KEY;
    
    if (envUrl && envKey && 
        envUrl !== 'YOUR_SUPABASE_URL' && 
        envKey !== 'YOUR_SUPABASE_ANON_KEY') {
      createSupabaseClient(envUrl, envKey);
      console.log("Supabase client initialized successfully from env variables");
      return;
    }
    
    console.warn("Supabase URL or Key is not properly configured. Supabase features will be disabled.");
  } catch (error) {
    console.error("Error initializing Supabase client:", error);
  }
};

// 首次初始化
initializeSupabaseClient();

// 在後台從服務器獲取並更新配置
// 這確保了即使首次加載使用了本地存儲的配置，我們也會盡快獲取最新的服務器配置
getSupabaseConfig().then(({ url, key }) => {
  if (url && key && 
      url !== 'YOUR_SUPABASE_URL' && 
      key !== 'YOUR_SUPABASE_ANON_KEY') {
    try {
      createSupabaseClient(url, key);
      console.log("Supabase client updated with server config");
      
      // 更新本地存儲
      localStorage.setItem('supabaseUrl', url);
      localStorage.setItem('supabaseAnonKey', key);
    } catch (error) {
      console.error("Error updating Supabase client with server config:", error);
    }
  }
}).catch(error => {
  console.error("Error fetching Supabase config from server:", error);
});

/**
 * 提供一個函數來更新 Supabase 連接，同時保存到服務器和本地存儲
 * 使用單例工廠確保一致性
 */
export const updateSupabaseConnection = (url: string, key: string) => {
  try {
    // 首先驗證輸入
    if (!url || !key || url === 'YOUR_SUPABASE_URL' || key === 'YOUR_SUPABASE_ANON_KEY') {
      console.error("Invalid Supabase URL or Key provided");
      return false;
    }
    
    // 1. 保存到本地存儲（立即響應）
    localStorage.setItem('supabaseUrl', url);
    localStorage.setItem('supabaseAnonKey', key);
    
    // 2. 使用工廠函數創建/獲取實例
    createSupabaseClient(url, key);
    
    // 3. 異步保存到服務器（持久存儲）
    apiRequest('POST', '/api/supabase-config', { url, key })
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to save Supabase config to server');
        }
        return response.json();
      })
      .then(data => {
        console.log("Supabase config saved to server successfully:", data);
      })
      .catch(error => {
        console.error("Error saving Supabase config to server:", error);
        // 儘管服務器保存失敗，本地客戶端更新仍然成功
      });
    
    console.log("Supabase client updated successfully");
    return true;
  } catch (error) {
    console.error("Error updating Supabase client:", error);
    return false;
  }
};

export { supabaseClient };

// Temporary attendance table operations
export const temporaryAttendanceTable = {
  async getAll() {
    if (!supabaseClient) return [];
    
    try {
      const { data, error } = await supabaseClient
        .from(constants.TEMP_TABLE_NAME)
        .select('*')
        .order('date', { ascending: true });
        
      if (error) {
        console.error('Error fetching attendance data:', error);
        throw error;
      }
      
      // Transform from snake_case to camelCase
      return (data || []).map(record => ({
        id: record.id,
        date: record.date,
        clockIn: record.clock_in,
        clockOut: record.clock_out,
        isHoliday: record.is_holiday,
        createdAt: record.created_at
      }));
    } catch (err) {
      console.error('Error in temporaryAttendanceTable.getAll:', err);
      return [];
    }
  },
  
  async add(record: any) {
    if (!supabaseClient) return null;
    
    try {
      // Transform to snake_case for database
      const dbRecord = {
        date: record.date,
        clock_in: record.clockIn,
        clock_out: record.clockOut,
        is_holiday: record.isHoliday
      };
      
      const { data, error } = await supabaseClient
        .from(constants.TEMP_TABLE_NAME)
        .insert([dbRecord])
        .select()
        .single();
        
      if (error) {
        console.error('Error adding attendance record:', error);
        throw error;
      }
      
      // Transform back to camelCase
      return {
        id: data.id,
        date: data.date,
        clockIn: data.clock_in,
        clockOut: data.clock_out,
        isHoliday: data.is_holiday,
        createdAt: data.created_at
      };
    } catch (err) {
      console.error('Error in temporaryAttendanceTable.add:', err);
      return null;
    }
  },
  
  async update(id: number, record: any) {
    if (!supabaseClient) return null;
    
    try {
      // Transform to snake_case for database
      const dbRecord = {
        date: record.date,
        clock_in: record.clockIn,
        clock_out: record.clockOut,
        is_holiday: record.isHoliday
      };
      
      const { data, error } = await supabaseClient
        .from(constants.TEMP_TABLE_NAME)
        .update(dbRecord)
        .eq('id', id)
        .select()
        .single();
        
      if (error) {
        console.error('Error updating attendance record:', error);
        throw error;
      }
      
      // Transform back to camelCase
      return {
        id: data.id,
        date: data.date,
        clockIn: data.clock_in,
        clockOut: data.clock_out,
        isHoliday: data.is_holiday,
        createdAt: data.created_at
      };
    } catch (err) {
      console.error('Error in temporaryAttendanceTable.update:', err);
      return null;
    }
  },
  
  async delete(id: number) {
    if (!supabaseClient) return false;
    
    try {
      const { error } = await supabaseClient
        .from(constants.TEMP_TABLE_NAME)
        .delete()
        .eq('id', id);
        
      if (error) {
        console.error('Error deleting attendance record:', error);
        throw error;
      }
      
      return true;
    } catch (err) {
      console.error('Error in temporaryAttendanceTable.delete:', err);
      return false;
    }
  },
  
  async deleteAll() {
    if (!supabaseClient) return false;
    
    try {
      const { error } = await supabaseClient
        .from(constants.TEMP_TABLE_NAME)
        .delete()
        .gte('id', 0);
        
      if (error) {
        console.error('Error deleting all attendance records:', error);
        throw error;
      }
      
      return true;
    } catch (err) {
      console.error('Error in temporaryAttendanceTable.deleteAll:', err);
      return false;
    }
  }
};

// Salary records table operations
export const salaryRecordsTable = {
  async getAll() {
    if (!supabaseClient) return [];
    
    try {
      const { data, error } = await supabaseClient
        .from(constants.FINAL_TABLE_NAME)
        .select('*')
        .order('salary_year', { ascending: false })
        .order('salary_month', { ascending: false });
        
      if (error) {
        console.error('Error fetching salary records:', error);
        throw error;
      }
      
      // Transform from snake_case to camelCase
      return (data || []).map(record => ({
        id: record.id,
        salaryYear: record.salary_year,
        salaryMonth: record.salary_month,
        baseSalary: record.base_salary,
        housingAllowance: record.housing_allowance || 0,
        totalOT1Hours: record.total_ot1_hours,
        totalOT2Hours: record.total_ot2_hours,
        totalOvertimePay: record.total_overtime_pay,
        holidayDays: record.holiday_days,
        holidayDailySalary: record.holiday_daily_salary,
        totalHolidayPay: record.total_holiday_pay,
        grossSalary: record.gross_salary,
        deductions: record.deductions || [],
        totalDeductions: record.total_deductions,
        netSalary: record.net_salary,
        attendanceData: record.attendance_data || [],
        createdAt: record.created_at
      }));
    } catch (err) {
      console.error('Error in salaryRecordsTable.getAll:', err);
      return [];
    }
  },
  
  async getById(id: number) {
    if (!supabaseClient) return null;
    
    try {
      const { data, error } = await supabaseClient
        .from(constants.FINAL_TABLE_NAME)
        .select('*')
        .eq('id', id)
        .single();
        
      if (error) {
        console.error('Error fetching salary record:', error);
        throw error;
      }
      
      // Transform from snake_case to camelCase
      return {
        id: data.id,
        salaryYear: data.salary_year,
        salaryMonth: data.salary_month,
        baseSalary: data.base_salary,
        housingAllowance: data.housing_allowance || 0,
        totalOT1Hours: data.total_ot1_hours,
        totalOT2Hours: data.total_ot2_hours,
        totalOvertimePay: data.total_overtime_pay,
        holidayDays: data.holiday_days,
        holidayDailySalary: data.holiday_daily_salary,
        totalHolidayPay: data.total_holiday_pay,
        grossSalary: data.gross_salary,
        deductions: data.deductions || [],
        totalDeductions: data.total_deductions,
        netSalary: data.net_salary,
        attendanceData: data.attendance_data || [],
        createdAt: data.created_at
      };
    } catch (err) {
      console.error('Error in salaryRecordsTable.getById:', err);
      return null;
    }
  },
  
  async add(record: any) {
    if (!supabaseClient) return null;
    
    try {
      // Transform from camelCase to snake_case for database
      const dbRecord = {
        salary_year: record.salaryYear,
        salary_month: record.salaryMonth,
        base_salary: record.baseSalary,
        housing_allowance: record.housingAllowance || 0,
        total_ot1_hours: record.totalOT1Hours,
        total_ot2_hours: record.totalOT2Hours,
        total_overtime_pay: record.totalOvertimePay,
        holiday_days: record.holidayDays,
        holiday_daily_salary: record.holidayDailySalary || 0,
        total_holiday_pay: record.totalHolidayPay,
        gross_salary: record.grossSalary,
        deductions: record.deductions || [],
        total_deductions: record.totalDeductions,
        net_salary: record.netSalary,
        attendance_data: record.attendanceData || []
      };
      
      const { data, error } = await supabaseClient
        .from(constants.FINAL_TABLE_NAME)
        .insert([dbRecord])
        .select()
        .single();
        
      if (error) {
        console.error('Error adding salary record:', error);
        throw error;
      }
      
      // Transform back to camelCase
      return {
        id: data.id,
        salaryYear: data.salary_year,
        salaryMonth: data.salary_month,
        baseSalary: data.base_salary,
        housingAllowance: data.housing_allowance || 0,
        totalOT1Hours: data.total_ot1_hours,
        totalOT2Hours: data.total_ot2_hours,
        totalOvertimePay: data.total_overtime_pay,
        holidayDays: data.holiday_days,
        holidayDailySalary: data.holiday_daily_salary,
        totalHolidayPay: data.total_holiday_pay,
        grossSalary: data.gross_salary,
        deductions: data.deductions || [],
        totalDeductions: data.total_deductions,
        netSalary: data.net_salary,
        attendanceData: data.attendance_data || [],
        createdAt: data.created_at
      };
    } catch (err) {
      console.error('Error in salaryRecordsTable.add:', err);
      return null;
    }
  }
};

// Settings operations
export const settingsTable = {
  async get() {
    if (!supabaseClient) {
      return {
        baseHourlyRate: 119,
        ot1Multiplier: 1.34,
        ot2Multiplier: 1.67,
        baseMonthSalary: 28590,
        deductions: [
          { name: "勞保費", amount: 525, description: "勞工保險費用" },
          { name: "健保費", amount: 372, description: "全民健康保險費用" }
        ]
      };
    }
    
    try {
      const { data, error } = await supabaseClient
        .from('settings')
        .select('*')
        .limit(1)
        .single();
        
      if (error && error.code !== 'PGRST116') { // PGRST116 is "No rows returned" error
        console.error('Error fetching settings:', error);
        throw error;
      }
      
      // If we have data, transform the column names from snake_case to camelCase
      if (data) {
        return {
          baseHourlyRate: data.base_hourly_rate,
          ot1Multiplier: data.ot1_multiplier,
          ot2Multiplier: data.ot2_multiplier,
          baseMonthSalary: data.base_month_salary,
          deductions: data.deductions || [
            { name: "勞保費", amount: 525, description: "勞工保險費用" },
            { name: "健保費", amount: 372, description: "全民健康保險費用" }
          ]
        };
      }
    } catch (err) {
      console.error('Error in settingsTable.get:', err);
    }
    
    // Return defaults if anything goes wrong
    return {
      baseHourlyRate: 119,
      ot1Multiplier: 1.34,
      ot2Multiplier: 1.67,
      baseMonthSalary: 28590,
      deductions: [
        { name: "勞保費", amount: 525, description: "勞工保險費用" },
        { name: "健保費", amount: 372, description: "全民健康保險費用" }
      ]
    };
  },
  
  async save(settings: any) {
    if (!supabaseClient) return null;
    
    // Transform from camelCase to snake_case for database
    const dbSettings = {
      base_hourly_rate: settings.baseHourlyRate,
      ot1_multiplier: settings.ot1Multiplier,
      ot2_multiplier: settings.ot2Multiplier,
      base_month_salary: settings.baseMonthSalary,
      deductions: settings.deductions
    };
    
    try {
      // First check if settings already exist
      const { data: existingSettings } = await supabaseClient
        .from('settings')
        .select('id')
        .limit(1);
        
      let result;
      
      if (existingSettings && existingSettings.length > 0) {
        // Update existing settings
        const { data, error } = await supabaseClient
          .from('settings')
          .update(dbSettings)
          .eq('id', existingSettings[0].id)
          .select()
          .single();
          
        if (error) {
          console.error('Error updating settings:', error);
          throw error;
        }
        
        // Transform back to camelCase for frontend
        result = {
          baseHourlyRate: data.base_hourly_rate,
          ot1Multiplier: data.ot1_multiplier,
          ot2Multiplier: data.ot2_multiplier,
          baseMonthSalary: data.base_month_salary,
          deductions: data.deductions
        };
      } else {
        // Create new settings
        const { data, error } = await supabaseClient
          .from('settings')
          .insert([dbSettings])
          .select()
          .single();
          
        if (error) {
          console.error('Error creating settings:', error);
          throw error;
        }
        
        // Transform back to camelCase for frontend
        result = {
          baseHourlyRate: data.base_hourly_rate,
          ot1Multiplier: data.ot1_multiplier,
          ot2Multiplier: data.ot2_multiplier,
          baseMonthSalary: data.base_month_salary,
          deductions: data.deductions
        };
      }
      
      return result;
    } catch (err) {
      console.error('Error in settingsTable.save:', err);
      return null;
    }
  }
};

// Holidays table operations
export const holidaysTable = {
  async getAll() {
    if (!supabaseClient) return [];
    
    try {
      const { data, error } = await supabaseClient
        .from('holidays')
        .select('*')
        .order('date', { ascending: true });
        
      if (error) {
        console.error('Error fetching holidays:', error);
        throw error;
      }
      
      return data || [];
    } catch (err) {
      console.error('Error in holidaysTable.getAll:', err);
      return [];
    }
  },
  
  async add(holiday: { date: string, description?: string }) {
    if (!supabaseClient) return null;
    
    try {
      const { data, error } = await supabaseClient
        .from('holidays')
        .insert([holiday])
        .select()
        .single();
        
      if (error) {
        console.error('Error adding holiday:', error);
        throw error;
      }
      
      return data;
    } catch (err) {
      console.error('Error in holidaysTable.add:', err);
      return null;
    }
  },
  
  async delete(id: number) {
    if (!supabaseClient) return false;
    
    try {
      const { error } = await supabaseClient
        .from('holidays')
        .delete()
        .eq('id', id);
        
      if (error) {
        console.error('Error deleting holiday:', error);
        throw error;
      }
      
      return true;
    } catch (err) {
      console.error('Error in holidaysTable.delete:', err);
      return false;
    }
  }
};
