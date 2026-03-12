# Operations Runbook

## 1. 目的

提供 production 部署前後的最小維運檢查與回滾準則，避免健康檢查、驗證命令與備份檢查散落在不同文件。

## 2. 上線前固定檢查

在部署前至少依序執行：

```bash
npm run verify:core
npm run test:smoke
npm run restore:check
npm run verify:ops
```

- `verify:core`：全量測試、型別檢查與 build
- `test:smoke`：高風險 API 流程級驗證
- `restore:check`：解析最新備份檔，確認備份結構可讀
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
- 它會驗證 JSON 可解析，並列出 `employees`、`holidays`、`salaryRecords`、`temporaryAttendance` 的數量
- 它不是正式 restore drill 的替代品；正式資料遷移前仍需執行一次完整 restore 演練
