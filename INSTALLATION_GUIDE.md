# 安裝與部署指南

## 快速開始

### 1. 系統要求
- **作業系統**: Linux, macOS, Windows
- **Node.js**: 18.0.0 或更高版本
- **記憶體**: 最少 4GB RAM
- **儲存空間**: 最少 10GB 可用空間
- **資料庫**: PostgreSQL 12+ 或 Supabase 帳戶

### 2. 下載與解壓縮
```bash
# 解壓縮專案檔案
tar -xzf employee-salary-system-final-2025-06-05.tar.gz
cd employee-salary-system

# 查看專案結構
ls -la
```

### 3. 自動安裝（推薦）
```bash
# 執行自動部署腳本
./deploy.sh

# 或指定額外選項
./deploy.sh --with-nginx --skip-tests
```

### 4. 手動安裝步驟

#### 安裝依賴
```bash
npm install
```

#### 環境設定
```bash
# 複製環境變數範本
cp .env.example .env

# 編輯環境變數
nano .env
```

必要的環境變數：
```env
# 資料庫連接（選擇其一）
DATABASE_URL=postgresql://username:password@host:5432/database

# 或使用 Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-anon-key

# 安全設定
SESSION_SECRET=your-random-secret-key-minimum-32-characters
ADMIN_PIN=1234

# 伺服器設定
NODE_ENV=production
PORT=5000
```

#### 資料庫初始化
```bash
# 推送資料庫結構
npm run db:push

# 檢查資料庫連接
npm run db:check
```

#### 建置與啟動
```bash
# 建置應用程式
npm run build

# 啟動應用程式
npm start
```

## Supabase 設定指南

### 1. 建立 Supabase 專案
1. 前往 [Supabase 控制台](https://supabase.com/dashboard)
2. 點擊 "New Project"
3. 填寫專案名稱和密碼
4. 選擇離你最近的區域
5. 等待專案建立完成

### 2. 獲取連接資訊
1. 在專案頁面，點擊左側的 "Settings"
2. 選擇 "Database"
3. 找到 "Connection string" 區域
4. 複製 "URI" 格式的連接字串
5. 將 `[YOUR-PASSWORD]` 替換為你的資料庫密碼

### 3. 設定環境變數
```env
DATABASE_URL=postgresql://postgres:your-password@db.your-project.supabase.co:5432/postgres
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-public-anon-key
```

## 本地 PostgreSQL 設定

### 1. 安裝 PostgreSQL
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install postgresql postgresql-contrib

# macOS (使用 Homebrew)
brew install postgresql
brew services start postgresql

# Windows
# 下載並安裝 PostgreSQL 官方安裝程式
```

### 2. 建立資料庫
```bash
# 切換到 postgres 使用者
sudo -u postgres psql

# 在 PostgreSQL 命令列中執行
CREATE DATABASE salary_system;
CREATE USER salary_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE salary_system TO salary_user;
\q
```

### 3. 設定環境變數
```env
DATABASE_URL=postgresql://salary_user:your_password@localhost:5432/salary_system
```

## 生產環境部署

### 使用 PM2 (推薦)
```bash
# 安裝 PM2
npm install -g pm2

# 使用 PM2 啟動
pm2 start ecosystem.config.js

# 設定開機自啟
pm2 startup
pm2 save

# 監控應用程式
pm2 monit
```

### 使用 Docker
```bash
# 建置 Docker 映像
docker build -t salary-system .

# 執行容器
docker run -d \
  --name salary-system \
  -p 5000:5000 \
  -e DATABASE_URL="your-database-url" \
  -e SESSION_SECRET="your-session-secret" \
  salary-system
```

### 使用 systemd
```bash
# 複製服務檔案
sudo cp salary-system.service /etc/systemd/system/

# 啟用並啟動服務
sudo systemctl daemon-reload
sudo systemctl enable salary-system
sudo systemctl start salary-system

# 檢查狀態
sudo systemctl status salary-system
```

## Nginx 反向代理設定

### 1. 安裝 Nginx
```bash
# Ubuntu/Debian
sudo apt install nginx

# CentOS/RHEL
sudo yum install nginx
```

### 2. 設定 Nginx
建立設定檔 `/etc/nginx/sites-available/salary-system`：
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 3. 啟用設定
```bash
# 建立符號連結
sudo ln -s /etc/nginx/sites-available/salary-system /etc/nginx/sites-enabled/

# 測試設定
sudo nginx -t

# 重新載入 Nginx
sudo systemctl reload nginx
```

## SSL/HTTPS 設定 (使用 Let's Encrypt)

```bash
# 安裝 Certbot
sudo apt install certbot python3-certbot-nginx

# 獲取 SSL 憑證
sudo certbot --nginx -d your-domain.com

# 設定自動更新
sudo crontab -e
# 新增以下行：
# 0 12 * * * /usr/bin/certbot renew --quiet
```

## 故障排除

### 常見問題

#### 1. 資料庫連接失敗
```bash
# 檢查環境變數
echo $DATABASE_URL

# 測試資料庫連接
npm run db:check

# 查看詳細錯誤
npm run dev
```

#### 2. 權限問題
```bash
# 確保檔案權限正確
chmod +x deploy.sh
chmod -R 755 .

# 檢查 PM2 程序
pm2 logs salary-system
```

#### 3. 端口被佔用
```bash
# 檢查端口使用
netstat -tlnp | grep 5000

# 終止佔用程序
sudo kill -9 <PID>
```

#### 4. 記憶體不足
```bash
# 檢查記憶體使用
free -h

# 增加交換空間
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

### 日誌查看

#### 應用程式日誌
```bash
# PM2 日誌
pm2 logs salary-system

# 系統日誌
sudo journalctl -u salary-system -f

# 直接查看
tail -f logs/application.log
```

#### Nginx 日誌
```bash
# 存取日誌
sudo tail -f /var/log/nginx/access.log

# 錯誤日誌
sudo tail -f /var/log/nginx/error.log
```

## 效能調整

### 資料庫優化
```sql
-- 建立索引
CREATE INDEX CONCURRENTLY idx_attendance_employee_date 
ON attendance_records(employee_id, date);

CREATE INDEX CONCURRENTLY idx_salary_year_month 
ON salary_records(salary_year, salary_month);

-- 分析資料表
ANALYZE attendance_records;
ANALYZE salary_records;
```

### Node.js 應用程式調整
```bash
# 設定 NODE_OPTIONS
export NODE_OPTIONS="--max-old-space-size=2048"

# PM2 叢集模式
pm2 start ecosystem.config.js --instances max
```

## 備份與還原

### 自動備份設定
```bash
# 建立備份腳本
cat > backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/backups/salary-system"
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump $DATABASE_URL > "$BACKUP_DIR/backup_$DATE.sql"
find "$BACKUP_DIR" -name "backup_*.sql" -mtime +7 -delete
EOF

chmod +x backup.sh

# 設定 crontab
crontab -e
# 新增：0 2 * * * /path/to/backup.sh
```

### 還原資料
```bash
# 從備份還原
psql $DATABASE_URL < backup_file.sql

# 從應用程式備份還原
npm run restore:backup
```

## 安全性設定

### 防火牆設定
```bash
# UFW (Ubuntu)
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable

# iptables
sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT
```

### 定期更新
```bash
# 系統更新
sudo apt update && sudo apt upgrade

# Node.js 套件更新
npm audit fix
npm update

# 重啟服務
pm2 restart salary-system
```

## 監控設定

### 基本監控
```bash
# 系統資源監控
htop

# 磁碟使用量
df -h

# 網路連接
netstat -tlnp
```

### 應用程式監控
```bash
# PM2 監控
pm2 monit

# 檢查應用程式健康狀態
curl http://localhost:5000/api/health
```

## 聯絡支援

如遇到技術問題：

1. 檢查本文檔的故障排除章節
2. 查看應用程式日誌檔案
3. 確認所有環境變數設定正確
4. 驗證資料庫連接狀態

所有必要的檔案和文檔都已包含在此交付包中。