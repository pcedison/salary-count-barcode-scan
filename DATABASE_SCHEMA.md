# 資料庫結構文檔

## 概述
員工薪資管理系統使用PostgreSQL資料庫，透過Drizzle ORM進行管理。支援Supabase雲端部署或本地PostgreSQL。

## 資料表結構

### 1. employees (員工資料表)
```sql
CREATE TABLE employees (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,                    -- 員工姓名
  id_number TEXT NOT NULL UNIQUE,       -- 身份證號碼（加密）
  department TEXT,                       -- 部門
  is_active BOOLEAN DEFAULT true,       -- 是否在職
  created_at TIMESTAMP DEFAULT NOW()    -- 建立時間
);
```

### 2. attendance_records (考勤記錄表)
```sql
CREATE TABLE attendance_records (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id),
  date DATE NOT NULL,                    -- 考勤日期
  clock_in TIME,                        -- 上班時間
  clock_out TIME,                       -- 下班時間
  is_holiday BOOLEAN DEFAULT false,     -- 是否假日
  is_barcode_scanned BOOLEAN DEFAULT false, -- 是否條碼掃描
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 3. salary_records (薪資記錄表)
```sql
CREATE TABLE salary_records (
  id SERIAL PRIMARY KEY,
  salary_year INTEGER NOT NULL,         -- 薪資年份
  salary_month INTEGER NOT NULL,        -- 薪資月份
  employee_id INTEGER REFERENCES employees(id),
  employee_name TEXT NOT NULL,          -- 員工姓名
  base_salary DECIMAL(10,2),           -- 基本薪資
  housing_allowance DECIMAL(10,2) DEFAULT 0, -- 住宿津貼
  welfare_allowance DECIMAL(10,2) DEFAULT 0, -- 福利津貼
  total_ot1_hours DECIMAL(5,2) DEFAULT 0,    -- OT1總時數
  total_ot2_hours DECIMAL(5,2) DEFAULT 0,    -- OT2總時數
  total_overtime_pay DECIMAL(10,2) DEFAULT 0, -- 加班費總額
  holiday_days INTEGER DEFAULT 0,       -- 假日天數
  holiday_daily_salary DECIMAL(10,2) DEFAULT 0, -- 假日日薪
  total_holiday_pay DECIMAL(10,2) DEFAULT 0,     -- 假日薪資
  gross_salary DECIMAL(10,2),          -- 總薪資
  deductions JSONB,                     -- 扣款項目 (JSON格式)
  total_deductions DECIMAL(10,2) DEFAULT 0, -- 總扣款
  net_salary DECIMAL(10,2),            -- 實發薪資
  attendance_data JSONB,               -- 考勤詳細資料
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 4. system_settings (系統設定表)
```sql
CREATE TABLE system_settings (
  id SERIAL PRIMARY KEY,
  base_hourly_rate DECIMAL(8,2) DEFAULT 119,  -- 基本時薪
  ot1_multiplier DECIMAL(4,2) DEFAULT 1.34,   -- OT1倍率
  ot2_multiplier DECIMAL(4,2) DEFAULT 1.67,   -- OT2倍率
  standard_work_hours DECIMAL(4,2) DEFAULT 8, -- 標準工時
  admin_pin TEXT DEFAULT '1234',              -- 管理員PIN
  deduction_items JSONB,                      -- 扣款項目設定
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 5. holidays (假日設定表)
```sql
CREATE TABLE holidays (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL UNIQUE,            -- 假日日期
  name TEXT NOT NULL,                   -- 假日名稱
  is_paid BOOLEAN DEFAULT false,        -- 是否有薪假日
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 6. session (會話管理表)
```sql
CREATE TABLE session (
  sid VARCHAR NOT NULL COLLATE "default" PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
```

## 索引設計

### 效能索引
```sql
-- 員工查詢索引
CREATE INDEX idx_employees_active ON employees(is_active);
CREATE INDEX idx_employees_id_number ON employees(id_number);

-- 考勤記錄索引
CREATE INDEX idx_attendance_employee_date ON attendance_records(employee_id, date);
CREATE INDEX idx_attendance_date ON attendance_records(date);

-- 薪資記錄索引
CREATE INDEX idx_salary_year_month ON salary_records(salary_year, salary_month);
CREATE INDEX idx_salary_employee ON salary_records(employee_id);

-- 假日索引
CREATE INDEX idx_holidays_date ON holidays(date);
```

## 資料關係

### 外鍵約束
```sql
-- 考勤記錄關聯員工
ALTER TABLE attendance_records 
ADD CONSTRAINT fk_attendance_employee 
FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;

-- 薪資記錄關聯員工
ALTER TABLE salary_records 
ADD CONSTRAINT fk_salary_employee 
FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
```

## 資料範例

### 員工資料範例
```sql
INSERT INTO employees (name, id_number, department) VALUES
('陳文山', 'N123456789', '生產部'),
('王小文', 'K011133456', '管理部');
```

### 系統設定範例
```sql
INSERT INTO system_settings (
  base_hourly_rate, 
  ot1_multiplier, 
  ot2_multiplier, 
  admin_pin,
  deduction_items
) VALUES (
  119.00,
  1.34,
  1.67,
  '1234',
  '[
    {"name": "勞保費", "amount": 658},
    {"name": "健保費", "amount": 443},
    {"name": "服務費", "amount": 1800},
    {"name": "宿舍費", "amount": 2500}
  ]'::jsonb
);
```

### 薪資記錄範例
```sql
INSERT INTO salary_records (
  salary_year, salary_month, employee_id, employee_name,
  base_salary, welfare_allowance, total_ot1_hours, total_ot2_hours,
  total_overtime_pay, gross_salary, total_deductions, net_salary,
  deductions
) VALUES (
  2025, 5, 1, '陳文山',
  28590, 2500, 34, 9,
  7211, 38301, 5401, 32900,
  '[
    {"name": "勞保費", "amount": 658},
    {"name": "健保費", "amount": 443},
    {"name": "服務費", "amount": 1800},
    {"name": "宿舍費", "amount": 2500}
  ]'::jsonb
);
```

## 資料遷移

### 初始化腳本
```bash
# 使用Drizzle推送結構
npm run db:push

# 或執行SQL文件
psql -d your_database -f database/init.sql
```

### 備份與還原
```bash
# 備份
pg_dump -h hostname -U username -d database_name > backup.sql

# 還原
psql -h hostname -U username -d database_name < backup.sql
```

## 安全考量

### 資料加密
- 身份證號碼使用凱薩密碼加密
- 會話資料加密存儲
- 敏感設定值環境變數管理

### 存取控制
- 管理員功能PIN碼保護
- API路由權限驗證
- 資料庫連接加密

## 維護操作

### 定期清理
```sql
-- 清理過期會話
DELETE FROM session WHERE expire < NOW();

-- 清理舊的考勤記錄（保留2年）
DELETE FROM attendance_records 
WHERE created_at < NOW() - INTERVAL '2 years';
```

### 效能監控
```sql
-- 檢查資料表大小
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE schemaname = 'public';

-- 檢查索引使用情況
SELECT 
  indexname,
  indexdef,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes;
```

## 故障排除

### 常見問題
1. **連接超時**: 檢查DATABASE_URL設定
2. **權限錯誤**: 確認資料庫使用者權限
3. **資料不一致**: 執行完整性檢查腳本

### 完整性檢查
```sql
-- 檢查孤立記錄
SELECT * FROM attendance_records a
WHERE NOT EXISTS (SELECT 1 FROM employees e WHERE e.id = a.employee_id);

SELECT * FROM salary_records s
WHERE NOT EXISTS (SELECT 1 FROM employees e WHERE e.id = s.employee_id);
```