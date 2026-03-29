# Claude Code Subagent Handoff

## 1. 目前基線

- Repo：`Xin-Zi-Ji-Suan-Sao-Ma-Qiang-V3`
- 主整合分支：`integration/v3-v10-hardening`
- 當前 HEAD：`24094f5`
- 已完成 checkpoint：
  - `cp5c-routes-core-complete` -> `9164818`
  - `cp5d-session-only-admin-auth` -> `86b1ad6`
  - `cp5e-identity-read-compat` -> `127c15e`
  - `cp5f-storage-write-compat` -> `563a486`
  - `cp5g-ops-probes` -> `a9a6c48`
  - `cp5h-identity-log-redaction` -> `24094f5`

## 2. 已驗證結果

2026-03-15 已實跑：

- `npm test` → `92/92 PASS`
- `npm run test:smoke` → `27/27 PASS`
- `npm run test:real-db` → `40/40 PASS`
- `npm run check` → PASS
- `npm run build` → PASS
- `npm run verify:ops` → PASS
- `npm run restore:rehearse` → PASS
- `npm run aes:inspect` → PASS
- `ENCRYPTION_KEY=*** npm run aes:report` → PASS
- `ENCRYPTION_KEY=*** npm run aes:snapshot` → PASS
- `ENCRYPTION_KEY=*** npm run aes:rehearse` → PASS
- `ENCRYPTION_KEY=*** npm run aes:status` → PASS
- `ENCRYPTION_KEY=*** npm run aes:ready` → PASS

## 3. 工程成熟度估算

- 核心結構重構：`93%`
- 安全主線：`85%`
- QA / smoke / integration：`95%`
- 維運與健康檢查：`93%`
- 敏感資料升級：`89%`
- 文件與 release：`82%`
- 整體 production-ready 估算：`97%`

## 4. 已確認完成

- `routes.ts` 已收斂為 route registration
- 管理員授權已從 localStorage 明文 PIN 切到 server-side session / cookie
- 敏感 API 已以 `requireAdmin()` 為主線保護
- 公開員工 API 不再暴露敏感 ID，管理員 API 才回傳 display ID / scan ID
- 員工身分證資料已具備 `plaintext + Caesar + AES` 相容讀寫基礎
- `/api/health`、`/ready`、`/live` 已導入
- `verify:ops`、`test:smoke`、`test:real-db` 已存在且可重跑
- 主要 runtime 路徑已不再依賴 `@ts-nocheck`
- 監控與自動備份啟動流程已改為 idempotent，不會重複建立 scheduler
- `restoreFromBackup()` 已改為 transaction-safe restore，會先做結構/FK readiness 驗證、使用安全刪除順序、直接寫回原始 table row，並重設 serial sequence
- `restore:check` 已改成輸出 backup/live counts、restore order、warnings/errors，且 script 結束會關閉 DB client
- `server/db-monitoring.test.ts` 已補 restore safety regression，避免加密員工 ID 被 restore 時二次加密
- `shared/schema.ts` 已補 `pending_bindings`，backup / restore / readiness counts 現在會一起納入，避免 `pending_bindings.employee_id -> employees.id` 在 restore 時卡死
- backup JSON 內的 timestamp 欄位現在會在 restore 前正規化為 restore-ready 型別，不再直接把字串餵給 Drizzle timestamp insert
- `server/scripts/restore-rehearsal.ts` 與 `rehearseRestoreFromBackup()` 已可實際演練 restore path 並在 transaction 結尾回滾
- `docs/OPERATIONS_RUNBOOK.md`、`RELEASE_CHECKLIST.md` 已補 restore / rollback 標準流程
- `server/storage.real-db.test.ts` 已新增 AES 真 DB 驗證：AES 寫入、plaintext / scan token / ciphertext lookup、admin employee routes、scan clock flow
- `server/routes/employees.routes.integration.test.ts`、`server/routes/scan.routes.integration.test.ts` 已新增 AES route-level regression
- `scripts/inspect-employees.mjs` 已能正確分類 `plaintext / Caesar / AES / empty`，admin PIN 也改為 PBKDF2 `salt:hash` 檢查
- `scripts/lib/aes-migration-audit.mjs` 已把 Caesar/AES 分類、明文還原、report sanitize 收斂成單一實作
- `scripts/migrate-to-aes.mjs` 已補 `aes:snapshot`、`aes:rehearse`，dry-run / snapshot / rehearsal / execute-plan report 都會寫入 `backups/aes-migration/reports/`
- `scripts/lib/aes-crypto.mjs`、`scripts/lib/aes-migration-readiness.mjs`、`scripts/aes-migration-status.mjs` 已補齊 AES readiness gate
- `server/scripts/aes-migration-audit.test.ts` 已覆蓋分類與脫敏報表輸出
- `server/scripts/aes-migration-readiness.test.ts` 已覆蓋 artifact 選取與 readiness gate 綠燈/紅燈條件
- `server/rehearsal.real-db.test.ts` 已覆蓋 restore rehearsal、AES rehearsal、AES snapshot、AES readiness gate 真 DB 路徑
- `vitest.real-db.config.ts` 已改為單 worker / 單檔序列化，避免多個 real-db test file 併發污染同一個 PostgreSQL
- 最新 readiness 結果顯示 live DB 目前為 `2 plaintext / 0 caesar / 0 aes / 0 flag mismatch / 2 migration candidates / 0 skipped`，`aes:ready` 綠燈
- `scripts/lib/aes-migration-guard.mjs` 已新增 operator execute guard：遠端資料庫若未顯式 `--allow-remote` 會拒絕 `--execute` / `--rollback`，正式 execute 也必須具備 `USE_AES_ENCRYPTION=true`、`ENCRYPTION_SALT` 與 operator identity
- `scripts/lib/aes-migration-readiness.mjs` 現在已把 `USE_AES_ENCRYPTION=true` 納入 readiness gate，不再只檢查 `ENCRYPTION_KEY`
- `client/src/App.tsx` 已改為 route-driven tab navigation，不再因 `MainLayout` local state 導致直接開 `/history`、`/settings`、`/employees` 先落到考勤頁
- `client/src/lib/appNavigation.ts` 已收斂主頁 tab/path 對應，`client/src/lib/appNavigation.test.ts` 已覆蓋 direct route、query/hash、trailing slash 對應
- `client/src/hooks/useEmployees.ts` 已收斂到 React Query；`AttendancePage` 掛載後的冗餘強刷已移除
- `shared/utils/adminSessionPolicy.ts`、`client/src/lib/adminSession.ts` 已把前後端管理員 session timeout / heartbeat policy 收斂到同一條主線
- `useAdmin` 現在會吃 `/api/admin/session` / `/api/verify-admin` 回傳的 session policy，閒置自動登出改為跟隨 `SESSION_TIMEOUT`，且使用者持續操作時會節流 refresh server session
- `SettingsForm` / `SettingsPage` 已移除死掉的 Supabase props，未使用的 `client/src/components/ui/dashboard.tsx` 已刪除，`useAdmin` 也不再清理不存在的 Supabase query key
- `server/routes/salary.routes.integration.test.ts` 已補歷史薪資編修的 force-update 與非 force-recalculate 路徑
- `server/routes/admin.routes.integration.test.ts` 已補錯誤舊 PIN、弱 PIN 更新拒絕流程，以及 session timeout policy 輸出
- `client/src/lib/adminSession.test.ts`、`shared/utils/adminSessionPolicy.test.ts` 已補 timeout policy / heartbeat regression
- `client/src/lib/printSalary.ts` / `client/src/lib/printSalary.test.ts` 已鎖住列印頁 query parsing
- `server/index.ts` 的 API request logging 已改成 level-based summary，不再把整個 response body 打到 production log
- `server/utils/httpLogging.ts` 與 `server/utils/logger.ts` 已補 request summary / Error serialization / production warn routing，並有對應測試
- `client/src/lib/queryClient.ts` 的 request / retry debug log 已限縮到 dev
- `client/src/components/SalaryDataFixButton.tsx`、`client/src/components/ErrorBoundary.jsx` 這兩個未被引用的元件檔已刪除
- `client/src/utils/dataCache.ts` 已刪除，`Employee` 型別已移到 `client/src/types/employee.ts`
- `client/src/utils/employeeCache.ts` 已改為型別化 cache entry
- `client/src/lib/debug.ts` 已建立，主要頁面與 hooks 的高頻 debug log 已改為 dev-only
- `README.md`、`docs/INSTALLATION.md`、`docs/CONFIGURATION.md`、`docs/DATABASE_SETUP.md`、`docs/TROUBLESHOOTING.md`、`docs/SUPPORT.md`、`docs/MAINTENANCE.md` 已重寫為目前的 PostgreSQL-only / session-only / AES readiness 主線
- `RELEASE_CHECKLIST.md` 已對齊最新測試基線、restore rehearsal、AES readiness 與 production release gate

## 5. 仍待完成的關鍵缺口

### 5.1 P0 / 上線阻塞

1. AES 遷移仍未完成 `cp7`
   - dry-run / snapshot / rollback rehearsal / restore rehearsal / readiness gate / operator runbook 已完成
   - 尚未做正式 `aes:migrate` 與正式 rollback close-out
   - 本機 `.env` 目前指向遠端 Supabase PostgreSQL，且尚未提供 `ENCRYPTION_KEY`、`ENCRYPTION_SALT`，`USE_AES_ENCRYPTION` 也未開啟
   - 正式 execute 現在還需要 operator 明確提供 remote approval（`--allow-remote`）與 operator identity（`--operator` 或 `AES_MIGRATION_OPERATOR`）

### 5.2 P1 / production 前強烈建議完成

1. 規劃正式 AES execute / operator close-out

## 6. 已校正的舊資訊

- 舊 handoff / backlog 中「`server/storage.ts` 仍為 `@ts-nocheck`」已不成立
- `TASK-P1-CODE-01` 可視為已完成
- 舊 handoff / backlog 中「前端 idle timeout 與 server session timeout 尚未對齊」已不成立
- 舊 handoff / runbook 中「`aes:ready` 只需 `ENCRYPTION_KEY` 即可放行 execute」已不成立
- 先前 `65%` 的 production-ready 估算已偏保守，現況較接近 `97%`
- 先前 audit helper 得出的「`1` 筆 `Caesar + is_encrypted=false` flag mismatch」已確認是誤判，最新 dry-run report 為 `0` 筆 mismatch
- restore rehearsal 抓出的 `pending_bindings` FK 與 timestamp restore 問題都已納入主線修補，不再只是測試現象

## 7. 建議施工順序

正式波次請看：
`docs/PRODUCTION_EXECUTION_QUEUE.md`

建議順序：

1. Wave 1：Restore / Ops Hardening
2. Wave 2：AES Compatible Freeze
3. Wave 3：AES Migration Readiness
4. Wave 4：Frontend Correctness / QA Expansion
5. Wave 5：Release / Docs / Slimming

## 8. 不建議平行碰撞的區域

- `server/storage.ts`
- `server/utils/employeeIdentity.ts`
- `server/session.ts`
- `server/index.ts`
- `server/db-monitoring.ts`

這幾塊仍屬高耦合區，若要平行施工，先切清楚檔案與驗收範圍。

## 9. 標準驗證命令

```bash
npm test
npm run test:smoke
npm run test:real-db
npm run check
npm run build
npm run verify:ops
```

AES 正式 execute 前另加：

```bash
ENCRYPTION_KEY=... npm run aes:ready
```

## 10. 目前應先做什麼

先做：
`正式 AES execute / operator close-out`

原因：
- Wave 5 的 code / docs / release 核心收斂已完成
- 剩下的主要 production blocker 已經是 operator 控制的資料切換與證據留存
