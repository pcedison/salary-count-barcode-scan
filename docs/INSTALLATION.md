# 完整安裝指南

## 系統環境準備

### 1. 作業系統要求

**Linux (推薦)**
- Ubuntu 20.04 LTS 或更新版本
- CentOS 8 或更新版本
- Debian 11 或更新版本

**Windows**
- Windows Server 2019 或更新版本
- Windows 10/11 Pro 或更新版本

**macOS**
- macOS 11.0 或更新版本

### 2. 必要軟體安裝

#### Node.js 安裝

**Linux (Ubuntu/Debian)**
```bash
# 使用 NodeSource 倉庫安裝最新 LTS 版本
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs

# 驗證安裝
node --version  # 應顯示 v18.0.0 或更高
npm --version   # 應顯示 8.0.0 或更高
```

**Linux (CentOS/RHEL)**
```bash
# 使用 NodeSource 倉庫
curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -
sudo yum install -y nodejs

# 驗證安裝
node --version
npm --version
```

**Windows**
```powershell
# 使用 Chocolatey (管理員權限)
choco install nodejs

# 或直接從官網下載安裝程式
# https://nodejs.org/
```

**macOS**
```bash
# 使用 Homebrew
brew install node

# 或使用 MacPorts
sudo port install nodejs18
```

### 3. 資料庫選擇與設置

#### 選項 A: Supabase (雲端，推薦)

**優點:**
- 免費額度足夠中小企業使用
- 自動備份與高可用性
- 無需本地維護
- 內建即時同步功能

**設置步驟:**
1. 前往 https://supabase.com
2. 註冊帳號並創建新專案
3. 在專案設置中找到「Database」頁面
4. 複製「Connection string」中的 URI
5. 記錄以下資訊：
   - Project URL
   - Project API Key (anon key)
   - Database URL

#### 選項 B: 本地 PostgreSQL

**Linux 安裝:**
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install postgresql postgresql-contrib

# CentOS/RHEL
sudo yum install postgresql-server postgresql-contrib
sudo postgresql-setup initdb
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

**資料庫初始化:**
```bash
# 切換到 postgres 使用者
sudo -u postgres psql

# 在 PostgreSQL 命令列中執行
CREATE DATABASE employee_salary_db;
CREATE USER app_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE employee_salary_db TO app_user;
\q
```

## 應用程式部署

### 1. 解壓專案檔案

```bash
# 解壓專案壓縮檔
unzip employee-salary-system-complete.zip
cd employee-salary-system
```

### 2. 安裝相依套件

```bash
# 安裝所有相依套件
npm install
```

### 3. 環境變數設置

```bash
# 複製環境變數範本
cp .env.example .env

# 編輯環境變數檔案
nano .env  # Linux/macOS
notepad .env  # Windows
```

**環境變數設置範例 (.env):**

```env
# 基本設置
NODE_ENV=production
PORT=5000

# Supabase 設置（如使用 Supabase）
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.your-project.supabase.co:5432/postgres

# 本地 PostgreSQL 設置（如使用本地資料庫）
DATABASE_URL=postgresql://app_user:your_secure_password@localhost:5432/employee_salary_db

# 會話安全金鑰（請生成隨機字串）
SESSION_SECRET=your_very_long_random_session_secret_key_here
```

### 4. 資料庫初始化

```bash
# 推送資料庫結構
npm run db:push

# 檢查資料庫連接
npm run db:check
```

### 5. 建置與啟動

**生產模式:**
```bash
# 建置前端
npm run build

# 啟動生產伺服器
npm start
```

## 驗證安裝

### 1. 檢查服務狀態

```bash
# 檢查應用程式
curl http://localhost:5000

# 檢查資料庫連接
npm run db:check
```

### 2. 登入測試

1. 開啟瀏覽器前往 `http://localhost:5000`
2. 測試基本功能：
   - 員工管理
   - 考勤登記
   - 薪資計算

安裝完成後，請參考其他文件進行詳細系統配置。