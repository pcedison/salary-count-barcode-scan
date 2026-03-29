# Operations Runbook

## 1. 目的

提供 production 部署前後的最小維運檢查與回滾準則，避免健康檢查、驗證命令與備份檢查散落在不同文件。

## 2. 上線前固定檢查

在部署前至少依序執行：

```bash
npm run verify:core
npm run test:smoke
npm run restore:check
npm run restore:rehearse
npm run verify:ops
```

- `verify:core`：全量測試、型別檢查與 build
- `test:smoke`：高風險 API 流程級驗證
- `restore:check`：檢查最新備份的 restore readiness，輸出 backup/live counts、restore order、warnings/errors
- `restore:rehearse`：實際跑完整 restore path，並在 transaction 結尾自動 rollback
- `verify:ops`：以 production gate 角度重跑 `verify:core` 並執行 `restore:check`

## 3. 健康檢查端點

- `GET /api/health`
  - 用途：綜合檢查 database 與 memory
  - `200`：`healthy`
  - `503`：`degraded`
- `GET /ready`
  - 用途：部署平台 readiness probe
  - `200`：database 可用
  - `503`：database 不可用，不應接流量
- `GET /live`
  - 用途：process liveness probe
  - `200`：程序存活

三個端點都會回傳 `Cache-Control: no-store`，避免 probe 被快取。

## 4. 生產環境必要設定

- `SESSION_SECRET` 必須至少 32 字元
- `SESSION_SAME_SITE=none` 時，必須同時設定 `SESSION_SECURE=true`
- `USE_AES_ENCRYPTION=true` 時，必須同時設定至少 32 字元的 `ENCRYPTION_KEY`
- `DATABASE_URL` 必須是可連線的 PostgreSQL 連線字串

## 5. 回滾基線

- `cp5c-routes-core-complete`：核心路由模組化完成
- `cp5d-session-only-admin-auth`：管理員授權切到 session-only
- `cp5e-identity-read-compat`：`plaintext + Caesar + AES` 讀取相容完成
- `cp5f-storage-write-compat`：feature-flagged 身分證寫入相容完成
- `cp5g-ops-probes`：健康檢查與 ops 驗證基線

若本輪變更僅涉及程式碼，優先直接切回前一個 checkpoint。若未來進入 AES 正式遷移，則必須先 restore 對應資料快照，再回切 code checkpoint。

## 6. restore-check 的定位

- 目前 `restore:check` 會讀取 `backups/` 下最新的 `.json` 備份
- 它會驗證：
  - 備份檔 JSON 結構是否可解析
  - `employees` / `holidays` / `pendingBindings` / `salaryRecords` / `temporaryAttendance` 是否為可 restore 的資料形態
  - `holidays.employeeId`、`pendingBindings.employeeId` 是否引用存在的員工 ID
  - 最新備份與 live database 的計數摘要
  - 目前 restore 實作採用的 delete / insert 順序
- 它不是正式 restore drill 的替代品；正式資料遷移前仍需執行一次完整 restore 演練

## 6.1 非破壞式 rehearsal

在 production window 前，至少執行一次：

```bash
npm run restore:rehearse
ENCRYPTION_KEY=... npm run aes:snapshot
ENCRYPTION_KEY=... npm run aes:rehearse
ENCRYPTION_KEY=... npm run aes:ready
```

- `restore:rehearse` 會讀取最新 backup，實際跑完整 restore path，然後在 transaction 結尾回滾
- `aes:snapshot` 會建立遷移前快照，不修改 DB
- `aes:rehearse` 會實際更新候選員工為 AES、驗證、再還原，最後再用 transaction rollback 保證不留變更
- `aes:ready` 會重掃 live DB，並比對最新 dry-run / snapshot / rehearsal / restore rehearsal 證據
- AES 正式 execute / rollback / post-check 細節請參考 `docs/AES_MIGRATION_RUNBOOK.md`

## 7. 手動 restore 標準流程

1. 先執行：

```bash
npm run verify:ops
```

2. 在管理員 dashboard 建立一份新的 manual backup，作為 restore 前快照。
3. 確認要恢復的備份 ID 與類型（`daily` / `weekly` / `monthly` / `manual`）。
4. 執行 restore 前，記錄：
   - operator
   - restore source backup ID
   - pre-restore backup ID
   - 執行時間
5. 從管理員 dashboard 執行 restore。
6. restore 完成後立即檢查：

```bash
npm run restore:check
```

7. 追加驗證：
   - `GET /api/health`
   - `GET /ready`
   - 主要頁面是否可載入
   - 員工數、薪資紀錄數、設定是否合理
8. 若 restore 後異常，優先用第 2 步建立的 manual backup 回復，再回頭分析失敗原因。

## 8. restore runtime 保證

- `restoreFromBackup()` 會先做備份結構與 FK readiness 檢查
- restore 會在 transaction 內執行
- 刪除順序固定為：
  - `temporary_attendance`
  - `salary_records`
  - `holidays`
  - `pending_bindings`
  - `settings`
  - `employees`
- 寫回順序固定為：
  - `employees`
  - `settings`
  - `pending_bindings`
  - `holidays`
  - `salary_records`
  - `temporary_attendance`
- restore 完成後會重設 serial sequence，避免後續新寫入撞主鍵
- restore 前會將 backup 內的 timestamp 欄位正規化為 restore-ready 型別
