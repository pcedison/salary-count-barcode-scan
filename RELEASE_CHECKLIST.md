# Release Checklist

## 部署目標

Zeabur 或 AWS（自行管理），資料庫為外部 PostgreSQL。
目前產品主線為 `PostgreSQL-only`；若使用 Supabase，定位也是 PostgreSQL provider，而不是雙資料庫切換模式。
伺服器 port 從 `process.env.PORT` 讀取（預設 5000）。

### Zeabur 部署

1. 連結 GitHub repo 或上傳程式碼
2. 設定環境變數：`DATABASE_URL`、`SESSION_SECRET`、`DEFAULT_ADMIN_PIN`
3. Zeabur 自動偵測 Node.js → 執行 `npm run build` + `npm start`

### AWS 部署（EC2 / ECS / App Runner）

1. `npm run build` 產生 `dist/` 目錄
2. `npm start` 啟動（需設定 `PORT`、`DATABASE_URL`、`SESSION_SECRET`）
3. 建議使用 `NODE_ENV=production`

## Pre-deploy

- [ ] `npm run check` — TypeScript passes with zero errors
- [ ] `npm test` — All unit/integration tests pass (92 tests, 25 files)
- [ ] `npm run test:smoke` — High-risk route integrations pass (27 tests)
- [ ] `npm run test:real-db` — PostgreSQL 即時連線測試全部通過（40 tests）
- [ ] `npm run build` — Vite + esbuild build succeeds
- [ ] `npm run verify:ops` — verify core + restore readiness check passes
- [ ] `npm run restore:rehearse` — non-destructive restore rehearsal passes
- [ ] Verify code-splitting: `dist/public/assets/` contains separate page chunks
- [ ] `.env` contains valid `DATABASE_URL` pointing to PostgreSQL
- [ ] `.env` does NOT contain hardcoded secrets in version control
- [ ] `DEFAULT_ADMIN_PIN` is set in environment (or will be auto-generated)

## Security

- [ ] No `@ts-nocheck` directives remain in server code
- [ ] Admin PIN is stored as PBKDF2 hash (run `npm run test:real-db` to verify)
- [ ] All admin routes require `requireAdmin()` middleware
- [ ] Super-admin routes require `requireAdmin(PermissionLevel.SUPER)`
- [ ] No active Supabase runtime flow in UI; disabled compatibility endpoints remain server-side only
- [ ] `SESSION_SECRET` is set in production environment

## PostgreSQL 即時連線測試（npm run test:real-db）

所有測試直接連線至實際 PostgreSQL，
非 mock，結果需全部 PASS 方可部署。

| # | 測試類別 | 測試項目 | 預期結果 |
|---|---------|---------|---------|
| 1 | PostgreSQL 連線 | `SELECT 1` 直連 connection pool | ✅ 回傳正常 |
| 2 | PostgreSQL 連線 | `GET /api/health` — database check 回傳 pass | ✅ `checks.database.status === 'pass'` |
| 3 | PostgreSQL 連線 | `GET /ready` — readiness probe 包含 DB 檢查 | ✅ `checks.database.status === 'pass'` |
| 4 | PostgreSQL 連線 | `GET /live` — liveness probe | ✅ `alive === true` |
| 5 | 員工 CRUD | 建立員工 → PostgreSQL 寫入成功 | ✅ id > 0 |
| 6 | 員工 CRUD | 以 id 查詢 → PostgreSQL 讀取成功 | ✅ 姓名一致 |
| 7 | 員工 CRUD | 以身份證字號查詢 → PostgreSQL 讀取成功 | ✅ id 一致 |
| 8 | 員工 CRUD | 列出全部員工 | ✅ 包含測試員工 |
| 9 | 員工 CRUD | 更新員工 → PostgreSQL 寫入成功 | ✅ 欄位已更新 |
| 10 | 員工 CRUD | 刪除員工 → PostgreSQL 刪除成功 | ✅ 查無此員工 |
| 11 | 條碼掃描打卡 | 缺少 idNumber → 400 | ✅ 拒絕請求 |
| 12 | 條碼掃描打卡 | 不存在的 idNumber → 404 | ✅ `EMPLOYEE_NOT_FOUND` |
| 13 | 條碼掃描打卡 | 第一次掃描 → PostgreSQL 寫入上班打卡 | ✅ `action === 'clock-in'` |
| 14 | 條碼掃描打卡 | 第二次掃描 → PostgreSQL 更新下班打卡 | ✅ `action === 'clock-out'` |
| 15 | 條碼掃描打卡 | `/api/last-scan-result` 回傳最近掃描 | ✅ 結構正確 |
| 16 | 條碼掃描打卡 | 第三次掃描 → PostgreSQL 新增新上班打卡 | ✅ `action === 'clock-in'` |
| 17 | 條碼掃描打卡 | 驗證考勤記錄已持久化於 PostgreSQL | ✅ records.length > 0 |
| 18 | Raspberry Pi | Pi 掃描 → PostgreSQL 寫入上班 | ✅ `action === 'clock-in'` |
| 19 | Raspberry Pi | Pi 二次掃描 → PostgreSQL 更新下班 | ✅ `action === 'clock-out'` |
| 20 | Raspberry Pi | 缺少 ID → 400 `MISSING_ID` | ✅ 拒絕請求 |
| 21 | 考勤生命週期 | 建立上班記錄 → PostgreSQL 寫入 | ✅ clockIn === '08:30' |
| 22 | 考勤生命週期 | 更新下班時間 → PostgreSQL 更新 | ✅ clockOut === '17:30' |
| 23 | 考勤生命週期 | 以員工+日期查詢 → PostgreSQL 讀取 | ✅ 記錄吻合 |
| 24 | 考勤生命週期 | 出現在全部考勤列表 | ✅ 列表非空 |
| 25 | 考勤生命週期 | 刪除考勤記錄 → PostgreSQL 刪除 | ✅ 查無此記錄 |
| 26 | 假日 CRUD | 建立假日 → PostgreSQL 寫入 | ✅ id > 0 |
| 27 | 假日 CRUD | 刪除假日 → PostgreSQL 刪除 | ✅ 查無此假日 |
| 28 | 系統設定 | 讀取設定 → PostgreSQL 讀取 | ✅ adminPin 長度 > 100（PBKDF2 雜湊）|
| 29 | 系統設定 | `GET /api/settings` 不暴露 adminPin | ✅ `adminPin === undefined` |
| 30 | 薪資記錄 | 列出薪資記錄 → PostgreSQL 讀取 | ✅ 回傳陣列 |
| 31 | 薪資記錄 | 按年月查詢薪資記錄 | ✅ 回傳正確型別 |

另含未逐項展開於上表的 AES / rehearsal coverage：
- AES 寫入、plaintext / scan token / ciphertext lookup
- AES admin route / scan route regression
- restore rehearsal（full restore path + rollback）
- AES rehearsal（migrate + verify + rollback）
- AES snapshot（pre-migration backup artifact）

**最近一次測試時間**：2026-03-15 01:24（40/40 PASS，耗時 26.16 秒）

### 執行方式

```bash
npm run test:real-db
```

此命令使用 `vitest.real-db.config.ts`，透過 `setupFiles` 載入 `.env` 中的 `DATABASE_URL`，
直接連線至 PostgreSQL 執行全部 40 項測試。測試資料使用 `__test_<timestamp>` 前綴，
結束後自動清理。

## Database

- [ ] `npm run db:push` — Schema is in sync with database
- [ ] Verify employee count: `SELECT count(*) FROM employees`
- [ ] Verify settings exist: `SELECT id, length(admin_pin) FROM settings`
- [ ] Admin PIN hash length > 100 chars (PBKDF2 format: `salt:hash`)

## Restore / Rollback

- [ ] `npm run restore:check` — latest backup passes readiness validation
- [ ] `npm run restore:rehearse` — latest backup can complete a full restore path and roll back cleanly
- [ ] Confirm `restore:check` output shows `backupCounts` and `liveCounts` are sensible
- [ ] Confirm `restoreOrder` matches current restore implementation:
  `temporary_attendance -> salary_records -> holidays -> pending_bindings -> settings -> employees` delete, then insert back in restore order
- [ ] Verify latest backup metadata shows `databaseType: postgres`
- [ ] Before any manual restore, create an additional manual backup from admin dashboard
- [ ] After any manual restore, re-run `npm run restore:check` and `GET /api/health`
- [ ] Record restore source backup ID, pre-restore backup ID, operator, timestamp, and post-restore verification result

## Post-deploy

- [ ] `GET /api/health` returns `{ status: "healthy" }`
- [ ] `GET /ready` returns `{ ready: true }`
- [ ] `GET /live` returns `{ alive: true }`
- [ ] Homepage loads and renders attendance tab
- [ ] Tab navigation works (all 5 tabs render correctly)
- [ ] Direct `/history`、`/settings`、`/employees` open the correct page instead of falling back to attendance
- [ ] Admin login with PIN succeeds
- [ ] Barcode scan page loads and accepts input
- [ ] Settings page displays current configuration (PIN not exposed)
- [ ] Employee list loads without errors

## AES Encryption Migration (when ready)

- [ ] Set `ENCRYPTION_KEY` env var (>= 32 characters)
- [ ] Run inspect: `npm run aes:inspect`
- [ ] Run dry-run report: `ENCRYPTION_KEY=... npm run aes:report`
- [ ] Run pre-migration snapshot: `ENCRYPTION_KEY=... npm run aes:snapshot`
- [ ] Run non-destructive rehearsal: `ENCRYPTION_KEY=... npm run aes:rehearse`
- [ ] Run readiness summary: `ENCRYPTION_KEY=... npm run aes:status`
- [ ] Run readiness gate: `ENCRYPTION_KEY=... npm run aes:ready`
- [ ] Verify report is written under `backups/aes-migration/reports/` and shows expected `plaintext / Caesar / AES / empty / flag mismatches`
- [ ] Verify dry-run output shows correct employee count and `round-trip: OK` for all migration candidates
- [ ] Verify `aes:ready` is green before `aes:migrate`
- [ ] Execute migration: `ENCRYPTION_KEY=... npm run aes:migrate`
- [ ] Verify post-migration state: `npm run aes:inspect`
- [ ] Verify rollback command is ready: `ENCRYPTION_KEY=... npm run aes:rollback`
- [ ] Test barcode scanning still works with encrypted IDs
- [ ] Capture operator evidence per `docs/AES_MIGRATION_RUNBOOK.md`

## NPM Scripts Reference

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start development server |
| `npm run build` | Production build (Vite + esbuild) |
| `npm start` | Start production server |
| `npm run check` | TypeScript type checking |
| `npm test` | Unit + mock integration tests |
| `npm run test:real-db` | Real database integration tests |
| `npm run test:smoke` | Route integration tests only |
| `npm run restore:rehearse` | Execute restore rehearsal and roll back |
| `npm run aes:inspect` | Inspect current employee identity storage formats |
| `npm run aes:report` | Generate AES migration dry-run report |
| `npm run aes:snapshot` | Create pre-migration backup snapshot |
| `npm run aes:rehearse` | Execute AES migration rehearsal and roll back |
| `npm run aes:status` | Summarize current AES migration readiness |
| `npm run aes:ready` | Enforce AES migration readiness gate |
| `npm run aes:migrate` | Execute AES migration |
| `npm run aes:rollback` | Roll back AES migration from backup |
| `npm run db:push` | Push schema to database |
