# 員工薪資計算系統 - 完整部署包

## 專案概述

這是一個完整的員工薪資計算與考勤管理系統，包含以下核心功能：
- 員工管理與考勤打卡
- 條碼掃描打卡系統
- 薪資計算（包含加班費、勞健保扣款）
- 報表生成與數據匯出
- 多語言支援（繁體中文）
- 即時數據同步

## 技術架構

### 前端技術棧
- **React 18** - 使用者介面框架
- **TypeScript** - 類型安全的 JavaScript
- **Vite** - 現代化建置工具
- **Tailwind CSS** - 實用優先的 CSS 框架
- **shadcn/ui** - 高品質 UI 元件庫
- **TanStack Query** - 數據獲取與狀態管理
- **React Hook Form** - 表單處理
- **Wouter** - 輕量級路由系統

### 後端技術棧
- **Node.js** - JavaScript 運行環境
- **Express.js** - Web 應用框架
- **TypeScript** - 類型安全開發
- **Drizzle ORM** - 現代化 SQL 查詢建構器
- **PostgreSQL** - 主要資料庫
- **Supabase** - 雲端資料庫服務
- **Passport.js** - 認證中介軟體

### 資料庫
- **PostgreSQL** - 關聯式資料庫
- **Supabase** - 雲端資料庫解決方案
- **Drizzle ORM** - 數據建模與遷移

## 系統特色

1. **精確的薪資計算**
   - 按日計算加班費（符合勞動法規）
   - 自動計算勞健保扣款
   - 支援多種工時制度

2. **靈活的考勤系統**
   - 條碼掃描打卡
   - 手動考勤登記
   - 即時打卡記錄顯示

3. **完整的數據管理**
   - 員工資料加密保護
   - 自動備份機制
   - 數據完整性檢查

4. **用戶友好介面**
   - 響應式設計
   - 直觀的操作流程
   - 即時狀態反饋

## 部署環境需求

### 最低系統需求
- **作業系統**: Linux Ubuntu 20.04+ / CentOS 8+ / Windows Server 2019+
- **記憶體**: 最少 2GB RAM，建議 4GB+
- **儲存空間**: 最少 10GB，建議 20GB+
- **網路**: 穩定的網際網路連接

### 軟體需求
- **Node.js**: 18.0.0 或更高版本
- **npm**: 8.0.0 或更高版本
- **PostgreSQL**: 13.0 或更高版本（如使用本地資料庫）
- **Git**: 2.25.0 或更高版本

## 快速部署指南

### 方法一：使用 Supabase（推薦）

1. **設置 Supabase 專案**
   ```bash
   # 前往 https://supabase.com 創建新專案
   # 獲取專案 URL 和 API 金鑰
   ```

2. **部署應用程式**
   ```bash
   # 解壓專案檔案
   unzip employee-salary-system.zip
   cd employee-salary-system

   # 安裝相依套件
   npm install

   # 設置環境變數
   cp .env.example .env
   # 編輯 .env 檔案，填入 Supabase 連接資訊

   # 初始化資料庫
   npm run db:push

   # 啟動應用程式
   npm run dev
   ```

### 方法二：使用本地 PostgreSQL

1. **安裝 PostgreSQL**
   ```bash
   # Ubuntu/Debian
   sudo apt update
   sudo apt install postgresql postgresql-contrib

   # CentOS/RHEL
   sudo yum install postgresql-server postgresql-contrib
   ```

2. **設置資料庫**
   ```bash
   # 創建資料庫和使用者
   sudo -u postgres psql
   CREATE DATABASE employee_salary_db;
   CREATE USER app_user WITH PASSWORD 'your_password';
   GRANT ALL PRIVILEGES ON DATABASE employee_salary_db TO app_user;
   ```

3. **部署應用程式**
   ```bash
   # 設置環境變數
   export DATABASE_URL="postgresql://app_user:your_password@localhost:5432/employee_salary_db"
   
   # 其餘步驟同方法一
   ```

## 詳細部署文件

請參考以下詳細文件：
- `docs/INSTALLATION.md` - 完整安裝指南
- `docs/CONFIGURATION.md` - 系統配置說明
- `docs/DATABASE_SETUP.md` - 資料庫設置指南
- `docs/API_DOCUMENTATION.md` - API 介面文件
- `docs/TROUBLESHOOTING.md` - 常見問題解決
- `docs/MAINTENANCE.md` - 系統維護指南

## 授權與支援

本專案包含完整原始碼，可依據您的需求進行客製化修改。

如有技術問題，請參考 `docs/SUPPORT.md` 檔案。

---

**建議**: 首次部署時請詳細閱讀所有文件，確保系統穩定運行。