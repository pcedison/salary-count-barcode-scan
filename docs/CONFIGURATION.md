# 系統配置指南

## 環境變數詳細說明

### 核心設置

```env
# 應用程式環境
NODE_ENV=production          # development | production | test
PORT=5000                   # 應用程式監聽端口

# 資料庫連接 (擇一使用)
DATABASE_URL=postgresql://user:password@host:port/database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key

# 安全設置
SESSION_SECRET=your_random_secret_key_minimum_32_characters

# 系統功能開關
ENABLE_AUTO_BACKUP=true     # 啟用自動備份
ENABLE_DATA_ENCRYPTION=true # 啟用員工資料加密
ENABLE_MONITORING=true      # 啟用系統監控

# 備份設置
BACKUP_INTERVAL_HOURS=24    # 備份間隔 (小時)
MAX_BACKUP_FILES=30         # 保留備份檔案數量

# 效能設置
DB_POOL_MIN=2              # 資料庫連接池最小連接數
DB_POOL_MAX=10             # 資料庫連接池最大連接數
CACHE_TTL_SECONDS=300      # 快取過期時間 (秒)
```

## 系統管理員設置

### 初始管理員密碼

首次啟動後，系統預設管理員密碼為 `admin123`。
**重要**: 請立即登入系統並修改此密碼。

```bash
# 登入系統後前往「系統設置」→「管理員設置」修改密碼
```

### 系統參數配置

#### 薪資計算參數

```env
# 基本時薪 (新台幣)
BASE_HOURLY_RATE=119

# 加班費倍率
OVERTIME_RATE_1=1.34       # 平日加班 (前2小時)
OVERTIME_RATE_2=1.67       # 平日加班 (超過2小時) / 假日加班

# 工作時間設定
STANDARD_WORK_HOURS=8      # 標準工作時數
OVERTIME_THRESHOLD=8       # 加班起算時數
```

#### 勞健保設置

系統支援動態勞健保費率設定，可透過管理介面調整：

- 勞保費率：個人負擔比例
- 健保費率：個人負擔比例
- 勞退提撥：雇主負擔比例

### 安全設置

#### 密碼政策

```json
{
  "minLength": 8,
  "requireUppercase": true,
  "requireLowercase": true,
  "requireNumbers": true,
  "requireSpecialChars": false,
  "maxAttempts": 5,
  "lockoutDuration": 15
}
```

#### 會話設置

```env
# 會話超時時間 (分鐘)
SESSION_TIMEOUT=60

# 會話安全設置
SESSION_SECURE=true         # HTTPS 環境必須設為 true
SESSION_HTTP_ONLY=true      # 防止 XSS 攻擊
SESSION_SAME_SITE=strict    # CSRF 防護
```

## 資料庫配置

### Supabase 配置 (推薦)

1. **建立 Supabase 專案**
   - 前往 https://supabase.com
   - 建立新專案
   - 選擇適當的地區 (建議選擇台灣或鄰近地區)

2. **獲取連接資訊**
   ```bash
   # 在 Supabase 專案設置中找到
   Project URL: https://xxx.supabase.co
   API Key (anon): eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   Database URL: postgresql://postgres:[password]@db.xxx.supabase.co:5432/postgres
   ```

3. **設置環境變數**
   ```env
   SUPABASE_URL=https://xxx.supabase.co
   SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   DATABASE_URL=postgresql://postgres:[password]@db.xxx.supabase.co:5432/postgres
   ```

### 本地 PostgreSQL 配置

1. **資料庫建立**
   ```sql
   CREATE DATABASE employee_salary_db 
   WITH ENCODING 'UTF8' 
   LC_COLLATE='zh_TW.UTF-8' 
   LC_CTYPE='zh_TW.UTF-8';
   
   CREATE USER app_user WITH PASSWORD 'secure_password';
   GRANT ALL PRIVILEGES ON DATABASE employee_salary_db TO app_user;
   ```

2. **效能調優**
   ```sql
   -- 在 postgresql.conf 中設置
   shared_buffers = 256MB
   effective_cache_size = 1GB
   maintenance_work_mem = 64MB
   checkpoint_completion_target = 0.7
   wal_buffers = 16MB
   default_statistics_target = 100
   random_page_cost = 1.1
   effective_io_concurrency = 200
   ```

## 備份與恢復設置

### 自動備份配置

```env
# 啟用自動備份
ENABLE_AUTO_BACKUP=true

# 備份類型
BACKUP_TYPES=daily,weekly,monthly

# 備份存儲位置
BACKUP_PATH=/var/backups/employee-salary
BACKUP_RETENTION_DAYS=90

# 外部備份 (選用)
GOOGLE_DRIVE_BACKUP=false
GOOGLE_DRIVE_FOLDER_ID=your_folder_id
```

### 手動備份

```bash
# 建立完整備份
npm run backup:create

# 恢復特定備份
npm run backup:restore -- --file=backup-2025-06-03.json

# 列出可用備份
npm run backup:list
```

## 監控與日誌

### 日誌配置

```env
# 日誌等級
LOG_LEVEL=info              # debug | info | warn | error

# 日誌輸出
LOG_TO_FILE=true
LOG_FILE_PATH=/var/log/employee-salary/app.log
LOG_MAX_SIZE=10MB
LOG_MAX_FILES=5

# 存取日誌
ACCESS_LOG_ENABLED=true
ACCESS_LOG_FORMAT=combined
```

### 監控設置

```env
# 健康檢查端點
HEALTH_CHECK_ENDPOINT=/health
HEALTH_CHECK_INTERVAL=30

# 效能監控
MONITOR_RESPONSE_TIME=true
MONITOR_MEMORY_USAGE=true
MONITOR_DB_CONNECTIONS=true

# 警報設置
ALERT_EMAIL=admin@your-company.com
ALERT_MEMORY_THRESHOLD=80    # 記憶體使用率警報閾值 (%)
ALERT_DISK_THRESHOLD=90      # 磁碟使用率警報閾值 (%)
```

## 網路與防火牆

### 端口配置

```bash
# 必要端口
5000    # 應用程式主端口
5432    # PostgreSQL (如使用本地資料庫)
80      # HTTP (反向代理)
443     # HTTPS (反向代理)

# 防火牆設置 (Ubuntu/Debian)
sudo ufw allow 5000
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

### Nginx 反向代理配置

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    # 安全標頭
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains";

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
        
        # 超時設置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 靜態檔案快取
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # 檔案上傳大小限制
    client_max_body_size 10M;
}
```

## 系統優化

### Node.js 程序管理 (PM2)

```bash
# 安裝 PM2
npm install -g pm2

# PM2 配置檔案 (ecosystem.config.js)
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'employee-salary',
    script: 'server/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    error_file: '/var/log/employee-salary/err.log',
    out_file: '/var/log/employee-salary/out.log',
    log_file: '/var/log/employee-salary/combined.log',
    time: true,
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024'
  }]
};
EOF

# 啟動應用程式
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 系統資源優化

```bash
# 檔案描述符限制
echo "* soft nofile 65536" >> /etc/security/limits.conf
echo "* hard nofile 65536" >> /etc/security/limits.conf

# 網路優化
echo "net.core.somaxconn = 65535" >> /etc/sysctl.conf
echo "net.ipv4.tcp_max_syn_backlog = 65535" >> /etc/sysctl.conf
sysctl -p
```

## 故障排除

### 常見問題檢查清單

1. **檢查服務狀態**
   ```bash
   pm2 status
   systemctl status nginx
   systemctl status postgresql
   ```

2. **檢查日誌**
   ```bash
   pm2 logs employee-salary
   tail -f /var/log/nginx/error.log
   tail -f /var/log/postgresql/postgresql-13-main.log
   ```

3. **檢查資料庫連接**
   ```bash
   npm run db:check
   ```

4. **檢查磁碟空間**
   ```bash
   df -h
   du -sh /var/log/*
   ```

5. **檢查記憶體使用**
   ```bash
   free -h
   top -p $(pgrep -f employee-salary)
   ```

配置完成後，請參考 `MAINTENANCE.md` 瞭解日常維護程序。