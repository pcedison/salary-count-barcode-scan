# 員工薪資管理系統 - 完整交付文件

**交付日期**: 2025年12月11日  
**系統版本**: v1.0.0

---

## 一、專案概述

這是一個全功能的員工薪資計算與考勤管理系統，專為中小型企業設計，具備以下主要功能：

- 薪資計算（支援多層加班費計算）
- 員工管理與資料加密
- 條碼掃描打卡系統
- 歷史記錄與報表列印
- 自動備份機制

---

## 二、技術架構

### 前端技術
| 技術 | 用途 |
|------|------|
| React 18 | 前端框架 |
| TypeScript | 類型安全 |
| Vite | 開發工具 |
| Tailwind CSS + shadcn/ui | UI 設計 |
| TanStack Query | 資料管理 |
| Wouter | 路由管理 |

### 後端技術
| 技術 | 用途 |
|------|------|
| Node.js + Express.js | API 服務 |
| TypeScript | 類型安全 |
| Drizzle ORM | 資料庫操作 |
| Passport.js | 身份驗證 |

### 資料庫
- **PostgreSQL**（主要資料庫）
- 支援 **Supabase** 雲端服務

---

## 三、環境變數設定（重要）

客戶需要在運行環境中設定以下環境變數：

### 必要環境變數

```env
# 資料庫連接
DATABASE_URL=postgresql://username:password@host:5432/database

# Supabase 連接（如果使用 Supabase）
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key

# 安全設定
SESSION_SECRET=your-random-secret-key-minimum-32-characters

# PostgreSQL 連接（分開設定）
PGHOST=your-database-host
PGPORT=5432
PGUSER=your-database-user
PGPASSWORD=your-database-password
PGDATABASE=your-database-name
```

### 環境變數取得方式

1. **Supabase 設定**：
   - 登入 [Supabase Dashboard](https://supabase.com/dashboard)
   - 進入專案設定 → API
   - 複製 `Project URL` 作為 `VITE_SUPABASE_URL`
   - 複製 `anon public` key 作為 `VITE_SUPABASE_ANON_KEY`
   - 複製 `service_role` key 作為 `SUPABASE_SERVICE_KEY`

2. **資料庫連接**：
   - 進入專案設定 → Database
   - 複製連接字串作為 `DATABASE_URL`

---

## 四、安裝與啟動步驟

### 系統要求
- Node.js 18.0.0 或更高版本
- PostgreSQL 12+ 或 Supabase 帳戶
- 記憶體：最少 4GB RAM
- 儲存空間：最少 10GB

### 安裝步驟

```bash
# 1. 解壓縮專案
unzip employee-salary-system.zip
cd employee-salary-system

# 2. 安裝依賴套件
npm install

# 3. 設定環境變數
# 建立 .env 檔案，填入上述環境變數

# 4. 初始化資料庫結構
npm run db:push

# 5. 開發模式啟動
npm run dev

# 6. 生產模式啟動
npm run build
npm start
```

### 存取應用程式
- 開發模式：`http://localhost:5000`
- 生產模式：`http://localhost:5000`

---

## 五、專案結構

```
├── client/                 # 前端 React 應用
│   ├── src/
│   │   ├── components/     # UI 組件
│   │   ├── pages/          # 頁面組件
│   │   │   ├── AttendancePage.tsx    # 考勤頁面
│   │   │   ├── BarcodeScanPage.tsx   # 條碼掃描頁面
│   │   │   ├── EmployeesPage.tsx     # 員工管理頁面
│   │   │   ├── HistoryPage.tsx       # 歷史記錄頁面
│   │   │   ├── PrintSalaryPage.tsx   # 薪資列印頁面
│   │   │   └── SettingsPage.tsx      # 系統設定頁面
│   │   ├── hooks/          # 自訂 Hooks
│   │   └── lib/            # 工具函數
├── server/                 # 後端 API 服務
│   ├── routes.ts           # API 路由
│   ├── storage.ts          # 資料存取層
│   ├── supabase-client.ts  # Supabase 客戶端
│   └── index.ts            # 伺服器入口
├── shared/                 # 共用程式碼
│   ├── schema.ts           # 資料庫結構定義
│   └── utils/              # 共用工具
├── docs/                   # 技術文件
├── backups/                # 自動備份目錄
└── logs/                   # 系統日誌
```

---

## 六、資料庫結構

### 主要資料表

| 資料表 | 用途 |
|--------|------|
| `employees` | 員工基本資料 |
| `temporary_attendance` | 考勤記錄 |
| `salary_records` | 薪資計算記錄 |
| `settings` | 系統設定 |
| `holidays` | 員工假日記錄 |
| `taiwan_holidays` | 台灣國定假日 |
| `calculation_rules` | 特殊計算規則 |

### 資料庫遷移指令

```bash
# 推送資料庫結構變更
npm run db:push
```

---

## 七、功能說明

### 1. 薪資計算
- 支援 OT1 (1.34x) 和 OT2 (1.67x) 加班費率
- 每日計算後匯總
- 假日工作特殊費率
- 各項扣款管理（勞保、健保等）

### 2. 員工管理
- 員工資料 CRUD
- 身分證號加密儲存
- 在職/離職狀態管理

### 3. 考勤系統
- 條碼掃描打卡
- 手動時間輸入
- 即時考勤追蹤

### 4. 報表功能
- 月度薪資報表
- CSV 匯出
- 列印友善版面

### 5. 管理員功能
- PIN 碼驗證（預設：123456，可在設定中修改）
- 系統設定管理

---

## 八、備份與還原

### 自動備份
系統已設定自動備份機制，備份檔案存放於 `backups/` 目錄：
- `daily/` - 每日備份
- `weekly/` - 每週備份
- `monthly/` - 每月備份

### 手動備份

```bash
# 資料庫備份
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql

# 還原資料庫
psql $DATABASE_URL < backup_file.sql
```

### 應用程式內備份
系統內建 JSON 格式備份，可從 `backups/` 目錄取得。

---

## 九、生產環境部署

### 使用 PM2（推薦）

```bash
# 安裝 PM2
npm install -g pm2

# 建置應用程式
npm run build

# 啟動應用程式
pm2 start dist/index.js --name salary-system

# 設定開機自啟
pm2 startup
pm2 save

# 監控應用程式
pm2 monit
```

### 使用 Nginx 反向代理

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
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 十、常見問題排解

### 1. 資料庫連接失敗
```bash
# 檢查環境變數
echo $DATABASE_URL

# 測試連接
npm run db:push
```

### 2. 應用程式無法啟動
```bash
# 檢查 Node.js 版本
node --version  # 需要 18+

# 重新安裝依賴
rm -rf node_modules
npm install
```

### 3. 端口被佔用
```bash
# 檢查端口使用
netstat -tlnp | grep 5000

# 終止佔用程序
kill -9 <PID>
```

---

## 十一、技術支援聯絡

如需技術支援，請準備以下資訊：
1. 錯誤訊息截圖
2. 系統日誌（`logs/` 目錄）
3. 環境變數設定（隱藏敏感資訊）

---

## 十二、附件清單

交付內容應包含：

- [x] 專案原始碼 ZIP 檔
- [x] 本交付文件 (HANDOVER_DOCUMENT.md)
- [x] 技術文件 (docs/ 目錄)
- [x] README.md
- [x] 安裝指南 (INSTALLATION_GUIDE.md)
- [ ] 環境變數清單（需另外提供給客戶）
- [ ] Supabase 專案存取權限（需轉移給客戶）

---

## 十三、重要提醒

1. **安全性**：請勿將環境變數或 API 金鑰上傳至公開儲存庫
2. **備份**：建議每日備份資料庫
3. **更新**：定期執行 `npm audit fix` 檢查安全性漏洞
4. **密碼**：首次部署後請立即修改預設管理員 PIN 碼

---

**交付完成確認**

- 系統名稱：員工薪資管理系統
- 交付日期：2025年12月11日
- 技術架構：React + Express + PostgreSQL/Supabase

