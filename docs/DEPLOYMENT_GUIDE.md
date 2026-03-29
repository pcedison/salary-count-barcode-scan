# 正式上線部屬與測試指南

> 適用版本：V3（含 AES 加密 + LINE 打卡功能）
> 部屬目標平台：Zeabur（Node.js 自動偵測）

---

## 前置條件確認

在開始部屬前，請確認下列項目已就緒：

| 項目 | 狀態確認方式 |
|------|-------------|
| Supabase 資料庫已建立 | 登入 Supabase 控制台，確認 project 存在 |
| `DATABASE_URL` 已取得 | Supabase → Settings → Database → Connection string |
| LINE Login Channel 已建立 | LINE Developers Console → 你的 Provider → LINE Login Channel |
| LINE Messaging API Channel 已建立 | LINE Developers Console → 你的 Provider → Messaging API Channel |
| GitHub repo 已存在 | `git remote -v` 確認 remote URL |
| 本機 `.env` 含有 AES 相關變數 | 確認 `ENCRYPTION_KEY`、`ENCRYPTION_SALT`、`USE_AES_ENCRYPTION=true` |

---

## Step 1 — 推送程式碼到 GitHub

### 1.1 確認程式碼狀態

```bash
# 確認目前分支
git status
git branch
```

### 1.2 建立 commit 並推送

```bash
# 加入所有變更（或指定特定檔案）
git add -A

# 建立 commit
git commit -m "Add LINE check-in feature and production hardening"

# 推送至 GitHub
# 若要推送至 main 分支
git push origin main

# 若目前在 integration 分支，先 merge 再推送
git checkout main
git merge integration/v3-v10-hardening
git push origin main
```

### 1.3 驗證推送成功

前往 GitHub repo 頁面，確認最新 commit 已出現。

---

## Step 2 — 在 Zeabur 建立專案並設定環境變數

### 2.1 建立 Zeabur 專案

1. 登入 [Zeabur Dashboard](https://dash.zeabur.com)
2. 點擊「New Project」
3. 選擇「Deploy from GitHub」
4. 授權並選擇你的 GitHub repo
5. Zeabur 會自動偵測 Node.js 專案，並使用 `npm run build` + `npm start`

### 2.2 第一輪環境變數（不含 LINE）

在 Zeabur Service → **Variables** 面板，先設定以下 9 個變數：

| 變數名稱 | 值來源 | 範例值 |
|---------|--------|--------|
| `DATABASE_URL` | Supabase Connection String | `postgres://user:pass@host:5432/db` |
| `NODE_ENV` | 固定填入 | `production` |
| `SESSION_SECRET` | 本機 `.env` 或重新產生 | 至少 32 字元隨機字串 |
| `DEFAULT_ADMIN_PIN` | 本機 `.env` | 4~8 位數字或英數字 |
| `TRUST_PROXY` | 固定填入 | `true` |
| `SESSION_SECURE` | 固定填入（需 HTTPS） | `true` |
| `USE_AES_ENCRYPTION` | 固定填入 | `true` |
| `ENCRYPTION_KEY` | 本機 `.env` | 至少 32 字元隨機字串 |
| `ENCRYPTION_SALT` | 本機 `.env` | 任意字串 |

> **注意**：`SESSION_SECRET`、`ENCRYPTION_KEY` 若尚未產生，可在本機執行：
> ```bash
> npm run secrets:generate
> ```

### 2.3 等待第一次部屬完成，取得網域

設好上述 9 個變數後，Zeabur 會自動觸發部屬。

等待部屬完成（約 2~3 分鐘），取得你的網域，例如：
```
https://your-app-name.zeabur.app
```

### 2.4 更新 LINE Developers Console Callback URL

前往 [LINE Developers Console](https://developers.line.biz/console/)：

1. 選擇你的 Provider → **LINE Login Channel**
2. 進入「LINE Login」分頁
3. 找到「Callback URL」欄位
4. 填入：
   ```
   https://your-app-name.zeabur.app/api/line/callback
   ```
5. 儲存

### 2.5 第二輪環境變數（填入 5 個 LINE 變數）

回到 Zeabur Variables 面板，新增以下 5 個變數：

| 變數名稱 | 取得方式 |
|---------|---------|
| `LINE_LOGIN_CHANNEL_ID` | LINE Login Channel → Basic settings → Channel ID |
| `LINE_LOGIN_CHANNEL_SECRET` | LINE Login Channel → Basic settings → Channel secret |
| `LINE_LOGIN_CALLBACK_URL` | 填入步驟 2.4 設定的完整 URL |
| `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` | Messaging API Channel → Messaging API → Channel access token |
| `LINE_MESSAGING_CHANNEL_SECRET` | Messaging API Channel → Basic settings → Channel secret |

填完後 Zeabur 會再次自動觸發 redeploy（約 1~2 分鐘）。

---

## Step 3 — 執行 AES 遷移（從本機對遠端 DB 執行一次）

> 這個步驟將現有員工的明文身分證字號加密為 AES-256 密文，只需執行一次。

### 3.1 前置確認

確認本機 `.env` 含有以下變數（連接遠端 Supabase）：

```
DATABASE_URL=postgres://...（Supabase 的連線字串）
USE_AES_ENCRYPTION=true
ENCRYPTION_KEY=...（至少 32 字元）
ENCRYPTION_SALT=...
```

### 3.2 執行遷移前的檢查

```bash
# 查看目前加密狀態
npm run aes:inspect

# 確認遷移可行性報告
npm run aes:report

# 建立備份快照（強烈建議）
npm run aes:snapshot

# 模擬執行（不實際寫入 DB）
npm run aes:rehearse

# 確認就緒狀態
npm run aes:ready
```

### 3.3 執行正式遷移

```bash
# 替換 your-name 為你的操作者名稱（供日誌記錄）
AES_MIGRATION_OPERATOR=your-name npm run aes:migrate -- --allow-remote
```

預期輸出：
```
✅ AES migration completed
   Migrated: N employees
   Already encrypted: 0
   Errors: 0
```

### 3.4 驗證遷移結果

```bash
# 再次確認狀態
npm run aes:inspect
npm run aes:status
```

> **回滾指令**（若遷移出錯需還原）：
> ```bash
> npm run aes:rollback
> ```

---

## Step 4 — 部屬後功能驗證

### 4.1 基礎健康檢查

```bash
# 替換為你的實際網域
BASE_URL="https://your-app-name.zeabur.app"

# Health probe
curl "$BASE_URL/api/health"
# 預期：{ "status": "ok", "db": "connected", ... }

# Readiness probe
curl "$BASE_URL/ready"
# 預期：{ "status": "ready" }

# Liveness probe
curl "$BASE_URL/live"
# 預期：{ "status": "alive", "uptime": ... }
```

### 4.2 LINE 功能確認

```bash
# 確認 LINE 設定已啟用
curl "$BASE_URL/api/line/config"
# 預期：{ "configured": true }
```

### 4.3 瀏覽器手動驗證（逐項勾選）

**主系統功能：**
- [ ] `https://your-app.zeabur.app/` → 出勤頁面正常載入
- [ ] 管理員登入（右上角 PIN 輸入）→ 成功進入管理介面
- [ ] 員工列表頁 → 正常顯示員工資料
- [ ] 薪資計算頁 → 可查詢歷史記錄
- [ ] 系統設定頁 → 可修改基本設定

**LINE 打卡功能：**
- [ ] `https://your-app.zeabur.app/clock-in` → 顯示「LINE 登入」按鈕
- [ ] `https://your-app.zeabur.app/qrcode`（管理員登入後）→ 顯示 QR Code
- [ ] 點擊 LINE 登入按鈕 → 跳轉 LINE OAuth 頁面（不報錯）
- [ ] 員工管理頁 → 管理員可看到「LINE 綁定審核」區塊

### 4.4 完整 LINE 打卡流程測試（需真實 LINE 帳號）

1. 管理員進入 `/qrcode`，點擊「下載 QR Code」或用手機掃描
2. 用員工的 LINE App 掃描 QR Code → 跳轉打卡頁面
3. 點擊「LINE 登入」→ LINE OAuth 授權 → 回到打卡頁
4. 輸入身分證字號 → 送出綁定申請
5. 管理員進入員工管理頁 → 看到待審核項目 → 點擊「核准」
6. 員工回到打卡頁 → 狀態更新為「打卡」→ 點擊打卡
7. 確認 LINE Bot 發送打卡通知訊息
8. 管理員出勤頁確認打卡記錄出現

---

## 常見問題排解

### LINE 登入後 Callback 失敗
- 確認 `LINE_LOGIN_CALLBACK_URL` 與 LINE Developers Console 設定的 Callback URL 完全一致（包含 https://）
- 確認 Zeabur 網域有正確的 HTTPS 憑證

### 打卡後沒有收到 LINE 通知
- 確認 `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN` 正確
- 確認員工 LINE 帳號有加入 Messaging API Channel 的 Bot 為好友

### 員工身分證字號無法匹配
- 若 AES 遷移尚未執行，系統仍可用明文比對
- 若遷移完成後無法匹配，確認 `ENCRYPTION_KEY` 與本機遷移時使用的相同

### TypeScript 編譯錯誤
```bash
npm run check
```

### 測試失敗
```bash
npm test
npm run test:smoke
```

---

## 回滾方案

若部屬後發現嚴重問題：

### Zeabur 回滾
1. Zeabur Dashboard → Deployments
2. 選擇上一個成功的部屬 → 點擊「Redeploy」

### AES 遷移回滾（僅限遷移完成當下）
```bash
npm run aes:rollback
```

### 資料庫備份還原
```bash
npm run restore:check     # 確認還原可行
npm run restore:rehearse  # 模擬還原
```

---

## 日常維運指令

```bash
# 確認健康狀態（含備份驗證）
npm run verify:ops

# 執行所有測試
npm run verify:core

# 查看 AES 加密狀態
npm run aes:status

# 產生新的安全隨機金鑰
npm run secrets:generate
```
