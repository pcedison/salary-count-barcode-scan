# 正式上線部署與測試指南

> 適用版本：V3（含 AES 加密 + LINE 打卡功能）
> 部署目標平台：Zeabur（Dockerfile 部署）

---

## 前置條件確認

在開始部署前，請確認下列項目已就緒：

| 項目 | 狀態確認方式 |
|------|-------------|
| Supabase / PostgreSQL 資料庫已建立 | 可登入資料庫控制台，並取得 `DATABASE_URL` |
| GitHub repo 已存在 | `git remote -v` 確認 remote URL |
| 本機可執行 `npm ci` | `node -v` 應為 `20.x`，`npm -v` 應為 `10.x` |
| 需要 AES 時已準備加密變數 | 確認 `ENCRYPTION_KEY`、`ENCRYPTION_SALT`、`USE_AES_ENCRYPTION=true` |
| 需要 LINE 打卡時已建立 Channel | LINE Developers Console 可取得 5 個必要變數 |

---

## Step 1 — 推送程式碼到 GitHub

```bash
git status
git add -A
git commit -m "Stabilize Zeabur deployment"
git push origin main
```

確認 GitHub 上已包含以下部署檔案：

- `Dockerfile`
- `.dockerignore`

---

## Step 2 — 在 Zeabur 建立專案並設定環境變數

### 2.1 建立 Zeabur 專案

1. 登入 [Zeabur Dashboard](https://dash.zeabur.com)
2. 點擊「New Project」
3. 選擇「Deploy from GitHub」
4. 選擇這個 repo
5. Zeabur 偵測到根目錄 `Dockerfile` 後，會直接使用 Docker 方式建置與部署

### 2.2 必填環境變數

在 Zeabur Service → **Variables** 面板設定以下變數：

| 變數名稱 | 說明 |
|---------|------|
| `DATABASE_URL` | PostgreSQL 連線字串 |
| `NODE_ENV` | 固定 `production` |
| `SESSION_SECRET` | 至少 32 字元 |
| `DEFAULT_ADMIN_PIN` | 首次初始化管理員 PIN |
| `TRUST_PROXY` | 固定 `true` |
| `SESSION_SECURE` | 固定 `true` |
| `ALLOWED_ORIGINS` | 例如 `https://your-app.zeabur.app` |
| `USE_AES_ENCRYPTION` | `true` 或 `false` |
| `ENCRYPTION_KEY` | 使用 AES 時必填 |
| `ENCRYPTION_SALT` | 使用 AES 時建議固定設定 |

### 2.3 Zeabur 變數注意事項

- 不要手動設定 `PORT`；Zeabur 會自動注入。
- 不要保留 `PASSWORD`；本系統不讀取這個變數。
- 若尚未產生 secrets，可先在本機執行：

```bash
npm run secrets:generate
```

### 2.4 Supabase 連線字串選擇

- 後端長連線優先使用 session mode `:5432`
- 若目前只有 transaction pooler `:6543` 可用，本 repo 已自動對 runtime 與 AES/維運腳本停用 prepared statements

範例：

```env
# Preferred: session mode
DATABASE_URL=postgresql://postgres:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres

# Supported fallback: transaction pooler
DATABASE_URL=postgresql://postgres:[PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres
```

### 2.5 LINE 打卡環境變數

若需要 LINE 打卡，再額外設定以下 5 個變數：

- `LINE_LOGIN_CHANNEL_ID`
- `LINE_LOGIN_CHANNEL_SECRET`
- `LINE_LOGIN_CALLBACK_URL`
- `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`
- `LINE_MESSAGING_CHANNEL_SECRET`

只要設定其中任一個，其餘 4 個也必須同時存在。

---

## Step 3 — 第一次正式上線前先初始化 schema

這個 repo 不會在 container 啟動時自動執行 `db:push`，請在第一次正式上線前從本機或 CI 對目標資料庫執行一次：

```bash
npm ci
npm run db:push
```

執行時請確保本機 `.env` 或 CI secrets 使用的 `DATABASE_URL` 指向 Zeabur 上同一個正式資料庫。

---

## Step 4 — 觸發 Zeabur 部署

完成 Variables 後，Zeabur 會自動觸發部署。

部署成功後請確認：

- Zeabur 服務畫面顯示 Docker build，而不是 Node.js 自動 builder
- Build log 已完成 `npm ci` 與 `npm run build`
- Service 成功進入 running 狀態

---

## Step 5 — 執行 AES 遷移（只有在既有資料需要升級時）

若你需要把既有資料從 plaintext / Caesar 升級為 AES，請先完成以下檢查：

```bash
npm run aes:inspect
npm run aes:report
npm run aes:snapshot
npm run aes:rehearse
npm run aes:ready
```

正式執行：

```bash
AES_MIGRATION_OPERATOR=your-name npm run aes:migrate -- --allow-remote
```

若需回滾：

```bash
npm run aes:rollback -- --allow-remote
```

---

## Step 6 — 部署後功能驗證

### 6.1 健康檢查

```bash
BASE_URL="https://your-app-name.zeabur.app"

curl "$BASE_URL/api/health"
curl "$BASE_URL/ready"
curl "$BASE_URL/live"
```

### 6.2 瀏覽器手動驗證

- `/` 可正常載入
- 管理員登入 / 登出正常
- `/employees`、`/history`、`/settings` 可直接開啟
- 條碼掃描打卡正常
- 若啟用 LINE：`/clock-in` 與 `/qrcode` 正常

### 6.3 資料庫與 session 驗證

- 登入後重新整理頁面，管理員 session 仍維持有效
- 資料庫至少完成一次讀寫流程，不出現 transaction pooler / prepared statement 錯誤

---

## 常見問題排解

### Zeabur build 一直失敗

- 確認 repo 根目錄已有 `Dockerfile`
- 確認 Zeabur log 走的是 Docker build，而不是舊的 Node.js 自動 builder
- 確認沒有手動設定 `PORT`
- 重新部署前先確認本機 `npm ci && npm run build` 可通過

### 啟動後立即 crash

- 檢查 `DATABASE_URL` 是否有效
- 檢查 `SESSION_SECRET` 是否至少 32 字元
- 若 `USE_AES_ENCRYPTION=true`，確認 `ENCRYPTION_KEY` 已設定
- 若有任一 LINE 變數，確認 5 個 LINE 變數都存在

### Supabase 連線正常但查詢失敗

- 優先改用 session mode `:5432`
- 若維持 `:6543`，請重新部署最新程式碼，讓 prepared statements 自動停用

---

## 日常維運指令

```bash
npm run check
npm test
npm run build
npm run verify:ops
npm run restore:rehearse
npm run aes:status
```
