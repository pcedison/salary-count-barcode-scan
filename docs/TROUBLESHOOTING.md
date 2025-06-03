# 故障排除指南

## 常見問題診斷

### 應用程式無法啟動

#### 症狀：npm start 失敗
```bash
# 檢查 Node.js 版本
node --version  # 需要 18.0.0+

# 檢查相依套件
npm install

# 清除快取
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

#### 症狀：端口已被占用
```bash
# 查找占用端口的程序
lsof -i :5000
netstat -tulpn | grep :5000

# 終止程序
kill -9 <PID>

# 或更改端口
export PORT=5001
npm start
```

### 資料庫連接問題

#### 症狀：Database connection failed

**Supabase 連接問題**
```bash
# 檢查環境變數
echo $DATABASE_URL
echo $SUPABASE_URL

# 測試網路連接
curl -I https://your-project.supabase.co

# 驗證憑證
npm run db:check
```

**本地 PostgreSQL 連接問題**
```bash
# 檢查 PostgreSQL 狀態
sudo systemctl status postgresql

# 檢查連接
psql -h localhost -U app_user -d employee_salary_db

# 重新啟動服務
sudo systemctl restart postgresql
```

#### 症狀：Permission denied for database

```sql
-- 重新授權
GRANT ALL PRIVILEGES ON DATABASE employee_salary_db TO app_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
```

### 前端載入問題

#### 症狀：白屏或 JavaScript 錯誤

```bash
# 檢查建置過程
npm run build

# 檢查瀏覽器控制台錯誤
# F12 → Console

# 清除瀏覽器快取
# Ctrl+Shift+R (硬重新整理)

# 檢查網路連接
curl http://localhost:5000/api/health
```

#### 症狀：API 請求失敗

```bash
# 檢查後端服務
curl -I http://localhost:5000

# 檢查 API 端點
curl http://localhost:5000/api/employees

# 檢查 CORS 設置
curl -H "Origin: http://localhost:3000" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: X-Requested-With" \
     -X OPTIONS \
     http://localhost:5000/api/employees
```

### 效能問題

#### 症狀：應用程式回應緩慢

**記憶體使用檢查**
```bash
# 檢查 Node.js 程序記憶體
ps aux | grep node

# 檢查系統記憶體
free -h

# 檢查程序詳細資訊
top -p $(pgrep -f "node.*server")
```

**資料庫效能檢查**
```sql
-- 檢查慢查詢
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
ORDER BY total_time DESC
LIMIT 10;

-- 檢查連接數
SELECT count(*) FROM pg_stat_activity;

-- 檢查鎖定情況
SELECT * FROM pg_locks WHERE NOT granted;
```

**磁碟空間檢查**
```bash
# 檢查磁碟使用
df -h

# 檢查日誌大小
du -sh /var/log/*

# 清理日誌
sudo journalctl --vacuum-time=7d
```

### 薪資計算錯誤

#### 症狀：計算結果不正確

**檢查系統設置**
```bash
# 檢查基本設置
curl http://localhost:5000/api/settings

# 檢查時薪設定
# 基本時薪：119
# 加班倍率：1.34 (前2小時), 1.67 (超過2小時)
```

**檢查考勤資料**
```sql
-- 檢查特定員工考勤
SELECT * FROM attendance 
WHERE employee_id = 1 
AND date LIKE '2025/05%'
ORDER BY date;

-- 檢查工時計算
SELECT 
  date,
  clock_in,
  clock_out,
  work_hours,
  overtime_hours
FROM attendance 
WHERE employee_id = 1 
AND (work_hours IS NULL OR overtime_hours IS NULL);
```

**重新計算薪資**
```bash
# 重新計算特定員工
curl -X PUT http://localhost:5000/api/salary-records/1/recalculate

# 重新計算所有員工
curl -X POST http://localhost:5000/api/salary-records/calculate-all \
     -H "Content-Type: application/json" \
     -d '{"year": 2025, "month": 5}'
```

### 條碼掃描問題

#### 症狀：掃描無反應

**檢查員工資料**
```sql
-- 檢查身份證號是否存在
SELECT * FROM employees WHERE id_number = 'A123456789';

-- 檢查員工是否啟用
SELECT * FROM employees WHERE active = false;
```

**檢查加密設置**
```sql
-- 檢查加密狀態
SELECT id, name, id_number, is_encrypted FROM employees;

-- 如果資料已加密，需要解密後比對
```

#### 症狀：打卡記錄重複

```sql
-- 檢查重複記錄
SELECT employee_id, date, COUNT(*)
FROM attendance
GROUP BY employee_id, date
HAVING COUNT(*) > 1;

-- 清理重複記錄 (保留最新的)
DELETE FROM attendance a1
USING attendance a2
WHERE a1.employee_id = a2.employee_id
  AND a1.date = a2.date
  AND a1.id < a2.id;
```

### 備份恢復問題

#### 症狀：備份檔案損壞

```bash
# 檢查備份檔案完整性
file backup-2025-05-02.json
head -n 5 backup-2025-05-02.json
tail -n 5 backup-2025-05-02.json

# 驗證 JSON 格式
cat backup-2025-05-02.json | jq . > /dev/null
```

#### 症狀：恢復失敗

```bash
# 檢查備份檔案權限
ls -la backup-2025-05-02.json

# 手動恢復特定資料
node restore-specific-data.js --table=employees --file=backup.json
```

### SSL/HTTPS 問題

#### 症狀：憑證錯誤

```bash
# 檢查憑證狀態
openssl x509 -in /etc/letsencrypt/live/your-domain.com/fullchain.pem -text -noout

# 檢查憑證到期時間
openssl x509 -in /etc/letsencrypt/live/your-domain.com/fullchain.pem -noout -dates

# 更新憑證
sudo certbot renew --dry-run
sudo certbot renew
```

#### 症狀：混合內容錯誤

```nginx
# 在 Nginx 配置中加入
add_header Content-Security-Policy "upgrade-insecure-requests";

# 檢查所有資源都使用 HTTPS
curl -s https://your-domain.com | grep -i "http://"
```

## 日誌分析

### 應用程式日誌

```bash
# 檢查 PM2 日誌
pm2 logs employee-salary

# 檢查系統日誌
sudo journalctl -u employee-salary -f

# 檢查 Nginx 日誌
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### 資料庫日誌

```bash
# PostgreSQL 日誌位置
sudo tail -f /var/log/postgresql/postgresql-13-main.log

# 檢查慢查詢日誌
grep "duration:" /var/log/postgresql/postgresql-13-main.log | tail -10
```

### 關鍵錯誤模式

**記憶體不足**
```
FATAL: out of memory
Error: JavaScript heap out of memory
```

**資料庫連接池耗盡**
```
Error: connect ECONNREFUSED
remaining connection slots are reserved
```

**檔案權限問題**
```
EACCES: permission denied
Error: EPERM: operation not permitted
```

## 系統監控命令

### 即時監控

```bash
# CPU 和記憶體監控
htop

# 磁碟 I/O 監控
iotop

# 網路監控
nethogs

# 程序監控
watch -n 1 'ps aux | grep node'
```

### 效能基準測試

```bash
# 網路延遲測試
ping your-domain.com

# 網站回應時間測試
curl -w "@curl-format.txt" -o /dev/null -s "http://your-domain.com"

# 資料庫效能測試
pgbench -i -s 50 employee_salary_db
pgbench -c 10 -j 2 -t 1000 employee_salary_db
```

### curl-format.txt 檔案內容

```
     time_namelookup:  %{time_namelookup}\n
        time_connect:  %{time_connect}\n
     time_appconnect:  %{time_appconnect}\n
    time_pretransfer:  %{time_pretransfer}\n
       time_redirect:  %{time_redirect}\n
  time_starttransfer:  %{time_starttransfer}\n
                     ----------\n
          time_total:  %{time_total}\n
```

## 災難恢復程序

### 完全系統故障

1. **評估損害程度**
   ```bash
   # 檢查關鍵檔案
   ls -la /path/to/employee-salary-system
   
   # 檢查資料庫狀態
   sudo systemctl status postgresql
   ```

2. **從備份恢復**
   ```bash
   # 恢復應用程式
   tar -xzf employee-salary-backup.tar.gz
   
   # 恢復資料庫
   psql -U app_user -d employee_salary_db < latest-backup.sql
   ```

3. **重新啟動服務**
   ```bash
   cd employee-salary-system
   npm install
   npm run db:push
   pm2 start ecosystem.config.js
   ```

### 資料損壞恢復

1. **停止應用程式**
   ```bash
   pm2 stop employee-salary
   ```

2. **備份損壞資料**
   ```bash
   pg_dump -U app_user employee_salary_db > corrupted-backup.sql
   ```

3. **恢復乾淨備份**
   ```bash
   dropdb -U app_user employee_salary_db
   createdb -U app_user employee_salary_db
   psql -U app_user -d employee_salary_db < clean-backup.sql
   ```

4. **重新啟動服務**
   ```bash
   pm2 restart employee-salary
   ```

### 緊急聯絡程序

1. **記錄問題詳情**
   - 錯誤訊息
   - 發生時間
   - 影響範圍
   - 已採取的措施

2. **收集診斷資訊**
   ```bash
   # 系統資訊
   uname -a
   cat /etc/os-release
   
   # 應用程式版本
   npm list --depth=0
   
   # 錯誤日誌
   pm2 logs employee-salary --lines 100
   ```

3. **準備恢復計畫**
   - 估計恢復時間
   - 確認備份可用性
   - 通知相關人員

## 預防措施

### 定期檢查項目

```bash
# 每日檢查腳本
#!/bin/bash
echo "=== Daily Health Check $(date) ==="

# 檢查服務狀態
pm2 status
systemctl status nginx
systemctl status postgresql

# 檢查磁碟空間
df -h | grep -E '(8[0-9]|9[0-9])%'

# 檢查記憶體使用
free -h

# 檢查最近的錯誤
journalctl --since "1 hour ago" --priority err

echo "=== Health Check Complete ==="
```

### 自動警報設置

```bash
# 磁碟空間警報
#!/bin/bash
THRESHOLD=85
CURRENT=$(df / | grep -v Filesystem | awk '{print $5}' | sed 's/%//g')

if [ "$CURRENT" -gt "$THRESHOLD" ]; then
    echo "Disk usage is ${CURRENT}%" | mail -s "Disk Space Warning" admin@your-company.com
fi
```

### 效能基準建立

```bash
# 記錄正常運行時的效能指標
echo "$(date): $(free | grep Mem | awk '{print $3/$2 * 100.0}')% memory used" >> /var/log/performance.log
echo "$(date): $(df / | tail -1 | awk '{print $5}') disk used" >> /var/log/performance.log
```

遵循這些故障排除程序可以快速診斷和解決大部分常見問題。如遇到文檔中未涵蓋的問題，請保存詳細的錯誤資訊以便進一步分析。