# 資料庫設置指南

## 資料庫架構概述

員工薪資計算系統使用 PostgreSQL 作為主要資料庫，支援 Supabase 雲端服務和本地部署兩種方式。

### 資料表結構

#### 員工資料表 (employees)
```sql
CREATE TABLE employees (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  id_number VARCHAR(20) UNIQUE NOT NULL,
  department VARCHAR(50),
  position VARCHAR(50),
  hourly_rate DECIMAL(8,2) DEFAULT 119.00,
  active BOOLEAN DEFAULT true,
  join_date DATE,
  leave_date DATE,
  note TEXT,
  is_encrypted BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### 考勤記錄表 (attendance)
```sql
CREATE TABLE attendance (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id),
  date VARCHAR(10) NOT NULL, -- YYYY/MM/DD format
  clock_in VARCHAR(5), -- HH:MM format
  clock_out VARCHAR(5), -- HH:MM format
  work_hours DECIMAL(4,2),
  overtime_hours DECIMAL(4,2),
  is_barcode_scanned BOOLEAN DEFAULT false,
  note TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### 薪資記錄表 (salary_records)
```sql
CREATE TABLE salary_records (
  id SERIAL PRIMARY KEY,
  employee_id INTEGER REFERENCES employees(id),
  employee_name VARCHAR(100),
  salary_year INTEGER,
  salary_month INTEGER,
  base_salary DECIMAL(10,2),
  overtime_pay DECIMAL(10,2),
  gross_salary DECIMAL(10,2),
  labor_insurance DECIMAL(8,2),
  health_insurance DECIMAL(8,2),
  total_deductions DECIMAL(10,2),
  net_salary DECIMAL(10,2),
  work_days INTEGER,
  total_work_hours DECIMAL(6,2),
  total_overtime_hours DECIMAL(6,2),
  calculation_method VARCHAR(20) DEFAULT 'accounting',
  calculation_date TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### 系統設置表 (settings)
```sql
CREATE TABLE settings (
  id SERIAL PRIMARY KEY,
  base_hourly_rate DECIMAL(8,2) DEFAULT 119.00,
  ot1_multiplier DECIMAL(4,2) DEFAULT 1.34,
  ot2_multiplier DECIMAL(4,2) DEFAULT 1.67,
  standard_work_hours INTEGER DEFAULT 8,
  deduction_items JSONB,
  admin_pin VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### 假日表 (holidays)
```sql
CREATE TABLE holidays (
  id SERIAL PRIMARY KEY,
  date VARCHAR(10) NOT NULL, -- YYYY/MM/DD format
  name VARCHAR(100),
  type VARCHAR(20) DEFAULT 'national',
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 會話表 (session)
```sql
CREATE TABLE session (
  sid VARCHAR NOT NULL COLLATE "default",
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
```

### 索引設置

```sql
-- 員工表索引
CREATE INDEX idx_employees_id_number ON employees(id_number);
CREATE INDEX idx_employees_active ON employees(active);
CREATE INDEX idx_employees_department ON employees(department);

-- 考勤記錄索引
CREATE INDEX idx_attendance_employee_id ON attendance(employee_id);
CREATE INDEX idx_attendance_date ON attendance(date);
CREATE INDEX idx_attendance_employee_date ON attendance(employee_id, date);

-- 薪資記錄索引
CREATE INDEX idx_salary_records_employee_id ON salary_records(employee_id);
CREATE INDEX idx_salary_records_year_month ON salary_records(salary_year, salary_month);
CREATE INDEX idx_salary_records_employee_year_month ON salary_records(employee_id, salary_year, salary_month);

-- 假日表索引
CREATE INDEX idx_holidays_date ON holidays(date);

-- 會話表索引
CREATE INDEX idx_session_expire ON session(expire);
```

## Supabase 設置步驟

### 1. 創建 Supabase 專案

1. 前往 https://supabase.com
2. 註冊帳號或登入
3. 點擊「New Project」
4. 填寫專案資訊：
   - Organization: 選擇或創建組織
   - Project name: employee-salary-system
   - Database password: 設置強密碼
   - Region: 選擇台灣或鄰近地區

### 2. 獲取連接資訊

在 Supabase 專案面板中：

1. 點擊左側選單「Settings」
2. 選擇「Database」
3. 在「Connection info」區域找到：
   - Host
   - Database name
   - Port
   - User
   - Password

4. 在「Connection string」區域複製：
   - URI (for Prisma/Drizzle)

### 3. 設置環境變數

```bash
# .env 檔案內容
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key
DATABASE_URL=postgresql://postgres:your-password@db.your-project-id.supabase.co:5432/postgres
```

### 4. 初始化資料庫結構

```bash
# 推送資料庫結構到 Supabase
npm run db:push

# 驗證連接
npm run db:check
```

### 5. 設置 Row Level Security (RLS)

在 Supabase SQL 編輯器中執行：

```sql
-- 啟用 RLS
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;

-- 創建政策（允許所有操作，因為應用程式使用服務金鑰）
CREATE POLICY "Allow all operations" ON employees FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON attendance FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON salary_records FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON settings FOR ALL USING (true);
CREATE POLICY "Allow all operations" ON holidays FOR ALL USING (true);
```

## 本地 PostgreSQL 設置

### 1. 安裝 PostgreSQL

#### Ubuntu/Debian
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
```

#### CentOS/RHEL
```bash
sudo yum install postgresql-server postgresql-contrib
sudo postgresql-setup initdb
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

#### macOS
```bash
brew install postgresql
brew services start postgresql
```

#### Windows
下載並安裝 PostgreSQL：https://www.postgresql.org/download/windows/

### 2. 創建資料庫和使用者

```bash
# 切換到 postgres 使用者
sudo -u postgres psql

# 在 PostgreSQL 命令列中執行
CREATE DATABASE employee_salary_db 
WITH ENCODING 'UTF8' 
LC_COLLATE='zh_TW.UTF-8' 
LC_CTYPE='zh_TW.UTF-8';

CREATE USER app_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE employee_salary_db TO app_user;

# 授予創建表格權限
GRANT CREATE ON SCHEMA public TO app_user;

\q
```

### 3. 配置 PostgreSQL

編輯 `postgresql.conf`：

```bash
# 找到配置檔案位置
sudo -u postgres psql -c "SHOW config_file;"

# 編輯配置檔案
sudo nano /etc/postgresql/13/main/postgresql.conf
```

重要設置：
```conf
# 連接設置
listen_addresses = 'localhost'
port = 5432
max_connections = 100

# 記憶體設置
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB

# 寫入優化
wal_buffers = 16MB
checkpoint_completion_target = 0.7

# 查詢優化
random_page_cost = 1.1
effective_io_concurrency = 200
```

編輯 `pg_hba.conf`：
```bash
sudo nano /etc/postgresql/13/main/pg_hba.conf
```

加入以下行：
```conf
# 允許本地連接
local   employee_salary_db   app_user   md5
host    employee_salary_db   app_user   127.0.0.1/32   md5
```

重啟 PostgreSQL：
```bash
sudo systemctl restart postgresql
```

### 4. 測試連接

```bash
# 測試連接
psql -h localhost -U app_user -d employee_salary_db

# 或使用環境變數
export DATABASE_URL="postgresql://app_user:your_password@localhost:5432/employee_salary_db"
```

## 資料庫初始化腳本

### 創建初始數據

```sql
-- 插入系統設置
INSERT INTO settings (
  base_hourly_rate,
  ot1_multiplier,
  ot2_multiplier,
  standard_work_hours,
  deduction_items,
  admin_pin
) VALUES (
  119.00,
  1.34,
  1.67,
  8,
  '[
    {"name": "勞保費", "rate": 0.105, "type": "percentage"},
    {"name": "健保費", "rate": 0.0517, "type": "percentage"}
  ]'::jsonb,
  '$2b$10$encrypted_admin_pin_hash'
);

-- 插入假日數據 (台灣國定假日範例)
INSERT INTO holidays (date, name, type) VALUES
('2025/01/01', '元旦', 'national'),
('2025/02/10', '春節假期', 'national'),
('2025/02/11', '春節假期', 'national'),
('2025/02/12', '春節假期', 'national'),
('2025/02/13', '春節假期', 'national'),
('2025/02/14', '春節假期', 'national'),
('2025/04/04', '兒童節', 'national'),
('2025/04/05', '清明節', 'national'),
('2025/05/01', '勞動節', 'national'),
('2025/06/10', '端午節', 'national'),
('2025/09/17', '中秋節', 'national'),
('2025/10/10', '國慶日', 'national');
```

## 資料庫維護

### 定期維護任務

```sql
-- 分析表格統計資訊
ANALYZE employees;
ANALYZE attendance;
ANALYZE salary_records;

-- 重建索引
REINDEX TABLE employees;
REINDEX TABLE attendance;
REINDEX TABLE salary_records;

-- 清理舊會話記錄
DELETE FROM session WHERE expire < NOW();
```

### 備份腳本

```bash
#!/bin/bash
# backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/employee-salary"
DB_NAME="employee_salary_db"
DB_USER="app_user"

# 創建備份目錄
mkdir -p $BACKUP_DIR

# 執行備份
pg_dump -h localhost -U $DB_USER -d $DB_NAME > $BACKUP_DIR/backup_$DATE.sql

# 壓縮備份
gzip $BACKUP_DIR/backup_$DATE.sql

# 保留最近30天的備份
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +30 -delete

echo "Backup completed: $BACKUP_DIR/backup_$DATE.sql.gz"
```

### 恢復腳本

```bash
#!/bin/bash
# restore.sh

if [ $# -eq 0 ]; then
    echo "Usage: $0 <backup_file>"
    exit 1
fi

BACKUP_FILE=$1
DB_NAME="employee_salary_db"
DB_USER="app_user"

# 檢查備份檔案是否存在
if [ ! -f "$BACKUP_FILE" ]; then
    echo "Backup file not found: $BACKUP_FILE"
    exit 1
fi

# 解壓縮（如果需要）
if [[ $BACKUP_FILE == *.gz ]]; then
    gunzip -c $BACKUP_FILE | psql -h localhost -U $DB_USER -d $DB_NAME
else
    psql -h localhost -U $DB_USER -d $DB_NAME < $BACKUP_FILE
fi

echo "Restore completed from: $BACKUP_FILE"
```

## 效能監控

### 監控查詢

```sql
-- 檢查資料庫大小
SELECT 
    pg_database.datname,
    pg_size_pretty(pg_database_size(pg_database.datname)) AS size
FROM pg_database;

-- 檢查表格大小
SELECT 
    tablename,
    pg_size_pretty(pg_total_relation_size(tablename::regclass)) AS size
FROM pg_tables 
WHERE schemaname = 'public';

-- 檢查索引使用情況
SELECT 
    schemaname,
    tablename,
    attname,
    n_distinct,
    correlation
FROM pg_stats
WHERE schemaname = 'public';

-- 檢查慢查詢
SELECT 
    query,
    calls,
    total_time,
    mean_time,
    rows
FROM pg_stat_statements
ORDER BY total_time DESC
LIMIT 10;
```

### 定期檢查腳本

```bash
#!/bin/bash
# monitor.sh

DB_NAME="employee_salary_db"
DB_USER="app_user"

echo "=== Database Health Check ==="
echo "Date: $(date)"

# 檢查連接數
echo -n "Active connections: "
psql -h localhost -U $DB_USER -d $DB_NAME -t -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';"

# 檢查資料庫大小
echo -n "Database size: "
psql -h localhost -U $DB_USER -d $DB_NAME -t -c "SELECT pg_size_pretty(pg_database_size('$DB_NAME'));"

# 檢查最大表格大小
echo "Largest tables:"
psql -h localhost -U $DB_USER -d $DB_NAME -c "
SELECT 
    tablename,
    pg_size_pretty(pg_total_relation_size(tablename::regclass)) AS size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(tablename::regclass) DESC
LIMIT 5;"

echo "=== End Health Check ==="
```

## 故障排除

### 常見問題

1. **連接被拒絕**
   ```bash
   # 檢查 PostgreSQL 是否運行
   sudo systemctl status postgresql
   
   # 檢查端口是否開放
   netstat -tlnp | grep 5432
   ```

2. **權限不足**
   ```sql
   -- 重新授權
   GRANT ALL PRIVILEGES ON DATABASE employee_salary_db TO app_user;
   GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_user;
   GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO app_user;
   ```

3. **記憶體不足**
   ```conf
   # 調整 postgresql.conf
   shared_buffers = 128MB
   work_mem = 4MB
   maintenance_work_mem = 32MB
   ```

4. **磁碟空間不足**
   ```bash
   # 清理日誌
   sudo -u postgres psql -c "SELECT pg_rotate_logfile();"
   
   # 清理舊的 WAL 檔案
   sudo -u postgres pg_archivecleanup /var/lib/postgresql/13/main/pg_wal $(sudo -u postgres pg_controldata /var/lib/postgresql/13/main | grep "Latest checkpoint's REDO WAL file" | awk '{print $5}')
   ```

資料庫設置完成後，請參考 `MAINTENANCE.md` 瞭解日常維護程序。