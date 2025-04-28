-- Supabase SQL Schema for Salary Calculator Application

-- Users Table (基本使用者表)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Temporary Attendance Table (臨時考勤記錄)
CREATE TABLE IF NOT EXISTS temporary_attendance (
  id SERIAL PRIMARY KEY,
  date TEXT NOT NULL,
  clock_in TEXT NOT NULL,
  clock_out TEXT NOT NULL,
  is_holiday BOOLEAN NOT NULL DEFAULT FALSE,
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
  admin_pin TEXT DEFAULT '123456',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Salary Records Table (薪資記錄)
CREATE TABLE IF NOT EXISTS salary_records (
  id SERIAL PRIMARY KEY,
  salary_year INTEGER NOT NULL,
  salary_month INTEGER NOT NULL,
  base_salary DOUBLE PRECISION NOT NULL,
  housing_allowance DOUBLE PRECISION NOT NULL DEFAULT 0,
  welfare_allowance DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_ot1_hours DOUBLE PRECISION NOT NULL,
  total_ot2_hours DOUBLE PRECISION NOT NULL,
  total_overtime_pay DOUBLE PRECISION NOT NULL,
  holiday_days INTEGER NOT NULL,
  holiday_daily_salary DOUBLE PRECISION NOT NULL,
  total_holiday_pay DOUBLE PRECISION NOT NULL,
  gross_salary DOUBLE PRECISION NOT NULL,
  deductions JSONB NOT NULL,
  total_deductions DOUBLE PRECISION NOT NULL,
  net_salary DOUBLE PRECISION NOT NULL,
  attendance_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (salary_year, salary_month)
);

-- Holidays Table (假日設置)
CREATE TABLE IF NOT EXISTS holidays (
  id SERIAL PRIMARY KEY,
  date TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 初始化設置 (默認值)
INSERT INTO settings (base_hourly_rate, ot1_multiplier, ot2_multiplier, base_month_salary, welfare_allowance, deductions, admin_pin)
VALUES (119, 1.34, 1.67, 28590, 0, '[
  {"name": "勞保費", "amount": 1042, "description": "勞工保險費用"},
  {"name": "健保費", "amount": 600, "description": "健康保險費用"},
  {"name": "服務費", "amount": 500, "description": "各種服務處理費用"},
  {"name": "住宿費", "amount": 3000, "description": "公司宿舍住宿費用"}
]', '123456')
ON CONFLICT (id) DO NOTHING;

-- 添加一些預設假日範例
INSERT INTO holidays (date, description)
VALUES 
  ('2025-01-01', '元旦'),
  ('2025-02-28', '和平紀念日'),
  ('2025-04-04', '兒童節'),
  ('2025-04-05', '清明節'),
  ('2025-05-01', '勞動節')
ON CONFLICT (date) DO NOTHING;

-- 添加索引以提高查詢性能
CREATE INDEX IF NOT EXISTS idx_temp_attendance_date ON temporary_attendance(date);
CREATE INDEX IF NOT EXISTS idx_salary_records_year_month ON salary_records(salary_year, salary_month);
CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(date);
