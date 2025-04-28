-- 更新的 Supabase SQL Schema (匹配當前系統)
-- 注意：此文件需要在 Supabase SQL 編輯器中執行以創建匹配現有應用程序的數據結構

-- 刪除現有表以確保從頭創建正確的結構
-- 注意: 刪除表的順序很重要，因為存在外鍵約束
DROP TABLE IF EXISTS holidays;
DROP TABLE IF EXISTS salary_records;
DROP TABLE IF EXISTS temporary_attendance;
DROP TABLE IF EXISTS settings;
DROP TABLE IF EXISTS employees;
DROP TABLE IF EXISTS users;

-- Users Table (基本使用者表)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Employees Table (員工資料，用於條碼掃描)
CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  id_number TEXT NOT NULL UNIQUE, -- 身分證字號或居留證號碼（條碼ID）
  position TEXT,
  department TEXT,
  email TEXT,
  phone TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Temporary Attendance Table (臨時考勤記錄)
CREATE TABLE IF NOT EXISTS temporary_attendance (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  date TEXT NOT NULL,
  clock_in TEXT NOT NULL,
  clock_out TEXT DEFAULT '',
  is_holiday BOOLEAN DEFAULT FALSE,
  is_barcode_scanned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Settings Table (系統設置)
CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  base_hourly_rate DOUBLE PRECISION NOT NULL DEFAULT 119,
  ot1_multiplier DOUBLE PRECISION NOT NULL DEFAULT 1.34,
  ot2_multiplier DOUBLE PRECISION NOT NULL DEFAULT 1.67,
  base_month_salary DOUBLE PRECISION NOT NULL DEFAULT 28590,
  welfare_allowance DOUBLE PRECISION NOT NULL DEFAULT 0,
  deductions JSONB NOT NULL DEFAULT '[]',
  admin_pin TEXT NOT NULL DEFAULT '123456',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Salary Records Table (薪資記錄)
CREATE TABLE IF NOT EXISTS salary_records (
  id SERIAL PRIMARY KEY,
  salary_year INTEGER NOT NULL,
  salary_month INTEGER NOT NULL,
  base_salary DOUBLE PRECISION NOT NULL,
  housing_allowance DOUBLE PRECISION DEFAULT 0,
  welfare_allowance DOUBLE PRECISION DEFAULT 0,
  total_ot1_hours DOUBLE PRECISION DEFAULT 0,
  total_ot2_hours DOUBLE PRECISION DEFAULT 0,
  total_overtime_pay DOUBLE PRECISION DEFAULT 0,
  holiday_days INTEGER DEFAULT 0,
  holiday_daily_salary DOUBLE PRECISION DEFAULT 0,
  total_holiday_pay DOUBLE PRECISION DEFAULT 0,
  gross_salary DOUBLE PRECISION NOT NULL,
  deductions JSONB DEFAULT '[]',
  total_deductions DOUBLE PRECISION DEFAULT 0,
  net_salary DOUBLE PRECISION NOT NULL,
  attendance_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Holidays Table (假日設置)
CREATE TABLE IF NOT EXISTS holidays (
  id SERIAL PRIMARY KEY,
  date TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 初始化設置 (默認值)
-- 嘗試插入前先檢查表是否存在並添加所有必要的欄位
DO $$
BEGIN
  -- 檢查 welfare_allowance 欄位是否存在
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'settings'
    AND column_name = 'welfare_allowance'
  ) THEN
    BEGIN
      ALTER TABLE settings ADD COLUMN welfare_allowance DOUBLE PRECISION NOT NULL DEFAULT 0;
    EXCEPTION
      WHEN duplicate_column THEN
        NULL; -- 如果欄位已存在，忽略錯誤
    END;
  END IF;

  -- 檢查 admin_pin 欄位是否存在
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'settings'
    AND column_name = 'admin_pin'
  ) THEN
    BEGIN
      ALTER TABLE settings ADD COLUMN admin_pin TEXT NOT NULL DEFAULT '123456';
    EXCEPTION
      WHEN duplicate_column THEN
        NULL; -- 如果欄位已存在，忽略錯誤
    END;
  END IF;

  -- 檢查 deductions 欄位是否存在
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'settings'
    AND column_name = 'deductions'
  ) THEN
    BEGIN
      ALTER TABLE settings ADD COLUMN deductions JSONB NOT NULL DEFAULT '[]';
    EXCEPTION
      WHEN duplicate_column THEN
        NULL; -- 如果欄位已存在，忽略錯誤
    END;
  END IF;
END;
$$;

-- 檢查表是否已經有數據
DO $$
DECLARE
    rec_count integer;
BEGIN
    -- 檢查數據量
    SELECT COUNT(*) INTO rec_count FROM settings;
    
    -- 如果沒有數據，則插入預設值
    IF rec_count = 0 THEN
        INSERT INTO settings (
          base_hourly_rate, 
          ot1_multiplier, 
          ot2_multiplier, 
          base_month_salary
        )
        VALUES (
          119, 
          1.34, 
          1.67, 
          28590
        );

        -- 更新其他欄位
        UPDATE settings 
        SET 
          welfare_allowance = 0,
          deductions = '[
            {"name": "勞保費", "amount": 1042, "description": "勞工保險費用"},
            {"name": "健保費", "amount": 600, "description": "健康保險費用"},
            {"name": "服務費", "amount": 500, "description": "各種服務處理費用"},
            {"name": "住宿費", "amount": 3000, "description": "公司宿舍住宿費用"}
          ]',
          admin_pin = '123456'
        WHERE id = 1;
    END IF;
END;
$$;

-- 添加索引以提高查詢性能 (帶有欄位檢查)
DO $$
BEGIN
  -- 員工表索引
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'employees' AND column_name = 'id_number'
  ) THEN
    BEGIN
      CREATE INDEX IF NOT EXISTS idx_employees_id_number ON employees(id_number);
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
  END IF;

  -- 考勤表索引 - employee_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'temporary_attendance' AND column_name = 'employee_id'
  ) THEN
    BEGIN
      CREATE INDEX IF NOT EXISTS idx_temp_attendance_employee_id ON temporary_attendance(employee_id);
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
  END IF;

  -- 考勤表索引 - date
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'temporary_attendance' AND column_name = 'date'
  ) THEN
    BEGIN
      CREATE INDEX IF NOT EXISTS idx_temp_attendance_date ON temporary_attendance(date);
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
  END IF;

  -- 考勤表聯合索引 - date, employee_id
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'temporary_attendance' AND column_name = 'date'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'temporary_attendance' AND column_name = 'employee_id'
  ) THEN
    BEGIN
      CREATE INDEX IF NOT EXISTS idx_temp_attendance_date_empid ON temporary_attendance(date, employee_id);
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
  END IF;

  -- 薪資記錄索引
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'salary_records' AND column_name = 'salary_year'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'salary_records' AND column_name = 'salary_month'
  ) THEN
    BEGIN
      CREATE INDEX IF NOT EXISTS idx_salary_records_year_month ON salary_records(salary_year, salary_month);
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
  END IF;

  -- 假日表索引
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'holidays' AND column_name = 'date'
  ) THEN
    BEGIN
      CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(date);
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
  END IF;
END;
$$;

-- 設置啟用 RLS（Row Level Security）策略 - 適用於有多用戶訪問的場景
DO $$
BEGIN
  -- 為每個表啟用 RLS，僅當表存在時
  BEGIN
    ALTER TABLE users ENABLE ROW LEVEL SECURITY;
    
    -- 檢查策略是否已存在
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = 'users' AND policyname = '允許完全訪問'
    ) THEN
      CREATE POLICY "允許完全訪問" ON users FOR ALL USING (true);
    END IF;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  
  BEGIN
    ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
    
    -- 檢查策略是否已存在
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = 'employees' AND policyname = '允許完全訪問'
    ) THEN
      CREATE POLICY "允許完全訪問" ON employees FOR ALL USING (true);
    END IF;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  
  BEGIN
    ALTER TABLE temporary_attendance ENABLE ROW LEVEL SECURITY;
    
    -- 檢查策略是否已存在
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = 'temporary_attendance' AND policyname = '允許完全訪問'
    ) THEN
      CREATE POLICY "允許完全訪問" ON temporary_attendance FOR ALL USING (true);
    END IF;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  
  BEGIN
    ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
    
    -- 檢查策略是否已存在
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = 'settings' AND policyname = '允許完全訪問'
    ) THEN
      CREATE POLICY "允許完全訪問" ON settings FOR ALL USING (true);
    END IF;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  
  BEGIN
    ALTER TABLE salary_records ENABLE ROW LEVEL SECURITY;
    
    -- 檢查策略是否已存在
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = 'salary_records' AND policyname = '允許完全訪問'
    ) THEN
      CREATE POLICY "允許完全訪問" ON salary_records FOR ALL USING (true);
    END IF;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  
  BEGIN
    ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
    
    -- 檢查策略是否已存在
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE tablename = 'holidays' AND policyname = '允許完全訪問'
    ) THEN
      CREATE POLICY "允許完全訪問" ON holidays FOR ALL USING (true);
    END IF;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
END;
$$;