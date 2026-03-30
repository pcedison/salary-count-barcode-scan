# 員工薪資與掃碼打卡系統 V3

這個專案目前的主線是：

- 前後端單一 repo
- PostgreSQL-only
- 管理員授權採 server-side session / cookie
- 員工敏感證號支援 `plaintext + Caesar + AES` 相容讀寫
- 具備 health probe、backup / restore readiness、AES migration readiness

目前 repo 的 production hardening 已進到最後收尾階段；最新施工與驗證基線請看：

- `docs/PRODUCTION_EXECUTION_QUEUE.md`
- `docs/PRODUCTION_TASK_BACKLOG.md`
- `docs/CLAUDE_CODE_SUBAGENT_HANDOFF.md`

## 功能範圍

- 員工資料管理
- 條碼掃描打卡與 Raspberry Pi 掃碼入口
- 考勤紀錄維護
- 薪資計算、歷史查詢、列印、CSV 匯出
- 假日與特休管理
- 管理員 PIN 驗證、session restore、logout、PIN 更新
- backup / restore readiness、AES migration dry-run / rehearsal / readiness gate

## 技術主線

### 前端

- React 18 + TypeScript
- Vite
- Wouter
- TanStack Query
- Tailwind CSS + Radix UI

### 後端

- Express + TypeScript
- Drizzle ORM
- express-session + connect-pg-simple
- Zod schema validation

### 資料層

- PostgreSQL
- `user_sessions` 由 session store 自動建立
- 備份檔輸出於 `backups/`

## 快速開始

### 需求

- Node.js 20.x
- PostgreSQL
- 可用的 `DATABASE_URL`

### 1. 安裝

```bash
npm install
```

### 2. 設定環境變數

最少需要：

```env
NODE_ENV=development
PORT=5000
DATABASE_URL=postgresql://app_user:password@localhost:5432/employee_salary_db
SESSION_SECRET=replace-with-at-least-32-characters-for-production
DEFAULT_ADMIN_PIN=123456
```

常用但非必填：

```env
SESSION_TIMEOUT=60
TRUST_PROXY=true
SESSION_SECURE=true
SESSION_SAME_SITE=lax
ALLOWED_ORIGINS=https://your-frontend.example.com
USE_AES_ENCRYPTION=false
ENCRYPTION_KEY=replace-with-at-least-32-characters
ENCRYPTION_SALT=replace-with-explicit-salt
LOG_LEVEL=info
```

說明：

- `DATABASE_URL` 必須是 PostgreSQL 連線字串
- production 必須提供 `SESSION_SECRET`
- 只有在 `USE_AES_ENCRYPTION=true` 時才強制要求 `ENCRYPTION_KEY`
- `DEFAULT_ADMIN_PIN` 只用於首次建立 settings；若未提供，系統會產生隨機 PIN 並在 log 提示立即更改

若要直接產生可貼到 Zeabur Variables 或 `.env` 的 secrets：

```bash
npm run secrets:generate
```

### 3. 推送 schema

```bash
npm run db:push
```

### 4. 開發模式

```bash
npm run dev
```

預設網址：`http://localhost:5000`

### Zeabur / Docker 部署

- 正式部署主線改為 `Dockerfile`；Zeabur 偵測到 `Dockerfile` 後會直接走 Docker build，不再依賴 Node.js 自動偵測 builder。
- Zeabur 上保留 `NODE_ENV=production`、`TRUST_PROXY=true`、`SESSION_SECURE=true`；不要手動設定 `PORT`，也不要保留未使用的 `PASSWORD` 變數。
- 若 PostgreSQL 由 Supabase 提供，後端優先使用 session mode `:5432`；若使用 transaction pooler `:6543`，本 repo 的 runtime 與 AES/維運腳本會自動停用 prepared statements。
- 第一次正式上線前，請先對目標資料庫執行一次 `npm run db:push`；不要把 schema 初始化綁在每次容器啟動。

## 驗證命令

### 開發基線

```bash
npm run check
npm test
npm run test:smoke
npm run build
```

### 真實資料庫驗證

```bash
npm run test:real-db
```

### 維運驗證

```bash
npm run verify:ops
npm run restore:rehearse
```

## AES migration 指令

這些指令都需要 `ENCRYPTION_KEY`：

```bash
npm run aes:inspect
ENCRYPTION_KEY=... npm run aes:report
ENCRYPTION_KEY=... npm run aes:snapshot
ENCRYPTION_KEY=... npm run aes:rehearse
ENCRYPTION_KEY=... npm run aes:status
ENCRYPTION_KEY=... npm run aes:ready
ENCRYPTION_KEY=... npm run aes:migrate
ENCRYPTION_KEY=... npm run aes:rollback
```

若還沒生成 `SESSION_SECRET` / `ENCRYPTION_KEY` / `ENCRYPTION_SALT`：

```bash
npm run secrets:generate
```

正式 execute 前請先完成：

- `aes:report`
- `aes:snapshot`
- `aes:rehearse`
- `aes:ready`
- `restore:rehearse`

## 部署前最低檢查

```bash
npm run check
npm test
npm run test:smoke
npm run test:real-db
npm run build
npm run verify:ops
```

再依序確認：

- `GET /api/health`
- `GET /ready`
- `GET /live`
- 管理員登入 / 登出 / PIN 更新
- `/history`、`/settings`、`/employees` 直接開啟不會落錯頁
- 條碼掃描打卡正常

完整清單請看 `RELEASE_CHECKLIST.md`。

## 文件索引

- `docs/INSTALLATION.md`：安裝與部署步驟
- `docs/CONFIGURATION.md`：環境變數與安全設定
- `docs/DATABASE_SETUP.md`：PostgreSQL 準備與驗證
- `docs/OPERATIONS_RUNBOOK.md`：probe、backup、restore、維運
- `docs/AES_MIGRATION_RUNBOOK.md`：AES 遷移流程
- `docs/TROUBLESHOOTING.md`：故障排除
- `docs/SUPPORT.md`：交接與支援資訊

## 目前已知限制

- AES readiness 已完成，但正式 `aes:migrate` 尚未執行
- 前端仍有部分歷史 debug log 尚待再收斂
- 部分歷史文件已重寫中，請以本 README 與 `docs/PRODUCTION_EXECUTION_QUEUE.md` 為準
