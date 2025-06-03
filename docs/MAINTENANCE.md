# 系統維護指南

## 日常維護清單

### 每日檢查 (自動化)

```bash
#!/bin/bash
# daily-check.sh

LOG_FILE="/var/log/employee-salary/daily-check.log"
DATE=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$DATE] Starting daily maintenance check" >> $LOG_FILE

# 檢查服務狀態
if ! pm2 status employee-salary > /dev/null 2>&1; then
    echo "[$DATE] WARNING: Application not running" >> $LOG_FILE
    pm2 restart employee-salary
fi

# 檢查資料庫連接
if ! npm run db:check > /dev/null 2>&1; then
    echo "[$DATE] ERROR: Database connection failed" >> $LOG_FILE
fi

# 檢查磁碟空間
DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
if [ $DISK_USAGE -gt 85 ]; then
    echo "[$DATE] WARNING: Disk usage at ${DISK_USAGE}%" >> $LOG_FILE
fi

# 檢查記憶體使用
MEM_USAGE=$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}')
if (( $(echo "$MEM_USAGE > 85.0" | bc -l) )); then
    echo "[$DATE] WARNING: Memory usage at ${MEM_USAGE}%" >> $LOG_FILE
fi

# 清理臨時檔案
find /tmp -name "*.tmp" -mtime +1 -delete

echo "[$DATE] Daily check completed" >> $LOG_FILE
```

### 每週維護

```bash
#!/bin/bash
# weekly-maintenance.sh

echo "Starting weekly maintenance..."

# 1. 清理舊日誌
find /var/log/employee-salary -name "*.log" -mtime +7 -delete
journalctl --vacuum-time=7d

# 2. 更新系統套件
apt update && apt list --upgradable

# 3. 重啟服務以釋放記憶體
pm2 restart employee-salary

# 4. 資料庫維護
psql -U app_user -d employee_salary_db -c "VACUUM ANALYZE;"

# 5. 檢查備份完整性
ls -la /var/backups/employee-salary/ | tail -10

# 6. 產生週報告
node scripts/generate-weekly-report.js

echo "Weekly maintenance completed"
```

### 每月維護

```bash
#!/bin/bash
# monthly-maintenance.sh

echo "Starting monthly maintenance..."

# 1. 完整系統更新
apt update && apt upgrade -y

# 2. 重建資料庫索引
psql -U app_user -d employee_salary_db -c "REINDEX DATABASE employee_salary_db;"

# 3. 清理舊備份
find /var/backups/employee-salary -name "*.json" -mtime +90 -delete

# 4. 效能分析
npm run performance:analyze

# 5. 安全性檢查
npm audit
nmap localhost

# 6. 憑證檢查
certbot certificates

echo "Monthly maintenance completed"
```

## 備份策略

### 自動備份設置

```bash
# 在 crontab 中設置 (crontab -e)

# 每6小時增量備份
0 */6 * * * /path/to/employee-salary-system/scripts/backup-incremental.sh

# 每日完整備份
0 2 * * * /path/to/employee-salary-system/scripts/backup-full.sh

# 每週清理舊備份
0 3 * * 0 /path/to/employee-salary-system/scripts/cleanup-backups.sh
```

### 備份腳本

```bash
#!/bin/bash
# backup-full.sh

BACKUP_DIR="/var/backups/employee-salary"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="employee_salary_db"
DB_USER="app_user"

# 創建備份目錄
mkdir -p $BACKUP_DIR/daily

# 資料庫備份
pg_dump -h localhost -U $DB_USER -d $DB_NAME > $BACKUP_DIR/daily/db_backup_$DATE.sql

# 應用程式備份
tar -czf $BACKUP_DIR/daily/app_backup_$DATE.tar.gz \
    /path/to/employee-salary-system \
    --exclude=node_modules \
    --exclude=.git \
    --exclude=logs

# 系統配置備份
cp /etc/nginx/sites-available/employee-salary $BACKUP_DIR/daily/nginx_config_$DATE
cp /etc/systemd/system/employee-salary.service $BACKUP_DIR/daily/systemd_config_$DATE

# 壓縮資料庫備份
gzip $BACKUP_DIR/daily/db_backup_$DATE.sql

# 記錄備份完成
echo "$(date): Full backup completed - $DATE" >> $BACKUP_DIR/backup.log

# 保留最近30天的備份
find $BACKUP_DIR/daily -name "*backup*" -mtime +30 -delete
```

### 備份驗證

```bash
#!/bin/bash
# verify-backup.sh

BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: $0 <backup_file>"
    exit 1
fi

echo "Verifying backup: $BACKUP_FILE"

# 檢查檔案完整性
if [ ! -f "$BACKUP_FILE" ]; then
    echo "ERROR: Backup file not found"
    exit 1
fi

# 檢查檔案大小
SIZE=$(stat -f%z "$BACKUP_FILE" 2>/dev/null || stat -c%s "$BACKUP_FILE")
if [ $SIZE -lt 1000 ]; then
    echo "WARNING: Backup file seems too small ($SIZE bytes)"
fi

# 測試資料庫備份
if [[ $BACKUP_FILE == *.sql.gz ]]; then
    gunzip -t "$BACKUP_FILE"
    if [ $? -eq 0 ]; then
        echo "✓ Database backup integrity verified"
    else
        echo "✗ Database backup corrupted"
        exit 1
    fi
fi

# 測試應用程式備份
if [[ $BACKUP_FILE == *.tar.gz ]]; then
    tar -tzf "$BACKUP_FILE" > /dev/null
    if [ $? -eq 0 ]; then
        echo "✓ Application backup integrity verified"
    else
        echo "✗ Application backup corrupted"
        exit 1
    fi
fi

echo "Backup verification completed successfully"
```

## 效能監控

### 系統監控腳本

```bash
#!/bin/bash
# monitor-performance.sh

MONITOR_LOG="/var/log/employee-salary/performance.log"
DATE=$(date '+%Y-%m-%d %H:%M:%S')

# CPU 使用率
CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)

# 記憶體使用率
MEM_USAGE=$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}')

# 磁碟使用率
DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')

# 資料庫連接數
DB_CONNECTIONS=$(psql -U app_user -d employee_salary_db -t -c "SELECT count(*) FROM pg_stat_activity;")

# 應用程式回應時間
RESPONSE_TIME=$(curl -o /dev/null -s -w '%{time_total}' http://localhost:5000/api/health)

# 記錄效能數據
echo "$DATE,CPU:$CPU_USAGE,MEM:$MEM_USAGE,DISK:$DISK_USAGE,DB_CONN:$DB_CONNECTIONS,RESP_TIME:$RESPONSE_TIME" >> $MONITOR_LOG

# 檢查警報閾值
if (( $(echo "$CPU_USAGE > 80" | bc -l) )); then
    echo "$DATE WARNING: High CPU usage ($CPU_USAGE%)" >> $MONITOR_LOG
fi

if (( $(echo "$MEM_USAGE > 85" | bc -l) )); then
    echo "$DATE WARNING: High memory usage ($MEM_USAGE%)" >> $MONITOR_LOG
fi

if [ $DISK_USAGE -gt 85 ]; then
    echo "$DATE WARNING: High disk usage ($DISK_USAGE%)" >> $MONITOR_LOG
fi
```

### 資料庫效能監控

```sql
-- db-performance-check.sql

-- 檢查慢查詢
SELECT 
    query,
    calls,
    total_time,
    mean_time,
    (total_time/sum(total_time) OVER()) * 100 AS percentage
FROM pg_stat_statements
WHERE calls > 10
ORDER BY total_time DESC
LIMIT 10;

-- 檢查表格大小
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(tablename::regclass)) AS size,
    pg_total_relation_size(tablename::regclass) AS size_bytes
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY size_bytes DESC;

-- 檢查索引使用率
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan ASC;

-- 檢查資料庫活動
SELECT 
    datname,
    numbackends,
    xact_commit,
    xact_rollback,
    blks_read,
    blks_hit,
    tup_returned,
    tup_fetched,
    tup_inserted,
    tup_updated,
    tup_deleted
FROM pg_stat_database
WHERE datname = 'employee_salary_db';
```

## 安全性維護

### 定期安全檢查

```bash
#!/bin/bash
# security-check.sh

echo "Starting security audit..."

# 1. 檢查登入失敗記錄
grep "Failed password" /var/log/auth.log | tail -10

# 2. 檢查開放端口
nmap -sT localhost

# 3. 檢查檔案權限
find /path/to/employee-salary-system -type f -perm /002 -ls

# 4. 檢查 SSL 憑證
openssl x509 -in /etc/letsencrypt/live/your-domain.com/fullchain.pem -noout -dates

# 5. 檢查相依套件漏洞
cd /path/to/employee-salary-system
npm audit

# 6. 檢查系統更新
apt list --upgradable

echo "Security audit completed"
```

### 密碼政策檢查

```bash
#!/bin/bash
# password-policy-check.sh

# 檢查管理員密碼強度
psql -U app_user -d employee_salary_db -c "
SELECT 
    CASE 
        WHEN LENGTH(admin_pin) < 8 THEN 'WEAK: Too short'
        WHEN admin_pin ~ '^[0-9]+$' THEN 'WEAK: Only numbers'
        ELSE 'OK'
    END as password_strength
FROM settings;
"

# 檢查會話設置
grep -E "(SESSION_SECRET|SESSION_TIMEOUT)" /path/to/employee-salary-system/.env
```

## 更新管理

### 應用程式更新流程

```bash
#!/bin/bash
# update-application.sh

echo "Starting application update..."

# 1. 創建備份
./scripts/backup-full.sh

# 2. 停止應用程式
pm2 stop employee-salary

# 3. 備份當前版本
cp -r /path/to/employee-salary-system /var/backups/pre-update-$(date +%Y%m%d)

# 4. 更新代碼
cd /path/to/employee-salary-system
git pull origin main  # 如果使用 Git

# 5. 更新相依套件
npm install

# 6. 執行資料庫遷移
npm run db:push

# 7. 重新建置
npm run build

# 8. 重新啟動
pm2 start employee-salary

# 9. 驗證更新
sleep 10
curl -f http://localhost:5000/api/health

if [ $? -eq 0 ]; then
    echo "Update completed successfully"
else
    echo "Update failed, rolling back..."
    pm2 stop employee-salary
    rm -rf /path/to/employee-salary-system
    mv /var/backups/pre-update-$(date +%Y%m%d) /path/to/employee-salary-system
    pm2 start employee-salary
fi
```

### 系統更新流程

```bash
#!/bin/bash
# update-system.sh

echo "Starting system update..."

# 1. 檢查可用更新
apt update
apt list --upgradable

# 2. 創建系統快照 (如果支援)
if command -v timeshift &> /dev/null; then
    timeshift --create --comments "Pre-update snapshot"
fi

# 3. 更新套件
apt upgrade -y

# 4. 清理套件
apt autoremove -y
apt autoclean

# 5. 重新啟動服務
systemctl restart nginx
systemctl restart postgresql
pm2 restart employee-salary

# 6. 驗證服務
systemctl status nginx
systemctl status postgresql
pm2 status

echo "System update completed"
```

## 容量規劃

### 數據增長預測

```sql
-- 計算每月數據增長
WITH monthly_growth AS (
    SELECT 
        DATE_TRUNC('month', created_at) as month,
        COUNT(*) as record_count,
        pg_size_pretty(sum(pg_column_size(*)::bigint)) as size
    FROM attendance
    WHERE created_at >= NOW() - INTERVAL '6 months'
    GROUP BY DATE_TRUNC('month', created_at)
    ORDER BY month
)
SELECT 
    month,
    record_count,
    size,
    LAG(record_count) OVER (ORDER BY month) as prev_count,
    (record_count - LAG(record_count) OVER (ORDER BY month)) as growth
FROM monthly_growth;
```

### 效能基準測試

```bash
#!/bin/bash
# performance-benchmark.sh

echo "Running performance benchmarks..."

# 1. 資料庫查詢效能
time psql -U app_user -d employee_salary_db -c "
SELECT e.name, COUNT(a.id) 
FROM employees e 
LEFT JOIN attendance a ON e.id = a.employee_id 
GROUP BY e.name;"

# 2. API 回應時間
for i in {1..10}; do
    curl -w "@curl-format.txt" -o /dev/null -s "http://localhost:5000/api/employees"
done

# 3. 大量數據處理
time curl -X POST http://localhost:5000/api/salary-records/calculate-all \
     -H "Content-Type: application/json" \
     -d '{"year": 2025, "month": 5}'

echo "Benchmark completed"
```

## 災難恢復計畫

### 恢復程序優先級

1. **第一優先**: 恢復資料庫服務
2. **第二優先**: 恢復應用程式服務
3. **第三優先**: 恢復完整功能

### 快速恢復腳本

```bash
#!/bin/bash
# disaster-recovery.sh

BACKUP_DIR="/var/backups/employee-salary"
LATEST_DB_BACKUP=$(ls -t $BACKUP_DIR/daily/db_backup_*.sql.gz | head -1)
LATEST_APP_BACKUP=$(ls -t $BACKUP_DIR/daily/app_backup_*.tar.gz | head -1)

echo "Starting disaster recovery..."

# 1. 停止所有服務
pm2 stop all
systemctl stop nginx

# 2. 恢復資料庫
echo "Restoring database from: $LATEST_DB_BACKUP"
dropdb -U app_user employee_salary_db --if-exists
createdb -U app_user employee_salary_db
gunzip -c $LATEST_DB_BACKUP | psql -U app_user -d employee_salary_db

# 3. 恢復應用程式
echo "Restoring application from: $LATEST_APP_BACKUP"
rm -rf /path/to/employee-salary-system
tar -xzf $LATEST_APP_BACKUP -C /

# 4. 重新安裝相依套件
cd /path/to/employee-salary-system
npm install

# 5. 重新啟動服務
systemctl start nginx
pm2 start ecosystem.config.js

# 6. 驗證恢復
sleep 30
curl -f http://localhost:5000/api/health

if [ $? -eq 0 ]; then
    echo "Disaster recovery completed successfully"
else
    echo "Recovery verification failed"
fi
```

## 維護日誌

### 日誌格式

```
[YYYY-MM-DD HH:MM:SS] [LEVEL] [COMPONENT] Message
```

### 範例維護記錄

```
[2025-06-03 14:30:00] [INFO] [BACKUP] Daily backup completed successfully
[2025-06-03 14:35:00] [WARN] [DISK] Disk usage at 87%
[2025-06-03 14:40:00] [INFO] [CLEANUP] Removed 15 old log files
[2025-06-03 15:00:00] [INFO] [DB] Database maintenance completed
```

遵循這些維護程序將確保系統穩定運行並及時發現潛在問題。