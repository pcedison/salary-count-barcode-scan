# 薪資計算系統部署指南

本文檔將引導您部署薪資計算系統，包括設置數據庫、配置環境變量以及啟動應用程序。

## 系統需求

- Node.js 18+ 
- PostgreSQL 14+（或使用Supabase托管服務）
- npm 或 yarn 包管理器

## 部署步驟

### 1. 克隆代碼倉庫

```bash
git clone https://github.com/pcedison/Salary-counting.git
cd Salary-counting
```

### 2. 安裝依賴

```bash
npm install
```

### 3. 設置數據庫

#### 選項A：使用Supabase（推薦）

1. 在 [Supabase](https://supabase.com) 創建一個新項目
2. 在SQL編輯器中運行 `supabase_schema.sql` 文件中的SQL語句
3. 獲取數據庫連接字符串並配置環境變量

#### 選項B：使用本地或自托管PostgreSQL

1. 創建一個新的PostgreSQL數據庫
2. 執行 `supabase_schema.sql` 文件中的SQL語句
3. 配置環境變量以連接到數據庫

### 4. 配置環境變量

創建一個 `.env` 文件並添加以下內容：

```
DATABASE_URL=postgres://your_username:your_password@your_host:5432/your_db_name
SESSION_SECRET=your_random_secure_session_secret
```

### 5. 構建前端

```bash
npm run build
```

### 6. 啟動應用

#### 開發模式

```bash
npm run dev
```

#### 生產模式

```bash
npm start
```

## 與現有系統集成

如果您需要將本系統與其他系統集成，可以通過以下方式進行：

1. **API集成**：系統提供了完整的REST API，可以與其他系統進行數據交換
2. **數據庫共享**：可以通過數據庫視圖或共享表來實現與其他系統的數據共享
3. **身份驗證集成**：可以修改認證系統以集成LDAP、OAuth或其他身份提供商

## 維護和更新

### 數據庫備份

建議定期備份數據庫。使用Supabase時，可以使用其內置的備份功能；使用自托管PostgreSQL時，可以使用pg_dump工具：

```bash
pg_dump -U username dbname > backup_filename.sql
```

### 系統更新

從Git倉庫獲取最新代碼並重新部署：

```bash
git pull
npm install
npm run build
npm start
```

## 故障排除

如果您在部署過程中遇到問題，請檢查：

1. 數據庫連接字符串是否正確
2. 所有需要的表是否已創建
3. Node.js和npm版本是否符合要求
4. 防火牆或網絡設置是否允許應用程序與數據庫通信

## 支持和聯繫

如有其他問題，請通過GitHub倉庫的Issues功能提交問題，或聯繫系統管理員。