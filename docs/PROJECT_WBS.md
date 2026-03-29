# 員工薪資計算系統 V3 — 架構、設計與工作分解結構（WBS）

> 本文件面向從 GitHub fork 本專案的開發者，提供完整的系統架構、模組設計與任務配置說明。

---

## 1. 專案概覽

### 1.1 系統定位

本系統是一套**企業內部員工薪資計算與出勤管理系統**，主要功能：

- 員工出勤紀錄管理（條碼掃描 / LINE 打卡）
- 月薪計算（含加班費、特別假期、加減項）
- 員工資料管理（含身分證字號 AES 加密）
- 管理員後台（PIN 驗證 + Session 管理）
- LINE 打卡考勤（OAuth 綁定 + 管理員審批 + Bot 推播）

### 1.2 技術棧

| 層次 | 技術選型 |
|------|---------|
| 前端 | React 18 + TypeScript + Vite + Tailwind CSS + Radix UI |
| 後端 | Node.js + Express + TypeScript |
| 資料庫 | PostgreSQL (Supabase hosted) |
| ORM | Drizzle ORM (type-safe, postgres-js driver) |
| 狀態管理 | TanStack Query v5 |
| 路由 | Wouter |
| 測試 | Vitest |
| 部屬 | Zeabur (Node.js auto-detect, `npm run build` + `npm start`) |

---

## 2. 系統架構圖

```
┌─────────────────────────────────────────────────────────┐
│                    瀏覽器 / 手機                          │
│   React SPA (Vite)                                       │
│   ┌───────────┬──────────┬──────────┬──────────────────┐ │
│   │ 出勤管理  │ 員工管理 │ 薪資計算 │ LINE 打卡 (手機)  │ │
│   └───────────┴──────────┴──────────┴──────────────────┘ │
└────────────────────────┬────────────────────────────────┘
                         │ HTTPS / REST API
┌────────────────────────▼────────────────────────────────┐
│                    Express Server                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │ Security │ │ Session  │ │ Rate     │ │ HTTP Log  │  │
│  │ Middleware│ │ Middleware│ │ Limiter  │ │ Middleware│  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────┘  │
│  ┌──────────────────────────────────────────────────┐   │
│  │               API Routes (10 modules)             │   │
│  │  admin │ employees │ attendance │ scan │ salary   │   │
│  │  holidays │ settings │ import │ health │ line     │   │
│  └──────────────────────────┬───────────────────────┘   │
│  ┌──────────────────────────▼───────────────────────┐   │
│  │           Storage Layer (DatabaseStorage)         │   │
│  │     IStorage interface + 40+ methods              │   │
│  └──────────────────────────┬───────────────────────┘   │
│  ┌──────────────────────────▼───────────────────────┐   │
│  │           Drizzle ORM + postgres-js               │   │
│  └──────────────────────────┬───────────────────────┘   │
└────────────────────────────┼────────────────────────────┘
                              │ SSL connection
┌─────────────────────────────▼──────────────────────────┐
│              Supabase PostgreSQL                        │
│  employees │ temporaryAttendance │ settings             │
│  salaryRecords │ holidays │ calculationRules            │
│  pendingBindings │ oauthStates │ taiwanHolidays         │
└────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                  LINE Platform                           │
│  LINE Login Channel (OAuth 2.0) │ Messaging API (Push)  │
└──────────────────────────────────────────────────────────┘
```

---

## 3. 目錄結構 WBS

```
Xin-Zi-Ji-Suan-Sao-Ma-Qiang-V3/
│
├── client/                        # 前端 React SPA
│   └── src/
│       ├── pages/                 # 8 個頁面元件（路由級別）
│       ├── components/            # 共用 UI 元件（含 50+ Radix 包裝）
│       ├── hooks/                 # 資料查詢與狀態管理 Hook
│       ├── lib/                   # 工具函式、查詢客戶端、薪資計算
│       ├── types/                 # TypeScript 類型定義
│       └── utils/                 # 輔助工具（員工快取）
│
├── server/                        # 後端 Express 應用
│   ├── index.ts                   # 伺服器進入點
│   ├── routes.ts                  # 路由註冊總覽
│   ├── storage.ts                 # 資料庫存取層（IStorage 介面）
│   ├── session.ts                 # Session 管理
│   ├── admin-auth.ts              # 管理員驗證與操作日誌
│   ├── db.ts                      # Drizzle ORM 實例
│   ├── db-monitoring.ts           # 自動備份與健康監控
│   ├── routes/                    # 10 個路由模組
│   ├── services/                  # 業務邏輯服務（LINE、薪資規則）
│   ├── middleware/                # Express 中介層
│   ├── utils/                     # 伺服器端工具函式
│   ├── config/                    # 環境變數驗證
│   └── scripts/                   # CLI 腳本（AES 遷移、備份驗證）
│
├── shared/                        # 前後端共用程式碼
│   ├── schema.ts                  # 資料庫表定義（Drizzle）
│   ├── calculationModel.ts        # 薪資計算模型
│   └── utils/                     # Caesar 加密、AES 加密、工具
│
├── docs/                          # 文件（12+ 份）
├── scripts/                       # 根層 CLI 腳本
├── dist/                          # 建置輸出
├── package.json                   # 相依套件與 npm 腳本
├── vite.config.ts                 # 前端建置設定
├── vitest.config.ts               # 測試設定
└── drizzle.config.ts              # ORM 設定
```

---

## 4. 資料庫 Schema 設計

### 4.1 資料表關係

```
employees (核心)
  ├── temporaryAttendance (1:N, via employeeId)
  ├── holidays (1:N, via employeeId, nullable — 全公司假日 employeeId=null)
  ├── salaryRecords (1:N, via employeeId)
  └── pendingBindings (1:N, via employeeId)

settings (全域設定，單筆)
calculationRules (特殊薪資規則，按年月員工)
oauthStates (LINE OAuth CSRF 狀態，TTL 10分鐘)
taiwanHolidays (台灣國定假日參考，唯讀)
```

### 4.2 資料表詳細說明

#### `employees` — 員工主表
```
id                  serial PK
name                text NOT NULL              姓名
idNumber            text UNIQUE NOT NULL       身分證/居留證 (可加密)
isEncrypted         boolean DEFAULT false      是否 AES 加密
position / department / email / phone
active              boolean DEFAULT true
lineUserId          text                       LINE 綁定 ID
lineDisplayName / linePictureUrl / lineBindingDate
specialLeaveDays / specialLeaveWorkDateRange   特別假期設定
specialLeaveUsedDates json[]                  已使用日期陣列
specialLeaveCashDays / specialLeaveCashMonth   特休換現金
createdAt
```

#### `temporaryAttendance` — 出勤打卡記錄
```
id                  serial PK
employeeId          int FK → employees
date                text                       "YYYY/MM/DD"
clockIn / clockOut  text                       "HH:MM"
isHoliday / isBarcodeScanned
holidayId           int FK → holidays
createdAt
```

#### `settings` — 全域設定（僅一筆）
```
baseHourlyRate      double DEFAULT 119         時薪
ot1Multiplier       double DEFAULT 1.34        加班一倍率
ot2Multiplier       double DEFAULT 1.67        加班二倍率
baseMonthSalary     double DEFAULT 28590       月薪基本
welfareAllowance    double DEFAULT 0
deductions          json[]                     {name, amount, description}
allowances          json[]                     {name, amount, description}
adminPin            text                       PBKDF2 雜湊後的 PIN
updatedAt
```

#### `salaryRecords` — 月薪紀錄
```
salaryYear / salaryMonth int NOT NULL
employeeId / employeeName
baseSalary / housingAllowance / welfareAllowance
totalOT1Hours / totalOT2Hours / totalOvertimePay
holidayDays / holidayDailySalary / totalHolidayPay
grossSalary / deductions[] / allowances[] / totalDeductions / netSalary
attendanceData      json                       完整出勤明細
specialLeaveInfo    json                       特休使用明細
```

#### `pendingBindings` — LINE 綁定審核隊列
```
id, employeeId FK
lineUserId / lineDisplayName / linePictureUrl
status              text                       "pending" | "approved" | "rejected"
requestedAt / reviewedAt / reviewedBy / rejectReason
```

#### `oauthStates` — LINE OAuth CSRF 防護
```
id, state (unique), createdAt, expiresAt      TTL 10分鐘，定時清理
```

---

## 5. 後端模組設計

### 5.1 路由模組（10 個）

| 模組 | 檔案 | 主要職責 |
|------|------|---------|
| admin | `admin.routes.ts` | PIN 登入、登出、Session 查詢、PIN 修改 |
| employees | `employees.routes.ts` | 員工 CRUD，公開/管理員分級存取 |
| attendance | `attendance.routes.ts` | 出勤記錄 CRUD |
| scan | `scan.routes.ts` | 條碼掃描（瀏覽器 / Raspberry Pi 端點） |
| salary | `salary.routes.ts` | 薪資記錄 CRUD、計算測試、PDF 輸出 |
| holidays | `holidays.routes.ts` | 假日管理 |
| settings | `settings.routes.ts` | 系統設定讀寫 |
| import | `import.routes.ts` | CSV 匯入（出勤 / 薪資） |
| health | `health.routes.ts` | 健康探針（/api/health, /ready, /live） |
| line | `line.routes.ts` | LINE OAuth、綁定、打卡、Webhook（條件啟用） |

### 5.2 中介層（Middleware）

```
setupTrustProxy(app)          X-Forwarded-For 信任設定
setupSecurity(app)            Helmet + CORS（依 ALLOWED_ORIGINS）
setupAdminSession(app)        express-session + connect-pg-simple
express.raw(...)              webhook 專用 raw body（/api/line/webhook）
express.json()                一般 API body 解析
httpLogging                   請求 / 回應日誌（按狀態碼分級）
loginLimiter                  登入端點速率限制（防暴力破解）
strictLimiter                 匯入端點速率限制
requireAdmin                  管理員 Session 驗證（依 admin.routes 使用）
```

### 5.3 儲存層（Storage Layer）

`IStorage` 介面定義 40+ 個方法，`DatabaseStorage` 實作所有方法。

設計原則：
- **所有資料庫操作集中在此層**，路由層不直接操作 DB
- **交易性操作**（`db.transaction()`）：LINE 綁定審批（同時更新 employees + pendingBindings）、條碼掃描（Advisory Lock 防重複打卡）
- **加密感知查詢**：`getEmployeeByIdNumber()` 支援明文 / Caesar / AES 三種格式比對

### 5.4 服務層（Services）

| 服務 | 檔案 | 職責 |
|------|------|------|
| LINE Service | `services/line.service.ts` | LINE OAuth URL 產生、Token 換取、Profile 查詢、推播、Webhook 簽章驗證 |
| 薪資規則載入器 | `services/calculationRulesLoader.ts` | 啟動時從 DB 載入特殊薪資規則至記憶體 |

### 5.5 工具函式（Utils）

| 工具 | 檔案 | 職責 |
|------|------|------|
| 薪資計算器 | `utils/salaryCalculator.ts` | 加班費、假日薪資、月薪計算（24KB） |
| 員工身分識別 | `utils/employeeIdentity.ts` | ID 格式正規化、加密比對、多格式候選產生 |
| 管理員 PIN 驗證 | `utils/adminPinAuth.ts` | PBKDF2 雜湊、PIN 驗證 |
| 結構化日誌 | `utils/logger.ts` | Winston-based，帶 context 標籤 |
| HTTP 日誌 | `utils/httpLogging.ts` | 請求/回應格式化，依狀態碼分 warn/error |

---

## 6. 前端模組設計

### 6.1 頁面（Pages）

| 頁面 | 路徑 | 說明 |
|------|------|------|
| AttendancePage | `/` 或 `/attendance` | 出勤記錄管理、今日打卡狀態 |
| BarcodeScanPage | `/barcode` | 條碼掃描介面（含即時回饋） |
| EmployeesPage | `/employees` | 員工 CRUD + LINE 綁定審核（管理員） |
| HistoryPage | `/history` | 薪資歷史查詢與管理 |
| SettingsPage | `/settings` | 薪資設定、管理員 PIN 修改 |
| PrintSalaryPage | `/print-salary` | 薪資單列印（不含主導覽列） |
| ClockInPage | `/clock-in` | LINE 打卡頁面（手機友善，不含主導覽列） |
| QRCodePage | `/qrcode` | QR Code 產生（管理員限定） |

**注意**：`ClockInPage` 和 `PrintSalaryPage` 不包在 `MainLayout` 裡，為獨立全版面頁面。

### 6.2 Hook 資料流

```
TanStack Query (queryClient)
    │
    ├── useEmployees()          GET /api/employees (or /admin)
    ├── useAttendanceData()     GET /api/attendance
    ├── useHistoryData()        GET /api/salary-records
    ├── useSettings()           GET /api/settings
    └── useAdmin()              GET /api/admin/session
                                 └─ AdminProvider (Context)
                                     └─ isAdmin, checkAdmin(), logout()
```

### 6.3 路由架構

```
App
└── QueryClientProvider
    └── AdminProvider
        └── Router (Wouter Switch)
            ├── /attendance     → MainLayout > AttendancePage
            ├── /barcode        → MainLayout > BarcodeScanPage
            ├── /employees      → MainLayout > EmployeesPage
            ├── /history        → MainLayout > HistoryPage
            ├── /settings       → MainLayout > SettingsPage
            ├── /print-salary   → PrintSalaryPage (no layout)
            ├── /clock-in       → ClockInPage (no layout)
            ├── /qrcode         → QRCodePage (no layout)
            └── *               → NotFound
```

---

## 7. 安全設計

### 7.1 身分驗證

```
管理員 PIN
  │
  ├── PBKDF2 雜湊儲存（不可逆）
  ├── POST /api/verify-admin → express-session cookie
  ├── Session 存於 PostgreSQL (connect-pg-simple)
  ├── 逾時設定（預設 60 分鐘，touch 延期）
  └── 登入嘗試速率限制（loginLimiter）
```

### 7.2 員工 ID 加密體系

```
三層相容：
  明文 → Caesar Cipher（舊版） → AES-256（現行生產）

查詢流程（getEmployeeByIdNumber）：
  輸入 idNumber
    │
    ├── buildEmployeeIdentityLookupCandidates()
    │     生成：明文、Caesar 加密、AES 加密 三個候選值
    │
    └── SQL IN (候選1, 候選2, 候選3)
          命中任何一個 → 回傳員工
```

### 7.3 LINE 安全機制

| 機制 | 實作方式 |
|------|---------|
| OAuth CSRF 防護 | DB 儲存隨機 state token（TTL 10 分鐘） |
| Webhook 簽章驗證 | HMAC-SHA256（X-Line-Signature header） |
| 敏感資料傳遞 | Session 傳遞（不用 URL query string） |
| 綁定二次確認 | 管理員審批流程（pendingBindings → approved） |

---

## 8. AES 加密遷移系統

### 8.1 遷移狀態機

```
未加密 (plain) → Caesar 加密（舊版本）→ AES-256 加密（現行）
                                              ↑
                                     aes:migrate 執行點
```

### 8.2 遷移工具鏈（npm scripts）

| 指令 | 說明 |
|------|------|
| `aes:inspect` | 查看每位員工的加密狀態 |
| `aes:report` | 完整可行性報告 |
| `aes:snapshot` | 遷移前備份快照 |
| `aes:rehearse` | 模擬遷移（不寫入） |
| `aes:ready` | 就緒閘門（確認可執行） |
| `aes:migrate` | 正式執行遷移 |
| `aes:rollback` | 還原至快照 |
| `aes:status` | 遷移後狀態確認 |

---

## 9. LINE 打卡功能架構

### 9.1 綁定流程

```
員工手機掃 QR Code
     │
     ▼
GET /clock-in (ClockInPage)
     │
     ▼ 點擊「LINE 登入」
GET /api/line/login → 重導至 LINE OAuth
     │
     ▼ 授權後
GET /api/line/callback
     ├── 驗證 state token（CSRF 防護）
     ├── 交換 Access Token
     ├── 取得 LINE Profile (userId, displayName, pictureUrl)
     ├── 儲存至 req.session.lineTemp
     └── 重導回 /clock-in
     │
     ▼
GET /api/line/temp-data → 取出 session 資料（一次性）
     │
     ▼ 員工輸入身分證字號
POST /api/line/bind
     ├── getEmployeeByIdNumber() (AES 感知查詢)
     ├── createPendingBinding()
     └── 回傳「等待審核」
     │
     ▼ 管理員操作
POST /api/line/pending-bindings/:id/approve
     └── approvePendingBinding() (DB 事務)
         ├── UPDATE employees SET lineUserId=...
         └── UPDATE pendingBindings SET status='approved'
     │
     ▼
POST /api/line/clock-in
     ├── getEmployeeByLineUserId()
     ├── 查詢今日出勤記錄
     ├── 若無記錄 → createTemporaryAttendance (clockIn)
     ├── 若有未完成記錄 → updateTemporaryAttendance (clockOut)
     └── sendClockInNotification() (LINE Push)
```

### 9.2 條件式啟用

LINE 功能僅在設定 `LINE_LOGIN_CHANNEL_ID` 環境變數時啟用：

```typescript
// server/routes.ts
if (process.env.LINE_LOGIN_CHANNEL_ID) {
  registerLineRoutes(app);
}

// server/index.ts
if (process.env.LINE_LOGIN_CHANNEL_ID) {
  // 每小時清理過期 OAuth states
}
```

---

## 10. 測試架構

### 10.1 測試分層

| 層次 | 檔案模式 | 說明 |
|------|---------|------|
| 單元測試 | `*.test.ts` | 工具函式、加密、計算邏輯 |
| 整合測試 | `*.integration.test.ts` | API 路由（in-memory DB mock） |
| 真實 DB 測試 | `*.real-db.test.ts` | 針對實際 PostgreSQL |
| 煙霧測試 | `test:smoke` | 快速路由可用性驗證 |

### 10.2 測試指令

```bash
npm test                  # 全部單元 + 整合測試
npm run test:watch        # 監視模式
npm run test:smoke        # 快速 API 冒煙測試
npm run test:real-db      # 真實資料庫測試（需 DATABASE_URL）
npm run verify:core       # check + test + build 全套驗證
npm run verify:ops        # core + 備份還原驗證
```

### 10.3 測試覆蓋範圍

```
server/utils/adminPinAuth.test.ts          PIN 雜湊驗證
server/utils/employeeIdentity.test.ts      ID 加密比對邏輯
server/utils/httpLogging.test.ts           HTTP 日誌格式
server/utils/logger.test.ts               結構化日誌
server/middleware/security.test.ts         安全標頭
server/db-monitoring.test.ts              備份與監控
server/routes/admin.routes.integration.test.ts
server/routes/attendance.routes.integration.test.ts (未列出但存在)
server/routes/employees.routes.integration.test.ts
server/routes/salary.routes.integration.test.ts
server/routes/scan.routes.integration.test.ts
server/routes/line.routes.integration.test.ts
server/routes/error-handling.test.ts
server/scripts/aes-migration-*.test.ts    AES 遷移腳本
server/scripts/secrets-generator.test.ts
server/rehearsal.real-db.test.ts          備份還原真實演練
server/storage.real-db.test.ts            Storage 方法真實 DB
client/src/lib/adminSession.test.ts
client/src/lib/appNavigation.test.ts
client/src/lib/printSalary.test.ts
shared/utils/adminSessionPolicy.test.ts
server/config/envValidator.test.ts
```

---

## 11. 環境變數完整清單

### 必填

| 變數 | 說明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 連線字串（Supabase 格式） |

### 強烈建議（production 必填）

| 變數 | 說明 | 預設值 |
|------|------|--------|
| `SESSION_SECRET` | Session 加密金鑰（≥32 字元） | dev 環境有 fallback |
| `DEFAULT_ADMIN_PIN` | 初始管理員 PIN | 隨機產生 |
| `NODE_ENV` | `production` 或 `development` | `development` |
| `TRUST_PROXY` | Zeabur/反向代理後需設 `true` | `false` |
| `SESSION_SECURE` | HTTPS 環境設 `true` | `false` |

### AES 加密（建議啟用）

| 變數 | 說明 |
|------|------|
| `USE_AES_ENCRYPTION` | `true` 啟用 AES-256 加密 |
| `ENCRYPTION_KEY` | 加密金鑰（≥32 字元） |
| `ENCRYPTION_SALT` | 加密 salt（任意字串） |

### LINE 打卡（選填，全填或全不填）

| 變數 | 說明 |
|------|------|
| `LINE_LOGIN_CHANNEL_ID` | LINE Login Channel ID |
| `LINE_LOGIN_CHANNEL_SECRET` | LINE Login Channel Secret |
| `LINE_LOGIN_CALLBACK_URL` | OAuth Callback URL（需與 Console 設定一致） |
| `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` | Messaging API Access Token |
| `LINE_MESSAGING_CHANNEL_SECRET` | Messaging API Channel Secret |

### 操作設定（選填）

| 變數 | 說明 | 預設值 |
|------|------|--------|
| `PORT` | 伺服器埠號 | `5000` |
| `LOG_LEVEL` | `debug` / `info` / `warn` / `error` | `info` |
| `SESSION_TIMEOUT` | Session 逾時分鐘數 | `60` |
| `SESSION_SAME_SITE` | Cookie SameSite 設定 | `lax` |
| `ALLOWED_ORIGINS` | CORS 允許來源（逗號分隔） | 無 |

---

## 12. 建置與部屬流程

### 12.1 本機開發

```bash
npm install                 # 安裝相依套件
cp .env.example .env        # 設定環境變數
npm run dev                 # 啟動開發伺服器 (port 5000)
npm run check               # TypeScript 型別檢查
npm test                    # 執行測試
```

### 12.2 Production 建置

```bash
npm run build
# 產生：
#   dist/index.js            後端 bundle (esbuild)
#   dist/public/             前端靜態檔案 (Vite)
#     ├── index.html
#     ├── assets/
#     │   ├── vendor-query-*.js    TanStack Query
#     │   ├── vendor-ui-*.js       Radix UI
#     │   ├── vendor-charts-*.js   Recharts
#     │   └── ...
#     └── (ClockInPage / QRCodePage 各自 code-split)

npm start                   # node dist/index.js
```

### 12.3 Zeabur 部屬

Zeabur 自動執行：
1. `npm run build`
2. `npm start`

無需 Dockerfile，Node.js 專案自動偵測。

---

## 13. 文件索引

| 文件 | 路徑 | 內容 |
|------|------|------|
| **部屬指南** | `docs/DEPLOYMENT_GUIDE.md` | 正式上線 Step 1~4 + 驗證清單 |
| **設定說明** | `docs/CONFIGURATION.md` | 所有環境變數詳解 |
| **資料庫建置** | `docs/DATABASE_SETUP.md` | PostgreSQL 準備與驗證 |
| **安裝指南** | `docs/INSTALLATION.md` | 本機安裝步驟 |
| **AES 遷移手冊** | `docs/AES_MIGRATION_RUNBOOK.md` | 加密遷移完整流程 |
| **維護手冊** | `docs/MAINTENANCE.md` | 日常維護程序 |
| **運維手冊** | `docs/OPERATIONS_RUNBOOK.md` | 探針、備份、還原、運維 |
| **疑難排解** | `docs/TROUBLESHOOTING.md` | 常見問題與除錯 |
| **正式上線任務** | `docs/PRODUCTION_EXECUTION_QUEUE.md` | 當前 P0 任務隊列 |
| **任務積壓** | `docs/PRODUCTION_TASK_BACKLOG.md` | 完整任務積壓清單 |
| **支援與交接** | `docs/SUPPORT.md` | 系統交接資訊 |
| **本文件** | `docs/PROJECT_WBS.md` | 架構設計與 WBS |

---

## 14. Fork 後快速上手清單

若你從 GitHub fork 本專案，請依序完成：

- [ ] `npm install`
- [ ] 複製 `.env.example` 為 `.env`，填入 `DATABASE_URL`（Supabase 或本機 PG）
- [ ] `npm run db:push` 建立資料表
- [ ] `npm run secrets:generate` 產生 `SESSION_SECRET`、`ENCRYPTION_KEY`
- [ ] 更新 `.env` 填入產生的金鑰
- [ ] `npm run dev` 啟動
- [ ] 瀏覽 `http://localhost:5000`，以預設 PIN 登入（見控制台輸出）
- [ ] `npm test` 確認測試全部通過
- [ ] `npm run build` 確認建置無誤
- [ ] （可選）設定 5 個 LINE 環境變數啟用 LINE 打卡功能
- [ ] （生產環境）執行 `AES_MIGRATION_OPERATOR=name npm run aes:migrate -- --allow-remote`
