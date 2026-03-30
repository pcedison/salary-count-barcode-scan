# 配置指南

## 核心環境變數

| 變數 | 必填 | 說明 |
|---|---|---|
| `NODE_ENV` | 否 | `development` / `production` / `test` |
| `PORT` | 否 | 預設 `5000`；Zeabur 這類平台請改讀平台自動注入的 `PORT`，不要手動覆寫 |
| `DATABASE_URL` | 是 | PostgreSQL 連線字串 |
| `SESSION_SECRET` | production 必填 | 至少 32 字元 |
| `DEFAULT_ADMIN_PIN` | 建議 | 首次建立 settings 時使用；未提供則隨機產生 |
| `SESSION_TIMEOUT` | 否 | 管理員 session 分鐘數，預設 60 |
| `TRUST_PROXY` | 否 | 代理環境請設 `true` |
| `SESSION_SECURE` | 否 | `true` / `false`；production 預設視為 `true` |
| `SESSION_SAME_SITE` | 否 | `lax` / `strict` / `none` |
| `ALLOWED_ORIGINS` | 否 | 逗號分隔的 CORS allowlist |
| `LOG_LEVEL` | 否 | `debug` / `info` / `warn` / `error` |

## AES 相關環境變數

| 變數 | 必填條件 | 說明 |
|---|---|---|
| `USE_AES_ENCRYPTION` | 否 | 設 `true` 後新寫入走 AES |
| `ENCRYPTION_KEY` | `USE_AES_ENCRYPTION=true` 時必填 | 至少 32 字元 |
| `ENCRYPTION_SALT` | 建議 | 未設定時會退回預設 salt；正式 migration 前應明確配置 |

若要直接生成一組新的 `SESSION_SECRET` / `ENCRYPTION_KEY` / `ENCRYPTION_SALT`：

```bash
npm run secrets:generate
```

## LINE 打卡環境變數

以下 5 個變數屬於全有或全無；只要設定其中任一個，其他 4 個也必須同時設定：

- `LINE_LOGIN_CHANNEL_ID`
- `LINE_LOGIN_CHANNEL_SECRET`
- `LINE_LOGIN_CALLBACK_URL`
- `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`
- `LINE_MESSAGING_CHANNEL_SECRET`

## Session / Cookie 規則

- cookie 名稱：`employee_salary_admin.sid`
- 預設 timeout：`60` 分鐘
- 前端閒置自動登出與活躍 heartbeat 會沿用同一個 `SESSION_TIMEOUT`
- `SESSION_SAME_SITE=none` 必須搭配 `SESSION_SECURE=true`
- production 若未設定 `SESSION_SECRET`，啟動會直接失敗
- `TRUST_PROXY=true` 時 session middleware 會信任反向代理

## 建議配置範例

### 本機開發

```env
NODE_ENV=development
PORT=5000
DATABASE_URL=postgresql://app_user:password@localhost:5432/employee_salary_db
SESSION_SECRET=development-only-secret-at-least-32-characters
DEFAULT_ADMIN_PIN=123456
SESSION_TIMEOUT=60
SESSION_SAME_SITE=lax
LOG_LEVEL=debug
USE_AES_ENCRYPTION=false
```

### 一般生產環境

```env
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://app_user:password@db-host:5432/employee_salary_db
SESSION_SECRET=replace-with-at-least-32-characters
DEFAULT_ADMIN_PIN=replace-before-first-login
TRUST_PROXY=true
SESSION_SECURE=true
SESSION_SAME_SITE=lax
SESSION_TIMEOUT=60
ALLOWED_ORIGINS=https://your-app.example.com
LOG_LEVEL=info
USE_AES_ENCRYPTION=false
```

### 準備 AES migration

```env
USE_AES_ENCRYPTION=true
ENCRYPTION_KEY=replace-with-at-least-32-characters
ENCRYPTION_SALT=replace-with-explicit-salt
```

## Zeabur / Supabase 注意事項

- Zeabur 正式部署以 repo 根目錄的 `Dockerfile` 為主，不再依賴 Node.js 自動偵測 builder。
- Zeabur Variables 請保留 `NODE_ENV=production`、`TRUST_PROXY=true`、`SESSION_SECURE=true`。
- Zeabur 不要手動設定 `PORT`；平台會自動注入，手動值會覆蓋平台 special variable。
- `PASSWORD` 不是本系統使用的環境變數，請不要在 Zeabur 中保留。
- 若使用 Supabase，後端優先採用 session mode `:5432` 連線。
- 若使用 Supabase transaction pooler `:6543`，runtime 與 AES/維運腳本會自動停用 prepared statements 以維持相容性。

## 設定驗證

啟動時會自動做：

- `DATABASE_URL` 格式驗證
- production `SESSION_SECRET` 檢查
- `SESSION_SAME_SITE=none` / `SESSION_SECURE=true` 相依檢查
- `USE_AES_ENCRYPTION=true` / `ENCRYPTION_KEY` 相依檢查
- LINE 五個變數的一致性檢查

## 目前不再支援的配置

以下已不再是有效主線：

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- 前端資料庫切換
- runtime Supabase migration

若你的 PostgreSQL 由 Supabase 或 Neon 提供，只需要提供 `DATABASE_URL`。
