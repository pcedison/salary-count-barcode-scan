# 員工薪資計算系統 - 完整部署交付指南

## 交付成果概覽

### 部署包資訊
- **檔案名稱**: `employee-salary-system-complete_20250603_141939.tar.gz`
- **檔案大小**: 329KB (壓縮後)
- **包含檔案**: 192 個完整檔案
- **解壓後大小**: 1.9MB
- **建立時間**: 2025年6月3日

### 系統功能特色
- 員工資料管理（含身份證號加密保護）
- 條碼掃描打卡系統
- 手動考勤登記與編輯
- 精確薪資計算（按日累計加班費）
- 勞健保自動扣款計算
- 月度薪資報表生成與匯出
- 完整的系統監控與備份機制

---

## 1. 完整原始碼清單

### 1.1 前端程式碼 (client/)
```
client/
├── src/
│   ├── components/          # React UI 元件
│   │   ├── ui/             # shadcn/ui 基礎元件庫
│   │   ├── AttendanceTable.tsx    # 考勤記錄表格
│   │   └── SalaryTable.tsx        # 薪資記錄表格
│   ├── pages/              # 主要頁面元件
│   │   ├── AttendancePage.tsx     # 考勤登記頁面
│   │   ├── BarcodeScanPage.tsx    # 條碼掃描打卡頁面
│   │   └── SalaryPage.tsx         # 薪資計算頁面
│   ├── hooks/              # React 自訂 Hooks
│   │   ├── useAttendanceData.ts   # 考勤資料處理
│   │   ├── useEmployees.ts        # 員工資料管理
│   │   └── use-toast.ts           # 通知訊息
│   ├── lib/                # 工具函式庫
│   │   ├── queryClient.ts         # API 查詢客戶端
│   │   ├── utils.ts               # 通用工具函式
│   │   └── eventBus.ts           # 事件匯流排
│   └── utils/              # 快取與資料處理
│       ├── dataCache.ts           # 資料快取
│       └── employeeCache.ts       # 員工資料快取
├── index.html              # HTML 模板
└── vite.config.ts         # Vite 建置配置
```

### 1.2 後端程式碼 (server/)
```
server/
├── index.ts               # 伺服器入口點
├── routes.ts              # API 路由定義
├── storage.ts             # 資料存取層
├── auth.ts                # 認證中介軟體
└── vite.ts               # Vite 整合
```

### 1.3 共用模組 (shared/)
```
shared/
└── schema.ts             # Drizzle ORM 資料模型定義
```

### 1.4 設定檔案
```
├── package.json          # npm 套件定義
├── package-lock.json     # 套件版本鎖定
├── tsconfig.json         # TypeScript 編譯設定
├── tailwind.config.ts    # Tailwind CSS 設定
├── postcss.config.js     # PostCSS 設定
├── drizzle.config.ts     # 資料庫 ORM 設定
├── theme.json            # UI 主題設定
└── .env.example          # 環境變數範本
```

---

## 2. 詳細技術文檔

### 2.1 安裝與部署文檔
- **`docs/INSTALLATION.md`** - 完整安裝指南
  - 系統環境準備（Linux、Windows、macOS）
  - Node.js 18+ 安裝步驟
  - PostgreSQL 或 Supabase 設置
  - 應用程式部署流程
  - Nginx 反向代理配置
  - SSL 憑證設置
  - 系統服務配置

- **`docs/CONFIGURATION.md`** - 系統配置說明
  - 環境變數詳細說明
  - 薪資計算參數設定
  - 勞健保費率配置
  - 安全設置指南
  - 效能優化設定
  - 監控與警報配置

### 2.2 資料庫文檔
- **`docs/DATABASE_SETUP.md`** - 資料庫設置指南
  - 資料表結構定義
  - 索引設計與優化
  - Supabase 雲端設置步驟
  - 本地 PostgreSQL 安裝配置
  - 備份與恢復程序
  - 效能監控與調優

### 2.3 開發與維護文檔
- **`docs/API_DOCUMENTATION.md`** - 完整 API 文檔
  - 認證 API
  - 員工管理 API
  - 考勤管理 API
  - 薪資計算 API
  - 系統設置 API
  - 報表與匯出 API
  - WebSocket 即時功能

- **`docs/TROUBLESHOOTING.md`** - 故障排除指南
  - 常見問題診斷
  - 系統效能問題解決
  - 資料庫連接問題
  - 薪資計算錯誤排除
  - 條碼掃描問題
  - 日誌分析方法

- **`docs/MAINTENANCE.md`** - 系統維護手冊
  - 日常維護清單
  - 自動備份策略
  - 效能監控程序
  - 安全性維護
  - 更新管理流程
  - 災難恢復計畫

- **`docs/SUPPORT.md`** - 技術支援指南
  - 系統架構說明
  - 核心功能介紹
  - 常見使用情境
  - 自定義配置指導
  - 效能優化建議

---

## 3. 部署與管理工具

### 3.1 自動化部署腳本
- **`deploy.sh`** - 一鍵部署腳本
  ```bash
  #!/bin/bash
  # 檢查 Node.js 版本
  # 安裝相依套件
  # 檢查環境變數
  # 測試資料庫連接
  # 初始化資料庫結構
  # 建置前端應用
  ```

- **`start.sh`** - 快速啟動腳本
  ```bash
  #!/bin/bash
  # 檢查建置狀態
  # 啟動生產模式應用
  ```

- **`dev.sh`** - 開發模式啟動腳本
  ```bash
  #!/bin/bash
  # 啟動開發模式（含熱重載）
  ```

### 3.2 資料庫管理工具
- **`db-manage.sh`** - 資料庫管理腳本
  ```bash
  # 支援指令:
  ./db-manage.sh check    # 檢查資料庫連接
  ./db-manage.sh push     # 推送資料庫結構
  ./db-manage.sh reset    # 重置資料庫
  ./db-manage.sh backup   # 創建備份
  ```

### 3.3 系統監控工具
- **`monitor.sh`** - 系統監控腳本
  ```bash
  # 檢查項目:
  # - 應用程式運行狀態
  # - 端口開放狀況
  # - 資料庫連接狀態
  # - 磁碟使用狀況
  # - 記憶體使用狀況
  ```

### 3.4 輔助管理腳本
- **`scripts/auto-recovery.js`** - 自動系統恢復
- **`scripts/setup-db.js`** - 資料庫初始化
- **`scripts/integrity-check.js`** - 資料完整性檢查

---

## 4. 配置檔案詳解

### 4.1 環境變數範本 (.env.example)
```env
# 基本設置
NODE_ENV=production
PORT=5000
SESSION_SECRET=your_very_long_random_session_secret_key

# 資料庫連接 (選擇其一)
# Supabase 雲端資料庫
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your_anon_key
DATABASE_URL=postgresql://postgres:[PASSWORD]@db.your-project.supabase.co:5432/postgres

# 或本地 PostgreSQL
# DATABASE_URL=postgresql://app_user:password@localhost:5432/employee_salary_db

# 系統功能開關
ENABLE_AUTO_BACKUP=true
ENABLE_MONITORING=true
ENABLE_DATA_ENCRYPTION=true

# 薪資計算設置
BASE_HOURLY_RATE=119
OVERTIME_RATE_1=1.34
OVERTIME_RATE_2=1.67
STANDARD_WORK_HOURS=8

# 安全設置
SESSION_TIMEOUT=60
SESSION_SECURE=false
ENCRYPTION_KEY=your_32_character_encryption_key

# 日誌設置
LOG_LEVEL=info
LOG_TO_FILE=true
LOG_FILE_PATH=/var/log/employee-salary/app.log
```

### 4.2 套件定義 (package.json) 關鍵內容
```json
{
  "name": "employee-salary-system",
  "version": "1.0.0",
  "scripts": {
    "dev": "tsx server/index.ts",
    "build": "vite build client",
    "start": "NODE_ENV=production tsx server/index.ts",
    "db:push": "drizzle-kit push",
    "db:check": "node -e \"require('./server/storage.js').checkConnection()\""
  },
  "dependencies": {
    "express": "^4.18.2",
    "react": "^18.2.0",
    "typescript": "^5.2.0",
    "drizzle-orm": "^0.29.0",
    "@supabase/supabase-js": "^2.39.0"
  }
}
```

---

## 5. 客戶自主部署流程

### 5.1 環境準備階段

#### 步驟 1: 檢查系統需求
```bash
# 檢查作業系統
uname -a

# 檢查可用記憶體 (需要最少 2GB)
free -h

# 檢查磁碟空間 (需要最少 10GB)
df -h

# 檢查網路連接
ping -c 4 google.com
```

#### 步驟 2: 安裝 Node.js 18+
```bash
# Ubuntu/Debian 系統
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs

# CentOS/RHEL 系統
curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -
sudo yum install -y nodejs

# 驗證安裝
node --version  # 應顯示 v18.0.0 或更高
npm --version   # 應顯示 8.0.0 或更高
```

#### 步驟 3: 安裝 Git (如需要)
```bash
# Ubuntu/Debian
sudo apt update && sudo apt install git

# CentOS/RHEL
sudo yum install git

# 驗證安裝
git --version
```

### 5.2 資料庫設置階段

#### 選項 A: Supabase 雲端資料庫 (推薦)

**步驟 1: 創建 Supabase 專案**
1. 前往 https://supabase.com
2. 註冊帳號或登入
3. 點擊「New Project」
4. 填寫專案資訊：
   - Organization: 選擇或創建組織
   - Project name: `employee-salary-system`
   - Database password: 設置強密碼 (記錄此密碼)
   - Region: 選擇台灣或鄰近地區

**步驟 2: 獲取連接資訊**
1. 在 Supabase 專案面板中點擊「Settings」
2. 選擇「Database」
3. 在「Connection info」區域記錄：
   - Host: `db.xxx.supabase.co`
   - Database name: `postgres`
   - Port: `5432`
   - User: `postgres`
   - Password: (您設置的密碼)

4. 在「Connection string」區域複製 URI：
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxx.supabase.co:5432/postgres
   ```

**步驟 3: 獲取 API 金鑰**
1. 點擊「Settings」→「API」
2. 記錄以下資訊：
   - Project URL: `https://xxx.supabase.co`
   - anon public key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`

#### 選項 B: 本地 PostgreSQL 資料庫

**步驟 1: 安裝 PostgreSQL**
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install postgresql postgresql-contrib

# CentOS/RHEL
sudo yum install postgresql-server postgresql-contrib
sudo postgresql-setup initdb
sudo systemctl enable postgresql
sudo systemctl start postgresql

# 驗證安裝
sudo systemctl status postgresql
```

**步驟 2: 創建資料庫和使用者**
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
GRANT CREATE ON SCHEMA public TO app_user;

# 退出 PostgreSQL
\q
```

**步驟 3: 測試資料庫連接**
```bash
# 測試連接
psql -h localhost -U app_user -d employee_salary_db

# 如果成功連接，輸入 \q 退出
```

### 5.3 應用程式部署階段

#### 步驟 1: 下載並解壓專案
```bash
# 創建部署目錄
mkdir -p /opt/employee-salary-system
cd /opt/employee-salary-system

# 解壓部署包 (假設檔案已上傳到伺服器)
tar -xzf employee-salary-system-complete_20250603_141939.tar.gz

# 進入專案目錄
cd employee-salary-system-complete_20250603_141939

# 檢查檔案
ls -la
```

#### 步驟 2: 配置環境變數
```bash
# 複製環境變數範本
cp .env.example .env

# 編輯環境變數檔案
nano .env  # 或使用其他編輯器如 vim

# 填入以下關鍵設定:
```

**環境變數設定範例:**
```env
# 基本設置
NODE_ENV=production
PORT=5000

# 隨機生成會話金鑰 (32字元以上)
SESSION_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0

# Supabase 設置 (如使用 Supabase)
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your_anon_key
DATABASE_URL=postgresql://postgres:your-password@db.your-project-id.supabase.co:5432/postgres

# 或本地 PostgreSQL 設置
# DATABASE_URL=postgresql://app_user:your_secure_password@localhost:5432/employee_salary_db

# 系統功能
ENABLE_AUTO_BACKUP=true
ENABLE_MONITORING=true
```

#### 步驟 3: 執行一鍵部署
```bash
# 給予執行權限
chmod +x deploy.sh

# 執行部署腳本
./deploy.sh
```

**部署腳本會自動執行:**
1. 檢查 Node.js 版本
2. 安裝 npm 相依套件
3. 檢查環境變數檔案
4. 測試資料庫連接
5. 初始化資料庫結構
6. 建置前端應用程式

#### 步驟 4: 啟動系統
```bash
# 給予執行權限
chmod +x start.sh

# 啟動系統
./start.sh

# 或手動啟動
npm start
```

### 5.4 驗證部署階段

#### 步驟 1: 檢查服務狀態
```bash
# 檢查應用程式是否運行
ps aux | grep node

# 檢查端口是否開放
netstat -tlnp | grep :5000

# 檢查健康狀態
curl http://localhost:5000/api/health
```

#### 步驟 2: 瀏覽器測試
1. 開啟瀏覽器
2. 訪問 `http://your-server-ip:5000`
3. 應該看到員工薪資計算系統登入頁面

#### 步驟 3: 功能驗證
1. **管理員登入**
   - 預設密碼: `admin123`
   - 登入後立即修改密碼

2. **基本功能測試**
   - 新增員工資料
   - 手動考勤登記
   - 條碼掃描打卡 (如有掃碼設備)
   - 薪資計算功能

### 5.5 生產環境優化階段

#### 步驟 1: 安裝 PM2 程序管理
```bash
# 全域安裝 PM2
npm install -g pm2

# 創建 PM2 配置檔案
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
    max_memory_restart: '1G'
  }]
};
EOF

# 啟動 PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

#### 步驟 2: 安裝 Nginx 反向代理
```bash
# 安裝 Nginx
sudo apt install nginx  # Ubuntu/Debian
# 或
sudo yum install nginx   # CentOS/RHEL

# 創建 Nginx 配置
sudo tee /etc/nginx/sites-available/employee-salary << EOF
server {
    listen 80;
    server_name your-domain.com;  # 替換為您的域名

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # 超時設置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 檔案上傳大小限制
    client_max_body_size 10M;
}
EOF

# 啟用網站
sudo ln -s /etc/nginx/sites-available/employee-salary /etc/nginx/sites-enabled/

# 測試配置
sudo nginx -t

# 重新啟動 Nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
```

#### 步驟 3: 設置防火牆
```bash
# Ubuntu/Debian 使用 UFW
sudo ufw allow 22     # SSH
sudo ufw allow 80     # HTTP
sudo ufw allow 443    # HTTPS
sudo ufw enable

# CentOS/RHEL 使用 firewalld
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

---

## 6. 完全自主運維指南

### 6.1 日常監控作業

#### 系統健康檢查
```bash
# 執行內建監控腳本
./monitor.sh

# 手動檢查關鍵指標
pm2 status                    # PM2 程序狀態
systemctl status nginx       # Nginx 服務狀態
./db-manage.sh check         # 資料庫連接檢查
df -h                        # 磁碟使用量
free -h                      # 記憶體使用量
```

#### 日誌檢查
```bash
# 應用程式日誌
pm2 logs employee-salary

# Nginx 日誌
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# 系統日誌
journalctl -u employee-salary -f
```

### 6.2 備份管理

#### 自動備份設置
```bash
# 編輯 crontab
crontab -e

# 加入以下行設置每日備份
0 2 * * * /opt/employee-salary-system/db-manage.sh backup

# 每週清理舊備份
0 3 * * 0 find /var/backups/employee-salary -name "*.backup" -mtime +30 -delete
```

#### 手動備份
```bash
# 創建完整備份
./db-manage.sh backup

# 備份應用程式檔案
tar -czf app-backup-$(date +%Y%m%d).tar.gz \
    --exclude=node_modules \
    --exclude=.git \
    --exclude=logs \
    /opt/employee-salary-system/
```

### 6.3 系統維護

#### 定期更新
```bash
# 更新系統套件
sudo apt update && sudo apt upgrade -y  # Ubuntu/Debian
sudo yum update -y                      # CentOS/RHEL

# 更新 Node.js 相依套件
npm audit
npm update

# 重新啟動服務
pm2 restart employee-salary
```

#### 效能優化
```bash
# 清理日誌檔案
sudo journalctl --vacuum-time=7d

# 清理臨時檔案
sudo find /tmp -type f -mtime +7 -delete

# 重建資料庫索引 (每月執行)
./db-manage.sh push
```

### 6.4 故障排除

#### 常見問題解決

**應用程式無法啟動**
```bash
# 檢查端口占用
sudo lsof -i :5000

# 檢查環境變數
cat .env | grep -E "(DATABASE_URL|NODE_ENV|PORT)"

# 檢查相依套件
npm install

# 重新建置
npm run build
```

**資料庫連接失敗**
```bash
# 測試資料庫連接
./db-manage.sh check

# 檢查 PostgreSQL 服務 (本地資料庫)
sudo systemctl status postgresql

# 檢查網路連接 (Supabase)
ping db.your-project.supabase.co
```

**效能問題**
```bash
# 檢查記憶體使用
free -h
ps aux --sort=-%mem | head -10

# 檢查 CPU 使用
top -p $(pgrep -f employee-salary)

# 檢查磁碟 I/O
iostat -x 1
```

### 6.5 安全維護

#### 定期安全檢查
```bash
# 檢查登入失敗記錄
sudo grep "Failed password" /var/log/auth.log | tail -10

# 檢查開放端口
nmap localhost

# 更新 SSL 憑證 (如有設置)
sudo certbot renew --dry-run

# 檢查檔案權限
find /opt/employee-salary-system -type f -perm /002 -ls
```

#### 密碼安全
```bash
# 定期更新管理員密碼
# 1. 登入系統網頁介面
# 2. 前往系統設置
# 3. 修改管理員密碼

# 更新資料庫密碼 (如需要)
# 1. 在資料庫中修改密碼
# 2. 更新 .env 檔案中的 DATABASE_URL
# 3. 重新啟動應用程式
```

### 6.6 系統升級

#### 應用程式升級流程
```bash
# 1. 創建備份
./db-manage.sh backup
tar -czf current-app-backup.tar.gz /opt/employee-salary-system/

# 2. 停止應用程式
pm2 stop employee-salary

# 3. 下載新版本 (假設已上傳)
tar -xzf new-version.tar.gz

# 4. 更新檔案
cp -r new-version/* /opt/employee-salary-system/

# 5. 安裝新相依套件
npm install

# 6. 執行資料庫遷移
npm run db:push

# 7. 重新建置
npm run build

# 8. 重新啟動
pm2 start employee-salary

# 9. 驗證升級
curl http://localhost:5000/api/health
```

---

## 7. 系統架構與特色

### 7.1 技術架構優勢
- **前端**: React 18 + TypeScript + Vite - 現代化使用者介面
- **後端**: Express.js + TypeScript - 穩定的 API 服務
- **資料庫**: PostgreSQL + Drizzle ORM - 企業級資料管理
- **部署**: 支援雲端 (Supabase) 和本地部署
- **監控**: 內建健康檢查和效能監控

### 7.2 安全特色
- 員工身份證號加密存儲
- 會話安全管理
- SQL 注入防護
- XSS 和 CSRF 攻擊防護
- 資料存取權限控制

### 7.3 維護特色
- 自動備份機制
- 完整的日誌系統
- 系統監控工具
- 一鍵部署腳本
- 詳細的故障排除指南

---

## 8. 聯絡與支援

### 8.1 文檔參考
- 所有技術問題請優先參考 `docs/` 目錄下的相關文檔
- 常見問題可查閱 `docs/TROUBLESHOOTING.md`
- API 開發請參考 `docs/API_DOCUMENTATION.md`

### 8.2 自助診斷
```bash
# 系統健康檢查
./monitor.sh

# 資料庫連接測試
./db-manage.sh check

# 應用程式日誌檢查
pm2 logs employee-salary --lines 50
```

### 8.3 緊急恢復
如遇嚴重問題，可使用自動恢復工具：
```bash
# 執行自動恢復程序
node scripts/auto-recovery.js

# 從備份恢復
./db-manage.sh restore /path/to/backup/file
```

---

## 結論

此部署包提供完整的員工薪資計算系統解決方案，包含：

✅ **完整原始碼** - 前端、後端、資料庫完整程式碼
✅ **詳細文檔** - 涵蓋安裝、配置、維護、故障排除
✅ **自動化工具** - 一鍵部署、系統監控、備份恢復
✅ **彈性部署** - 支援雲端和本地部署方式
✅ **自主維護** - 完整的運維工具和指南

客戶可完全自主地在任何環境中部署、配置、維護和升級此系統，無需依賴外部支援。