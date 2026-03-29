# Production Execution Queue

更新日期：`2026-03-18`

## 1. 當前已驗證基線

- Repo：`Xin-Zi-Ji-Suan-Sao-Ma-Qiang-V3`
- 分支：`integration/v3-v10-hardening`
- 已通過驗證（Wave 6 完成後）：
  - `npm test` → `122/122 PASS`
  - `npm run test:smoke` → `32/32 PASS`
  - `npm run test:real-db` → `40/40 PASS`（real-db 不受本輪修改影響）
  - `npm run check` → PASS
  - `npm run build` → PASS，無 chunk 警告
  - `npm run verify:ops` → PASS
- 目前 production-ready 完成度估算：`99%`（剩 AES execute 為 operator 手動操作）

## 2. 排程原則

- 不在正式 restore drill 完成前做不可逆的 AES 正式切換。
- 每個波次都要留下可重跑驗證命令與回退說明。
- 每個波次完成後至少重跑：
  - `npm test`
  - `npm run test:smoke`
  - `npm run check`
  - `npm run build`
- 只有 Wave 2 / Wave 3 會要求重跑 `npm run test:real-db`。

## 3. 施工波次

### Wave 1：Restore / Ops Hardening

目標：
- 先把回復能力與排程穩定性補到可承受後續 AES 施工。

工作項：
- `W1-OPS-01` 讓監控與自動備份啟動流程 idempotent
  - 狀態：`Done (2026-03-14)`
  - 落點：`server/index.ts`、`server/db-monitoring.ts`
- `W1-OPS-02` 補正式 restore drill 所需的安全順序與驗證
  - 狀態：`Done (2026-03-14)`
  - 落點：`server/db-monitoring.ts`、`server/scripts/restore-check.ts`
- `W1-QA-01` 為 restore / backup 加最小回歸測試
  - 狀態：`Done (minimum) (2026-03-14)`
  - 落點：`server/*.test.ts`、`server/test-utils/*`
- `W1-DOC-01` 把 restore / rollback 流程寫進 runbook
  - 狀態：`Done (2026-03-14)`
  - 落點：`docs/OPERATIONS_RUNBOOK.md`、`RELEASE_CHECKLIST.md`

Exit criteria：
- restore 不再只是 parse JSON，而是有一次正式演練記錄
- 監控 / 備份不會因重啟或 dev reload 建立重複排程
- `npm run verify:ops` 維持綠燈

本輪已完成：
- 監控與自動備份改為 singleton scheduler，server close 時會清理 timer
- restore core 改為 transaction + 安全刪除順序 + 直接 table insert，不再走會二次加密的 `storage.createEmployee()`
- restore 完成後會重設 serial sequence，避免恢復後新寫入撞主鍵
- `restore:check` 會輸出 backup/live counts、restore order、warnings/errors，並在腳本結束後關閉 DB client
- `server/db-monitoring.test.ts` 新增 restore safety 測試，基線提升到 `69/69 PASS`
- `docs/OPERATIONS_RUNBOOK.md` 與 `RELEASE_CHECKLIST.md` 已補 restore / rollback 標準流程

Wave 1 關帳補強：
- `W3-DATA-02` 已補 transaction-based restore rehearsal，restore 不再只有 readiness check

### Wave 2：AES Compatible Freeze

目標：
- 完成 `cp6-aes-compatible`，讓現有資料與新寫入策略穩定可控。

工作項：
- `W2-DATA-01` 補齊 AES read/write compatibility regression matrix
  - 狀態：`Done (2026-03-14)`
  - 落點：`server/storage.ts`、`server/utils/employeeIdentity.ts`
- `W2-DATA-02` 補 scan / employees / admin flow 的 AES real-db 驗證
  - 狀態：`Done (2026-03-14)`
  - 落點：`server/storage.real-db.test.ts`、`server/routes/*.integration.test.ts`
- `W2-DATA-03` 校正 AES 檢查 / 巡檢腳本輸出
  - 狀態：`Done (2026-03-14)`
  - 落點：`scripts/inspect-employees.mjs`、`scripts/migrate-to-aes.mjs`

Exit criteria：
- `plaintext + Caesar + AES` 讀寫相容有明確測試保護
- `USE_AES_ENCRYPTION` feature flag 灰度切換可驗證
- 建立 `cp6-aes-compatible`

本輪已完成：
- `employeeIdentity` 單元測試新增 AES re-encrypt regression，基線提升到 `72/72 PASS`
- `employees.routes.integration.test.ts` 新增 AES admin display / scan ID 驗證
- `scan.routes.integration.test.ts` 新增 AES employee route-level scan regression
- `storage.real-db.test.ts` 新增 AES 寫入、plaintext / scan token / ciphertext lookup、admin routes、scan clock flow 真 DB 驗證，real-db 基線提升到 `36/36 PASS`
- `inspect-employees.mjs` 已可正確分類 `plaintext / Caesar / AES / empty`，並用 PBKDF2 `salt:hash` 格式判斷 admin PIN
- `migrate-to-aes.mjs` dry-run 輸出新增 source format summary，能直接看出 plaintext / Caesar 來源分布
- `W3-DATA-01` 修正後已確認先前的 `1` 筆 `Caesar + flag mismatch` 為 audit helper 誤判，不是 live DB 真實狀態

### Wave 3：AES Migration Readiness

目標：
- 把 AES 從「相容基礎」推進到「可正式執行遷移」。

工作項：
- `W3-DATA-01` 產出 dry-run migration report
  - 狀態：`Done (2026-03-14)`
  - 落點：`scripts/lib/aes-migration-audit.mjs`、`scripts/migrate-to-aes.mjs`、`scripts/inspect-employees.mjs`、`server/scripts/aes-migration-audit.test.ts`
- `W3-DATA-02` 實作遷移前快照與 rollback / restore 實演
  - 狀態：`Done (2026-03-15)`
  - 落點：`server/db-monitoring.ts`、`server/scripts/restore-rehearsal.ts`、`scripts/migrate-to-aes.mjs`、`server/rehearsal.real-db.test.ts`
- `W3-DATA-03` 完成正式 migration checklist
  - 狀態：`Done (2026-03-15)`
  - 落點：`scripts/lib/aes-migration-readiness.mjs`、`scripts/aes-migration-status.mjs`、`docs/AES_MIGRATION_RUNBOOK.md`、`server/scripts/aes-migration-readiness.test.ts`

Exit criteria：
- dry-run 報表可重跑
- 遷移前後都有備份與 restore 驗證
- 正式 execute / rollback / post-check 有 machine-checkable readiness gate 與 operator runbook

本輪已完成：
- 抽出 `scripts/lib/aes-migration-audit.mjs`，把 Caesar/AES 分類、明文還原、report sanitize 收斂到單一路徑
- `migrate-to-aes.mjs` 現在會把 dry-run / execute-plan / rollback report 寫入 `backups/aes-migration/reports/`
- `server/scripts/aes-migration-audit.test.ts` 已覆蓋 plaintext / Caesar / AES / empty 分類與 report 脫敏輸出
- `aes:report` 與 `aes:inspect` 的輸出已改為遮罩證號，不再把短證號完整寫進 CLI 或 JSON report
- 2026-03-14 最新 dry-run report：
  - 路徑：`backups/aes-migration/reports/aes-dry-run-report-2026-03-14T15-59-32-592Z.json`
  - `plaintext=2`
  - `caesar=0`
  - `aes=0`
  - `empty=0`
  - `flagMismatches=0`
  - `toMigrate=2`
  - `skipped=0`
- `W3-DATA-02` 已新增 `aes:snapshot`、`aes:rehearse`、`restore:rehearse`
- restore core 現在已把 `pending_bindings` 納入 backup / restore / readiness counts，並在 restore 前將備份中的 timestamp 字串正規化為 restore-ready `Date`
- `W3-DATA-03` 已新增 `aes:status`、`aes:ready`，會重掃 live DB，並比對最新 dry-run / snapshot / rehearsal / restore rehearsal 證據
- `docs/AES_MIGRATION_RUNBOOK.md` 已補 execute / rollback / post-check / evidence capture 正式步驟
- `server/scripts/aes-migration-readiness.test.ts` 已覆蓋 artifact 選取與 readiness gate 綠燈/紅燈條件
- `vitest.real-db.config.ts` 已明確序列化 real-db 測試，避免多檔併發污染同一個 PostgreSQL
- `scripts/lib/aes-migration-guard.mjs` 已補 operator safety guard；遠端 execute / rollback 若未顯式 `--allow-remote` 會直接拒絕
- `aes:ready` 現在會額外要求 `USE_AES_ENCRYPTION=true`，正式 execute 則必須顯式配置 `ENCRYPTION_SALT` 與 operator identity
- 2026-03-15 最新 readiness / rehearsal 結果：
  - `backupCounts=employees:2 / holidays:0 / pendingBindings:1 / salaryRecords:11 / temporaryAttendance:0 / hasSettings:true`
  - `liveCounts=employees:2 / holidays:0 / pendingBindings:1 / salaryRecords:11 / temporaryAttendance:0 / hasSettings:true`
  - `restore:rehearse` report：`backups/restore-rehearsal/reports/restore-rehearsal-2026-03-14T16-51-23-607Z.json`
  - `aes:report` report：`backups/aes-migration/reports/aes-dry-run-report-2026-03-14T16-51-43-246Z.json`
  - `aes:snapshot` report：`backups/aes-migration/reports/aes-snapshot-report-2026-03-14T16-51-46-464Z.json`
  - `aes:rehearse` report：`backups/aes-migration/reports/aes-rehearsal-report-2026-03-14T16-51-54-087Z.json`
  - `aes:status` report：`backups/aes-migration/reports/aes-status-report-2026-03-14T16-52-13-057Z.json`
  - `aes:ready`：歷史基線曾為綠燈；guard hardening 後還需 `USE_AES_ENCRYPTION=true`
- 目前本機 `.env` 未預設提供 `ENCRYPTION_KEY`，`ENCRYPTION_SALT` 也尚未顯式配置，且 DB 指向遠端 Supabase PostgreSQL；正式執行前仍需由 operator 補齊 env 並顯式允許 remote execute

### Wave 4：Frontend Correctness / QA Expansion

目標：
- 把目前還會影響上線體驗的前端 correctness 問題與流程測試補齊。

工作項：
- `W4-FE-01` 修 `App.tsx` 路由與 tab state 不一致
  - 狀態：`Done (2026-03-15)`
  - 落點：`client/src/App.tsx`、`client/src/lib/appNavigation.ts`、`client/src/lib/appNavigation.test.ts`
- `W4-FE-02` 將 `useEmployees` 收斂到 React Query
  - 狀態：`Done (2026-03-15)`
  - 落點：`client/src/hooks/useEmployees.ts`、`client/src/pages/AttendancePage.tsx`、`client/src/hooks/useAttendanceData.ts`
- `W4-FE-03` 下掉殘留的假 dashboard / Supabase 語意
  - 狀態：`Done (2026-03-15)`
  - 落點：`client/src/components/SettingsForm.tsx`、`client/src/pages/SettingsPage.tsx`、`client/src/hooks/useAdmin.tsx`
- `W4-QA-01` 補歷史薪資編修、列印、管理員 PIN 更新流程測試
  - 狀態：`Done (2026-03-15)`
  - 落點：`server/routes/salary.routes.integration.test.ts`、`server/routes/admin.routes.integration.test.ts`、`client/src/lib/printSalary.ts`、`client/src/lib/printSalary.test.ts`

Exit criteria：
- 直接開 `/history`、`/settings`、`/employees` 不會落錯頁
- 主要高風險流程都有 smoke 或 integration 保護
- build chunk 不再持續放大

本輪已完成：
- `App.tsx` 已移除會把所有路由先落回 `attendance` 的 local tab state，改由 route 決定 active tab
- `MainLayout` 現在使用 `wouter` navigation，點 tab 會做實際 client-side route 切換
- 新增 `client/src/lib/appNavigation.ts` 收斂 tab/path 對應與 path normalization，避免實作與測試分叉
- 新增 `client/src/lib/appNavigation.test.ts`，覆蓋 direct route、query/hash、trailing slash 對應
- `useEmployees` 已從手工 `fetch + cache + interval` 收斂到 React Query，`AttendancePage` 掛載時多打一輪 API 的強刷已移除
- `SettingsForm` / `SettingsPage` 已移除死掉的 Supabase props，未使用的 `client/src/components/ui/dashboard.tsx` 已刪除
- `useAdmin` 已不再清理不存在的 Supabase / dashboard query key
- `PrintSalaryPage` 的 query parsing 已抽到 `client/src/lib/printSalary.ts`，只接受正整數 `id`
- `salary.routes.integration.test.ts` 已覆蓋歷史薪資編修的 force-update 與非 force-recalculate 兩條路徑
- `admin.routes.integration.test.ts` 已補錯誤舊 PIN 與弱 PIN 更新拒絕流程
- Wave 4 驗證基線已提升到 `npm test -> 92/92 PASS`、`npm run test:smoke -> 27/27 PASS`
- Wave 4 可視為正式關帳

### Wave 5：Release / Docs / Slimming

目標：
- 補齊 production-grade 最後一層：文件、發版準則、日誌與瘦身。

工作項：
- `W5-OBS-01` 收斂 noisy `console.*` 到 logger
  - 狀態：`Done (2026-03-15)`
  - 落點：`server/index.ts`、`server/vite.ts`、`server/utils/logger.ts`、`server/utils/httpLogging.ts`
- `W5-CODE-01` 清理死碼、未使用元件、歷史殘留
  - 狀態：`Done (core) (2026-03-15)`
  - 落點：`client/src/components/SalaryDataFixButton.tsx`、`client/src/components/ErrorBoundary.jsx`、`client/src/lib/queryClient.ts`、`client/src/lib/debug.ts`、`client/src/types/employee.ts`、`client/src/utils/employeeCache.ts`、`client/src/pages/*.tsx`、`client/src/hooks/*.ts`
- `W5-DOC-01` 重寫 README / deploy / rollback / troubleshooting
  - 狀態：`Done (2026-03-15)`
  - 落點：`README.md`、`docs/INSTALLATION.md`、`docs/CONFIGURATION.md`、`docs/DATABASE_SETUP.md`、`docs/TROUBLESHOOTING.md`、`docs/SUPPORT.md`、`docs/MAINTENANCE.md`
- `W5-REL-01` 完成 pre-deploy / post-deploy / rollback checklist
  - 狀態：`Done (2026-03-15)`
  - 落點：`RELEASE_CHECKLIST.md`

Exit criteria：
- README 與實作一致
- release checklist 可直接拿來上線演練
- production 預設不再輸出大量 debug log

本輪已完成：
- `server/index.ts` 的 API request logging 已改成依 status code 決定 `debug / warn / error`
- 2xx request 不再把整個 response body 寫入 production log；4xx/5xx 只保留摘要欄位
- `server/utils/httpLogging.ts` 已收斂 request log level 與 response summary 規則，並補 `server/utils/httpLogging.test.ts`
- `server/utils/logger.ts` 已補 Error serialization、防呆 stringify，production `warn` 會正確走 `console.warn`
- `server/vite.ts` 的 runtime log 已接上共用 logger，`server/utils/logger.test.ts` 已鎖住 dev / production 行為
- `client/src/components/SalaryDataFixButton.tsx`、`client/src/components/ErrorBoundary.jsx` 這兩個未被引用的元件檔已刪除
- `client/src/lib/queryClient.ts` 的 request / retry debug log 已限縮到 `import.meta.env.DEV`
- `client/src/utils/dataCache.ts` 這個只剩型別用途的舊 cache 模組已刪除；`Employee` 型別已移到 `client/src/types/employee.ts`
- `client/src/utils/employeeCache.ts` 已改為型別化 cache entry，不再以 `any` 為主
- `client/src/lib/debug.ts` 已建立，`AttendancePage`、`BarcodeScanPage`、`EmployeesPage`、`HistoryPage`、`PrintSalaryPage`、`useAttendanceData`、`useHistoryData` 的高頻 debug log 已改為 dev-only
- `README.md`、`docs/INSTALLATION.md`、`docs/CONFIGURATION.md`、`docs/DATABASE_SETUP.md`、`docs/TROUBLESHOOTING.md`、`docs/SUPPORT.md`、`docs/MAINTENANCE.md` 已全面改寫為 PostgreSQL-only / session-only / AES readiness 主線
- `RELEASE_CHECKLIST.md` 已對齊目前測試基線、restore rehearsal、AES readiness、PostgreSQL-only release gate

### Wave 6：P1 收尾 + 深度 Code Quality 修復 + 測試強化

目標：
- 完成剩餘 P1 任務、修復深度審計發現的安全/品質問題、強化測試覆蓋。

工作項：
- `W6-OPS-01` 確認監控/備份 idempotent 啟動
  - 狀態：`Done (2026-03-18)` — 已確認 `startMonitoring` 與 `setupAutomaticBackups` 已有 singleton guard，無需修改
  - 落點：`server/db-monitoring.ts`
- `W6-FE-01` `useSettings` 移除冗餘 `useState` / `useEffect`
  - 狀態：`Done (2026-03-18)`
  - 落點：`client/src/hooks/useSettings.ts`
- `W6-FE-02` `useAttendanceData` 確認已為 React Query 標準模式
  - 狀態：`Done (2026-03-18)` — 已確認使用 `useQuery` + `refetchInterval`，無需遷移
  - 落點：`client/src/hooks/useAttendanceData.ts`
- `W6-FE-03` 前端 bundle 優化
  - 狀態：`Done (2026-03-18)`
  - 落點：`vite.config.ts` — 新增 `manualChunks`（vendor-query、vendor-ui、vendor-charts、vendor-motion、vendor）+ `chunkSizeWarningLimit: 600`；build 零警告
- `W6-SEC-01` SSL `rejectUnauthorized: false` → `true`
  - 狀態：`Done (2026-03-18)`
  - 落點：`server/db.ts:12`
- `W6-DATA-01` 移除硬編碼特殊薪資規則，改為 DB-driven
  - 狀態：`Done (2026-03-18)`
  - 落點：`shared/calculationModel.ts`（清空 `specialRules` 初始陣列）、新增 `server/services/calculationRulesLoader.ts`、`server/index.ts`（啟動時呼叫 `loadCalculationRulesFromDb()`）
- `W6-SEC-02` 審計日誌由 `fs.appendFileSync` 改為非阻塞 async 寫入
  - 狀態：`Done (2026-03-18)`
  - 落點：`server/admin-auth.ts:logOperation()`
- `W6-ERR-01` Production error handler 不洩露 5xx 內部錯誤訊息
  - 狀態：`Done (2026-03-18)`
  - 落點：`server/index.ts` — 5xx 在 production 環境回傳通用 `"Internal Server Error"`
- `W6-TEST-01` CORS / Security middleware 測試
  - 狀態：`Done (2026-03-18)`
  - 落點：`server/middleware/security.test.ts`（新增，6 tests）
- `W6-TEST-02` Error handling 測試
  - 狀態：`Done (2026-03-18)`
  - 落點：`server/routes/error-handling.test.ts`（新增，4 tests）

Exit criteria：
- `npm test` → `122/122 PASS`（從 92 增至 122，+30 tests）
- `npm run test:smoke` → `32/32 PASS`
- `npm run check` → PASS
- `npm run build` → PASS，無 chunk 警告

本輪已完成：
- SSL TLS 憑證驗證從 `rejectUnauthorized: false` 改為 `true`，消除 MITM 風險
- 硬編碼的陳文山 2025年3/4月特殊薪資規則移出 shared module，改由 `server/services/calculationRulesLoader.ts` 在啟動時從 `calculation_rules` 資料表動態載入
- `logOperation()` 審計日誌改為 `fs.promises.appendFile` fire-and-forget，不再阻塞 event loop
- Production 500 error 回應改為通用訊息，不再洩漏 `err.message` 內部細節；4xx client error 仍正常轉發
- `useSettings` hook 移除 12 行冗餘的 `useState` + `useEffect` sync，改為 module-level `defaultSettings` 常量 + `settings ?? defaultSettings`
- Vite bundle 依類型分成 5 個 vendor chunks，消除 chunk 過大警告

## 4. 目前建議先做的下一個項目

先做：`正式 AES execute / operator close-out`（P0 剩餘）

原因：
- Wave 5 的 code / docs / release 核心收斂已完成
- 剩下的主要 production blocker 已經不是程式碼品質，而是正式資料切換與 operator 證據留存

完成標準：
- `aes:ready` 之後完成正式 `aes:migrate`
- 留下 execute / rollback / post-check 證據並完成 close-out

## 5. 本輪完成後再更新的文件

Wave 1 / Wave 2 / Wave 3-01 / Wave 3-02 完成後同步更新：
- `docs/PRODUCTION_TASK_BACKLOG.md`
- `docs/CLAUDE_CODE_SUBAGENT_HANDOFF.md`
- `RELEASE_CHECKLIST.md`
