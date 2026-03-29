# 安裝與部署指南

## 1. 需求

- Node.js 18+
- PostgreSQL 14+ 或相容的 managed PostgreSQL
- 可寫入 `backups/` 目錄的檔案系統權限

備註：

- 專案已收斂為 PostgreSQL-only
- 若使用 Supabase 或 Neon，也只把它們視為 PostgreSQL provider，不再支援前端切換或 runtime migrate

## 2. 本機安裝

### 2.1 安裝依賴

```bash
npm install
```

### 2.2 建立 `.env`

最小開發範例：

```env
NODE_ENV=development
PORT=5000
DATABASE_URL=postgresql://app_user:password@localhost:5432/employee_salary_db
SESSION_SECRET=development-only-secret-at-least-32-characters
DEFAULT_ADMIN_PIN=123456
```

建議補上：

```env
SESSION_TIMEOUT=60
SESSION_SAME_SITE=lax
USE_AES_ENCRYPTION=false
LOG_LEVEL=debug
```

若要一次生成 production 用的 `SESSION_SECRET` / `ENCRYPTION_KEY` / `ENCRYPTION_SALT`：

```bash
npm run secrets:generate
```

### 2.3 推送 schema

```bash
npm run db:push
```

### 2.4 啟動開發模式

```bash
npm run dev
```

### 2.5 最小驗證

```bash
npm run check
npm test
npm run test:smoke
npm run build
```

## 3. PostgreSQL 準備

範例：

```sql
CREATE DATABASE employee_salary_db;
CREATE USER app_user WITH PASSWORD 'replace_me';
GRANT ALL PRIVILEGES ON DATABASE employee_salary_db TO app_user;
```

如果 schema push 權限不足，再補：

```sql
\c employee_salary_db
GRANT USAGE, CREATE ON SCHEMA public TO app_user;
ALTER SCHEMA public OWNER TO app_user;
```

## 4. 生產部署

### 4.1 必填環境變數

```env
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://app_user:password@host:5432/employee_salary_db
SESSION_SECRET=replace-with-at-least-32-characters
DEFAULT_ADMIN_PIN=replace-before-first-login
```

### 4.2 反向代理 / HTTPS 建議

若前面有 Nginx、Zeabur、AWS ALB、Cloudflare Tunnel 等代理：

```env
TRUST_PROXY=true
SESSION_SECURE=true
SESSION_SAME_SITE=lax
```

若要跨站 cookie：

```env
SESSION_SECURE=true
SESSION_SAME_SITE=none
```

注意：

- `SESSION_SAME_SITE=none` 必須搭配 `SESSION_SECURE=true`
- production 缺少 `SESSION_SECRET` 會直接啟動失敗

### 4.3 建置與啟動

```bash
npm run build
npm start
```

## 5. 上線前驗證

```bash
npm run check
npm test
npm run test:smoke
npm run test:real-db
npm run build
npm run verify:ops
```

另外建議：

```bash
npm run restore:rehearse
```

若準備執行 AES migration，再加：

```bash
ENCRYPTION_KEY=... npm run aes:ready
```

若尚未準備好 encryption secrets，可先執行：

```bash
npm run secrets:generate
```

## 6. 部署後驗證

```bash
curl http://localhost:5000/api/health
curl http://localhost:5000/ready
curl http://localhost:5000/live
```

預期：

- `/api/health` 回 `healthy`
- `/ready` 回 `ready: true`
- `/live` 回 `alive: true`

再人工驗證：

- `/history`、`/settings`、`/employees` 直接進入正確頁面
- 管理員登入、登出、PIN 更新
- 條碼掃描打卡
- 歷史薪資列印

## 7. AES migration 安裝前提

若準備切換 AES：

```env
USE_AES_ENCRYPTION=true
ENCRYPTION_KEY=replace-with-at-least-32-characters
ENCRYPTION_SALT=replace-with-explicit-salt
```

可用下面指令直接生成這三個值：

```bash
npm run secrets:generate
```

正式 execute 前必做：

- `ENCRYPTION_KEY=... npm run aes:report`
- `ENCRYPTION_KEY=... npm run aes:snapshot`
- `ENCRYPTION_KEY=... npm run aes:rehearse`
- `ENCRYPTION_KEY=... npm run aes:ready`

詳細步驟請看 `docs/AES_MIGRATION_RUNBOOK.md`。
