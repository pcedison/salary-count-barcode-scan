# 故障排除指南

## 1. 應用程式無法啟動

### `SESSION_SECRET` 錯誤

症狀：

- production 啟動直接失敗
- error 提示 `SESSION_SECRET`

處理：

```bash
export SESSION_SECRET=replace-with-at-least-32-characters
```

### `DATABASE_URL` 錯誤

症狀：

- 啟動時 zod 驗證失敗
- 或 health endpoint 顯示 database degraded

處理：

```bash
echo "$DATABASE_URL"
```

確認：

- 非空
- 以 `postgres://` 或 `postgresql://` 開頭

### `USE_AES_ENCRYPTION=true` 但缺少 `ENCRYPTION_KEY`

症狀：

- 啟動直接失敗

處理：

```bash
export ENCRYPTION_KEY=replace-with-at-least-32-characters
```

## 2. Cookie / 管理員登入問題

### 登入成功但後續 API 仍 401

先檢查：

- `TRUST_PROXY`
- `SESSION_SECURE`
- `SESSION_SAME_SITE`
- 瀏覽器是否接受 cookie

如果在 HTTPS 反向代理後面：

```env
TRUST_PROXY=true
SESSION_SECURE=true
SESSION_SAME_SITE=lax
```

若跨站 cookie：

```env
SESSION_SECURE=true
SESSION_SAME_SITE=none
```

注意：

- `SESSION_SAME_SITE=none` 沒有 `SESSION_SECURE=true` 會被啟動檢查拒絕

## 3. 健康檢查異常

### `/api/health` degraded

執行：

```bash
curl http://localhost:5000/api/health
curl http://localhost:5000/ready
curl http://localhost:5000/live
```

若 database check 失敗，再跑：

```bash
npm run test:real-db
```

## 4. restore / backup 問題

### 懷疑最新 backup 不可用

```bash
npm run restore:check
```

看這些欄位：

- `backupCounts`
- `liveCounts`
- `restoreOrder`
- `warnings`

### 需要驗證 restore 路徑

```bash
npm run restore:rehearse
```

這個指令會：

- 建立 rehearsal backup
- 跑完整 restore path
- 在 transaction 末端回滾

若這步失敗，不要執行正式 restore。

## 5. AES migration 問題

### readiness 不是綠燈

```bash
ENCRYPTION_KEY=... npm run aes:status
ENCRYPTION_KEY=... npm run aes:ready
```

常見原因：

- 缺少 `ENCRYPTION_KEY`
- `ENCRYPTION_SALT` 未設定
- dry-run / snapshot / rehearsal 證據不完整
- restore rehearsal 尚未完成

### 只想先看 live DB 格式分布

```bash
npm run aes:inspect
ENCRYPTION_KEY=... npm run aes:report
```

## 6. 前端路由或頁面異常

### 直接開 `/history`、`/settings`、`/employees` 落錯頁

這是回歸檢查項，不應再發生。若再次出現：

```bash
npm test
npm run test:smoke
npm run build
```

並確認：

- `client/src/App.tsx`
- `client/src/lib/appNavigation.ts`

## 7. 條碼掃描異常

### 掃描到不存在員工

先確認：

- 員工是否存在
- 員工是否 `active`
- 員工證號格式是否與目前存量資料一致

若正在做 AES 遷移前後驗證：

```bash
npm run aes:inspect
ENCRYPTION_KEY=... npm run aes:report
```

### 掃描 API 失敗

建議重跑：

```bash
npm run test:smoke
npm run test:real-db
```

## 8. 建置或型別失敗

```bash
npm run check
npm run build
```

如果是歷史檔或未使用元件造成，優先確認是否屬於 `W5-CODE-01` 清理範圍，而不是直接繞過型別檢查。

## 9. 回報問題時請附上

- 當下日期時間
- 執行命令
- 錯誤訊息全文
- `/api/health` 輸出
- `npm run verify:ops` 結果
- 若與資料有關，再附：
  - `npm run restore:check`
  - `ENCRYPTION_KEY=... npm run aes:status`
