# Production Task Backlog

## 1. 單一目標

將 `Xin-Zi-Ji-Suan-Sao-Ma-Qiang-V3` 強化為可部署、可維運、可回滾、可持續迭代的 production-grade 產品。

這份 backlog 的定位不是功能願望清單，而是正式施工與驗收依據。

## 2. 當前基線

- 主體版本：`V3`
- 工程強化來源：`V10`
- 主整合分支：`integration/v3-v10-hardening`
- 已完成 checkpoint：
  - `cp0-v3-baseline`
  - `cp1-env-green`
  - `cp2-test-baseline`
  - `cp3-security-foundation`
  - `cp4-admin-compat`
- 當前驗證基線：`npm run verify:core` 綠燈

## 3. 當前主要缺口

### 3.1 安全缺口

- 前端已切到 session/cookie 管理員授權，但 server 端仍保留 `x-admin-pin` header 相容層，尚未完全移除 legacy 模型
- 管理員授權狀態雖已不再依賴 localStorage 明文 PIN，但仍需補齊 session-only 路徑的全面回歸與文件
- AES 上線前仍需完成 server-side 顯示/編輯模型，避免前端再次承擔敏感資料解密責任

### 3.2 架構缺口

- `server/routes.ts` 已收斂為 route registration，但 `server/storage.ts` 仍有 `@ts-nocheck`
- 掃碼、儲存層與前端載入策略仍有進一步瘦身與型別化空間
- PostgreSQL-only 與 Supabase 切換殘留邏輯並存
- 監控與備份啟動流程存在重複啟動風險

### 3.3 資料與加密缺口

- 身分證資料仍以 Caesar cipher 為主
- 尚未導入 AES 相容層與正式遷移機制
- 管理員員工頁仍假設可在前端直接做 Caesar 解密，AES 寫入切換前需先收斂顯示/編輯模型
- 尚未完成資料 restore drill

### 3.4 品質與維運缺口

- 已有 route integration / smoke 基線，但管理員登入/PIN 更新、restore 與列印流程仍缺少更完整的端對端保護
- 尚未有標準 `/api/health`、`/ready`、`/live`
- README 與實際架構不一致
- 專案存在歷史殘留檔、JS/TS 雙軌與暫存檔

## 4. Production Release Gate

以下條件未全部達成前，不視為 production-ready。

### Gate A: Security

- 所有寫入型 API 都由 server 端授權
- 不再信任 client-side `adminVerified`
- 管理員授權不再依賴 localStorage 明文 PIN
- 敏感匯入與設定操作具備 rate limit、審計與失敗回應一致性

### Gate B: Data Integrity

- 員工敏感資料可讀取 `plaintext + Caesar + AES`
- 新寫入可灰度切換到 AES
- 正式遷移前有 dry-run 報表
- 正式遷移後有 restore 驗證

### Gate C: Code Health

- API 路由完成模組化
- 主要 runtime 路徑移除 `@ts-nocheck`
- 移除明顯死碼、暫存檔、重複 JS/TS 實作

### Gate D: QA

- `npm run verify:core` 綠燈
- 關鍵 API 有整合測試或 smoke tests
- 特休同步、歷史薪資編修、匯入、打卡流程有回歸保護

### Gate E: Operations

- 有 `/api/health`、`/ready`、`/live`
- 有固定 verify / smoke / restore 指令
- 有部署、故障排除、回滾文件

### Gate F: Slimming

- 移除未使用或誤導性的存儲切換與假功能介面
- 去除大型 noisy `console.log` 與偽裝用 mock 流程
- 前端 build 不再出現主要 chunk 過大與錯誤設計警告

## 5. 執行規則

### 5.1 優先級

- `P0`: 不做就不能稱為 production
- `P1`: 強烈建議在 production 前完成
- `P2`: 可作為 production 後優化或可選擴充

### 5.2 狀態欄位

- `Backlog`
- `Ready`
- `In Progress`
- `Blocked`
- `Done`

### 5.3 分支與 checkpoint

- 任務分支格式：`task/<task-id>-<slug>`
- Phase checkpoint 仍沿用主計畫：
  - `cp5a-routes-admin-settings`
  - `cp5b-routes-employee-holiday`
  - `cp5c-routes-core-complete`
  - `cp6-aes-compatible`
  - `cp7-aes-migrated`
  - `cp8-ops-hardening`

### 5.4 回滾規則

- 純程式任務：回到前一個 git checkpoint
- 資料格式任務：先 restore 對應備份，再切回前一個 checkpoint
- 不覆蓋失敗分支；保留為 `wip/` 或 `failed/` 問題樣本

## 6. 可執行 TASK Backlog

## P0 生產阻塞項

### TASK-P0-SEC-01 全面導入 server-side `requireAdmin`

- 狀態：`Done`
- Size：L
- 依賴：`cp4-admin-compat`
- 目標：所有寫入型 API 不再依賴前端狀態，而由 server 驗證管理員權限
- 範圍：
  - `settings`
  - `employees`
  - `holidays`
  - `attendance` 寫入/刪除
  - `salary-records`
  - `admin import`
- 主要落點：
  - `server/routes.ts`
  - 後續拆出的 `server/routes/*.ts`
- 驗收：
  - 未授權請求回 401/403
  - 已授權請求維持既有功能
  - 敏感 API 不再只靠前端控制顯示
- Checkpoint：納入 `cp5a-routes-admin-settings`
- 回滾：回到 `cp4-admin-compat`

### TASK-P0-SEC-02 移除 `adminVerified` 偽授權模型

- 狀態：`Done`
- Size：M
- 依賴：`TASK-P0-SEC-01`
- 目標：CSV 匯入權限只由 server 驗證，不再接受 `adminVerified: true`
- 主要落點：
  - `server/routes.ts`
  - `client/src/components/CsvImportModal.tsx`
- 驗收：
  - 匯入 API 不再讀取 `req.body.adminVerified` / `req.query.adminVerified`
  - 匯入仍可正常使用
  - 失敗訊息與審計紀錄一致
- Checkpoint：納入 `cp5a-routes-admin-settings`
- 回滾：回到 `cp4-admin-compat`

### TASK-P0-SEC-03 將管理員授權升級為 session 或 signed token

- 狀態：`In Progress`
- Size：XL
- 依賴：
  - `TASK-P0-SEC-01`
  - `TASK-P0-SEC-02`
- 目標：不再於 localStorage 持久保存明文 PIN
- 決策：
  - 優先採用 server session + secure cookie
  - signed token 僅在 session 不可行時使用
- 主要落點：
  - `server/index.ts`
  - `server/admin-auth.ts`
  - `client/src/hooks/useAdmin.tsx`
  - `client/src/lib/queryClient.ts`
- 驗收：
  - 登入後不需於 localStorage 保存明文 PIN
  - 閒置逾時仍可維持現有自動登出體驗
  - API 授權不依賴 `x-admin-pin`
- Checkpoint：`cp5a-routes-admin-settings` 之後獨立 tag
- 回滾：保留相容模式分支，必要時切回 `cp5a`

### TASK-P0-PLAT-01 收斂為單一資料庫策略

- 狀態：`Done`
- Size：L
- 依賴：`cp4-admin-compat`
- 目標：決定產品正式支援的是「PostgreSQL only」或「完整雙存儲」；目前建議正式收斂為 `PostgreSQL only`
- 內容：
  - 清理 fake Supabase config/toggle/migrate API
  - 清理前端設定頁中的假切換流程
  - 保留必要相容層，但不保留誤導性 UI
- 主要落點：
  - `server/routes.ts`
  - `server/db-with-supabase.ts`
  - `client/src/pages/SettingsPage.tsx`
  - `client/src/components/SettingsForm.tsx`
  - `client/src/lib/supabase.ts`
- 驗收：
  - 文件、UI、API、實作一致
  - 不存在 runtime 會打爆的殘留切換端點
  - 不存在「看似可切換，實際是假成功」的介面
- Checkpoint：納入 `cp5c-routes-core-complete`
- 回滾：回到 `cp4-admin-compat` 或 `cp5a`

### TASK-P0-ARCH-01 完成 `WP5A` 路由模組化

- 狀態：`Done`
- Size：M
- 依賴：
  - `TASK-P0-SEC-01`
  - `TASK-P0-SEC-02`
- 目標：先拆 `admin`、`settings`
- 內容：
  - 建立 route registration 結構
  - 將 auth / settings 從單體 `routes.ts` 拆出
  - 保持 endpoint 與 response shape 相容
- 驗收：
  - 管理員登入、PIN 更新、設定更新與查詢正常
  - 寫入型設定接口已授權
- Checkpoint：`cp5a-routes-admin-settings`
- 回滾：`cp4-admin-compat`

### TASK-P0-ARCH-02 完成 `WP5B` 路由模組化

- 狀態：`Done`
- Size：L
- 依賴：`TASK-P0-ARCH-01`
- 目標：拆 `employees`、`holidays`，保留 V3 特休同步能力
- 驗收：
  - 員工 CRUD 正常
  - 假日新增/刪除正常
  - `specialLeaveUsedDates` 正反向同步正常
- Checkpoint：`cp5b-routes-employee-holiday`
- 回滾：`cp5a-routes-admin-settings`

### TASK-P0-ARCH-03 完成 `WP5C` 路由模組化

- 狀態：`Done`
- Size：XL
- 依賴：
  - `TASK-P0-ARCH-02`
  - `TASK-P0-PLAT-01`
- 目標：拆 `attendance`、`salary`、`history`、`import`
- 驗收：
  - 薪資計算、歷史編修、打卡、匯入行為不退化
  - 主路由入口僅保留 route registration
- Checkpoint：`cp5c-routes-core-complete`
- 回滾：`cp5b-routes-employee-holiday`

### TASK-P0-DATA-01 導入 AES 相容讀寫層

- 狀態：`Backlog`
- Size：L
- 依賴：`TASK-P0-ARCH-03`
- 目標：實作 `plaintext + Caesar + AES` 相容，舊資料先不強制遷移
- 主要落點：
  - `shared/utils`
  - `server/storage.ts`
  - `server/supabase-storage.ts` 或其替代方案
- 驗收：
  - 舊資料可讀
  - 新寫入可由 feature flag 控制是否採用 AES
  - 沒有 in-place 不可逆覆蓋
- Checkpoint：`cp6-aes-compatible`
- 回滾：`cp5c-routes-core-complete`

### TASK-P0-DATA-02 執行 AES 遷移與 restore drill

- 狀態：`Backlog`
- Size：L
- 依賴：`TASK-P0-DATA-01`
- 目標：完成 dry-run、正式遷移、restore 驗證
- 驗收：
  - 有 migration report
  - 有遷移前資料快照
  - 有 restore 演練記錄
  - 身分證比對與條碼打卡正常
- Checkpoint：`cp7-aes-migrated`
- 回滾：restore `cp6` 前備份後，切回 `cp6-aes-compatible`

### TASK-P0-QA-01 建立關鍵流程整合測試與 smoke 套件

- 狀態：`In Progress`
- Size：L
- 依賴：`cp4-admin-compat`
- 目標：從純邏輯測試擴展到流程級保護網
- 最少覆蓋：
  - 管理員登入 / 更新 PIN
  - 設定更新
  - 員工 CRUD
  - 假日與特休同步
  - 歷史薪資編修
  - CSV 匯入
  - 條碼打卡
- 驗收：
  - `npm test` 不只覆蓋 utility
  - 有一組可重跑 smoke 指令
- Checkpoint：與 `cp5c`、`cp8` 同步
- 回滾：純程式回退

### TASK-P0-OPS-01 補齊 health / ready / live 與部署驗收腳本

- 狀態：`Backlog`
- Size：M
- 依賴：
  - `TASK-P0-ARCH-03`
  - `TASK-P0-QA-01`
- 目標：讓部署平台可以正確判斷服務健康度
- 驗收：
  - 存在 `/api/health`、`/ready`、`/live`
  - `verify`、`smoke`、`restore-check` 命令固定化
- Checkpoint：`cp8-ops-hardening`
- 回滾：`cp7-aes-migrated`

## P1 強烈建議在 production 前完成

### TASK-P1-CODE-01 移除主要 runtime `@ts-nocheck`

- 狀態：`Backlog`
- Size：XL
- 依賴：`TASK-P0-ARCH-03`
- 目標：至少清掉：
  - `server/storage.ts`
  - `server/supabase-storage.ts` 或其替代路徑
- 驗收：
  - 型別錯誤被顯性化並修復
  - 後續 refactor 不依賴關閉型別檢查

### TASK-P1-CODE-02 瘦身與死碼清理

- 狀態：`Ready`
- Size：M
- 依賴：`TASK-P0-PLAT-01`
- 目標：移除誤導性、重複性或暫存性檔案
- 候選清單：
  - `client/src/hooks/useEmployees.js`
  - `client/src/pages/BarcodeScanPage.tsx.tmp`
  - 已淘汰的 Supabase 切換假流程
  - 不再使用的 mock / temp helper
- 驗收：
  - repo 結構更單純
  - 不影響既有功能

### TASK-P1-OBS-01 日誌收斂與結構化

- 狀態：`Backlog`
- Size：M
- 依賴：`TASK-P0-ARCH-03`
- 目標：將大量 `console.log` 收斂到可控 logger
- 驗收：
  - production 預設不輸出敏感資料
  - 噪音大幅下降
  - 重要操作仍保有審計軌跡

### TASK-P1-OPS-02 修正監控與備份重複啟動

- 狀態：`Ready`
- Size：S
- 依賴：`TASK-P0-ARCH-03`
- 目標：避免 `startMonitoring()` 與 backup scheduler 被重複啟動
- 驗收：
  - 啟動流程只建立一套監控/備份排程
  - 開發與正式環境行為一致

### TASK-P1-FE-01 前端 bundle 與載入策略優化

- 狀態：`Backlog`
- Size：M
- 依賴：`TASK-P1-CODE-02`
- 目標：去除不合理的打包警告與冗餘載入
- 內容：
  - 修正 `SettingsPage` 對 `supabase` 模組的靜態/動態雙重引用
  - 做必要 code-splitting
  - 降低主 bundle 警告
- 驗收：
  - build 不再出現主要 chunk 過大警告
  - 首頁載入沒有明顯退化

### TASK-P1-FE-02 統一前端資料抓取模式

- 狀態：`Backlog`
- Size：M
- 依賴：`TASK-P0-ARCH-03`
- 目標：逐步把手工 `fetch + cache + interval` 收斂到 React Query
- 優先模組：
  - `useEmployees`
  - `useSettings`
  - `useAttendanceData`
- 驗收：
  - fetch 邏輯集中
  - cache/invalidation 規則一致

### TASK-P1-DOC-01 文件與 runbook 重寫

- 狀態：`Ready`
- Size：M
- 依賴：`TASK-P0-OPS-01`
- 目標：讓 README、部署、回滾、restore、維護文件與實際架構一致
- 驗收：
  - README 不再描述不存在的 Passport/session 架構
  - 有部署與故障排除手冊
  - 有資料遷移與 restore 手冊

### TASK-P1-REL-01 建立 release checklist

- 狀態：`Backlog`
- Size：S
- 依賴：
  - `TASK-P0-OPS-01`
  - `TASK-P1-DOC-01`
- 目標：固定化上線前檢查
- 驗收：
  - 有 pre-release checklist
  - 有 post-deploy smoke checklist
  - 有 rollback checklist

## P2 上線後可持續優化

### TASK-P2-OBS-01 擴充審計查詢與管理報表

- 狀態：`Backlog`
- Size：M
- 依賴：`TASK-P1-OBS-01`
- 目標：把安全與維護日誌做成可檢視、可篩選、可匯出

### TASK-P2-PERF-01 打卡與薪資計算效能分析

- 狀態：`Backlog`
- Size：M
- 依賴：`TASK-P0-QA-01`
- 目標：對大量員工資料與月份歷史資料做性能壓測

### TASK-P2-PROD-01 評估 LINE / QR 打卡是否值得重新導入

- 狀態：`Backlog`
- Size：S
- 依賴：`cp8-ops-hardening`
- 原則：
  - 僅在主線已 production-ready 後評估
  - 若導入，必須以安全版 callback/session 重做

## 7. 建議施工波次

### Wave 1: 生產阻塞解除

- `TASK-P0-SEC-01`
- `TASK-P0-SEC-02`
- `TASK-P0-PLAT-01`
- `TASK-P0-ARCH-01`

輸出：`cp5a-routes-admin-settings`

### Wave 2: 核心結構與流程穩定

- `TASK-P0-ARCH-02`
- `TASK-P0-ARCH-03`
- `TASK-P0-QA-01`
- `TASK-P1-OPS-02`

輸出：`cp5c-routes-core-complete`

### Wave 3: 敏感資料升級

- `TASK-P0-DATA-01`
- `TASK-P0-DATA-02`

輸出：`cp6-aes-compatible`、`cp7-aes-migrated`

### Wave 4: 維運與上線門檻

- `TASK-P0-OPS-01`
- `TASK-P1-DOC-01`
- `TASK-P1-REL-01`
- `TASK-P1-OBS-01`

輸出：`cp8-ops-hardening`

### Wave 5: 瘦身與優化

- `TASK-P1-CODE-01`
- `TASK-P1-CODE-02`
- `TASK-P1-FE-01`
- `TASK-P1-FE-02`

輸出：production candidate

## 8. 建議刪減原則

以下項目若無明確商業需求，應優先移除或封存而不是保留假支援：

- 假 Supabase 設定/切換/遷移 UI
- 已無實際使用的存儲切換端點
- 暫存檔與重複 JS/TS 實作
- 不受控的 debug log
- 無驗證保障的管理入口

## 9. Production Definition of Done

當以下條件同時成立，才可宣稱此版本達到 production-grade：

- `P0` 全部完成
- `P1-DOC-01`、`P1-REL-01` 完成
- 實際上線流程有成功演練一次
- 回滾流程有成功演練一次
- 產品核心能力未退化：
  - 特休
  - 津貼/扣款
  - 歷史薪資編修
  - 打卡
  - 列印

## 10. 與主整合計畫的關係

- [V3_V10_INTEGRATION_EXECUTION_PLAN.md](/Users/marcus/Downloads/Xin-Zi-Ji-Suan-Sao-Ma-Qiang-V3/V3_V10_INTEGRATION_EXECUTION_PLAN.md) 是 phase / checkpoint 主計畫
- 本文件是 production backlog 與實際排程主清單
- 若任務優先級、範圍或回滾策略改變，應先更新本文件，再進入實作

## 11. 執行紀錄

### 2026-03-12

- `TASK-P0-SEC-01` 已完成
  - 新增 `server-side requireAdmin`
  - 敏感寫入路由已改為 server 驗證
  - 新增 middleware 測試
- `TASK-P0-SEC-02` 已完成
  - CSV 匯入不再信任 `adminVerified`
  - 前端匯入改為依賴正式授權標頭
- `TASK-P0-PLAT-01` 已完成
  - runtime 已收斂為 PostgreSQL-only
  - 假 Supabase 切換 / 遷移 / 配置入口已停用
  - 系統設定頁改為真實資料庫狀態頁
- `TASK-P0-ARCH-01` 已完成
  - `admin.routes`、`settings.routes` 已從單體 `routes.ts` 拆出
  - route registration 結構已建立
  - `cp5a-routes-admin-settings` 已建立
- `TASK-P0-ARCH-02` 已完成
  - `employees.routes`、`holidays.routes` 已拆出
  - `specialLeaveUsedDates` 正反向同步保留，且改為依賴 `storage` 介面
  - `PATCH /api/employees/:id` 補上欄位級 schema 驗證
  - `cp5b-routes-employee-holiday` 已建立
- `TASK-P0-ARCH-03` 已完成
  - `attendance.routes` 已拆出
  - `startMonitoring()` 已收斂為單一啟動點，避免重複監控副作用
  - `/api/attendance/today` 已修正為相容 `YYYY/MM/DD` 與 `YYYY-MM-DD`
  - 新增 attendance 日期比對測試
  - `salary.routes` 已拆出，`salary/history` 路由已脫離單體 `routes.ts`
  - 修正後端薪資計算未傳入 `employeeId` 的問題，避免特殊規則誤套到預設員工
  - 修正 PATCH 薪資紀錄時可能重複累加假日出勤加給的問題
  - 修正匯入路由缺失 `strictLimiter` import 的 runtime 風險
  - `import.routes` 已拆出，CSV 解析已改為可處理 quoted field 的 helper
  - 新增 import 解析測試，鎖住欄位、日期、扣款與考勤區段解析
  - `useHistoryData` 的敏感 PATCH 更新已收斂回共享 `apiRequest`
  - `.config/`、`.local/` 已納入 `.gitignore`
  - `scan.routes`、`scan-helpers` 已拆出，`routes.ts` 現在只保留 registration
  - `/api/last-scan-result` 不再依賴不存在的 storage method，改為只走正式 `IStorage` 介面
  - 掃碼比對與最後打卡判斷已加入 helper 測試，避免 `clockOut` 事件被 `createdAt` 排序誤判
  - `getTemporaryAttendanceByEmployeeAndDate` 已改為同時相容 `YYYY/MM/DD` 與 `YYYY-MM-DD`，避免舊資料造成重複打卡
  - `cp5c-routes-core-complete` 已可建立
- `TASK-P0-QA-01` 進行中
  - 已新增 `test:smoke` 指令，鎖定高風險 API 路徑
  - `import.routes` 已加入 API 級 smoke test，覆蓋授權、考勤匯入、薪資匯入更新
  - `scan.routes` 已加入 API 級 smoke test，覆蓋加密 ID 比對、上下班打卡、Raspberry 輕量回應、last-scan 重建
  - `employees.routes` 已加入 API 級 smoke test，覆蓋特休日期新增/移除時的假日與考勤同步
  - `settings.routes` 已加入 API 級 smoke test，覆蓋初次預設設定建立與受保護更新
  - `salary.routes` 已加入 API 級 smoke test，覆蓋薪資資料 admin-only 讀取與列印 redirect
  - `dashboard.routes` 已加入 API 級 smoke test，覆蓋維運入口的 admin-only 保護與授權讀取
- `TASK-P0-SEC-01` 持續強化
  - `/api/employees` 已改為預設回傳去敏的營運資料
  - 完整員工清單已移到 `admin-only` 的 `/api/employees/admin`
  - 員工管理頁已切換為完整清單端點，避免一般頁面再取到身分證/聯絡資訊
  - `/api/salary-records`、`/api/salary-records/:id`、`/api/salary-records/:id/pdf` 已改為 admin-only
  - `/api/db-status`、`/api/supabase-config`、`/api/supabase-connection` 已改為 admin-only
  - `dashboard` 維運入口已統一改走 `requireAdmin`，不再散落手寫權限驗證
  - `History` / `PrintSalaryPage` 已補上 query gate，未授權狀態不再先打敏感 API
- `TASK-P0-DATA-01` 前置分析已完成
  - 目前 `EmployeesPage` 仍依賴前端 Caesar 解密顯示 ID
  - AES 下一步應先做 server read-compat 與顯示模型收斂，不能直接開啟 AES 寫入
- `TASK-P0-SEC-03` 進行中
  - server 已導入 `express-session` + secure cookie 管理員會話
  - `verify-admin` 現在會建立 session，並新增 `/api/admin/session`、`/api/admin/logout`
  - `requireAdmin` 已支援 session 驗證，前端 `queryClient` 不再從 localStorage 讀取 `adminPin`
  - `useAdmin` 已改為透過 session 狀態恢復、server logout、admin-only cache 清理
  - `admin.routes.integration.test.ts` 已覆蓋 cookie session 的登入、恢復、登出與 PIN 更新
  - 目前仍保留 `x-admin-pin` 相容授權，下一步要逐步移除 legacy header flow
- 下一個優先施工：
  - `TASK-P0-SEC-03`
  - `TASK-P0-DATA-01`
