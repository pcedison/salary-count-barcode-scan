# V3 與 V10 正式整合執行計畫

> Production backlog 與任務優先級請同步參考：
> `docs/PRODUCTION_TASK_BACKLOG.md`

## 1. 專案定位

- 主體版本：`Xin-Zi-Ji-Suan-Sao-Ma-Qiang-V3`
- 工程強化來源：`zeabur-stable-v10`
- 不作為主體的版本：`zeabur-saas-dev`

本計畫的核心原則不是「把 V10 取代 V3」，而是「保留 V3 的業務深度，吸收 V10 的工程成熟度」。

## 2. 整合目標

### 2.1 必須保留的 V3 核心能力

- 特別假資料模型與同步邏輯
- 津貼與扣款的多項目設計
- 歷史薪資紀錄的深度編修能力
- 既有考勤、薪資計算、列印流程
- 現有維護腳本與交接知識

### 2.2 必須吸收的 V10 工程強化

- 啟動前環境驗證
- 安全中介層與速率限制
- 管理員驗證流程重構
- API 模組化路由
- AES-256-GCM 敏感資料加密
- 健康檢查與驗證腳本
- 測試基礎建設

### 2.3 明確不做的事

- 不用 `V10` 的簡化 schema 覆蓋 `V3`
- 不把 `V3` 的特休、津貼、歷史編修退回舊設計
- 不直接採用 `zeabur-saas-dev` 的多租戶模型
- 不在前期直接切換成不可逆的新資料格式

## 3. 當前基線

- V3 git HEAD：`f680638ee91e535fa991ed41b51b0d0406bc84ce`
- 當前未追蹤項目：`.config/`、`.local/`
- 本地驗證現況：
  - `npm run check` 失敗，原因為 `tsc` 不存在
  - `npm run build` 失敗，原因為 `vite` 不存在

結論：正式開工前，必須先建立「可驗證、可重現、可回退」的開發基線。

## 4. 版本控制與回滾策略

### 4.1 分支規則

- 主整合分支：`integration/v3-v10-hardening`
- 每個工作包各開獨立分支：
  - `wp0-baseline`
  - `wp1-env`
  - `wp2-tests`
  - `wp3-security`
  - `wp4-admin-auth`
  - `wp5a-routes-admin-settings`
  - `wp5b-routes-employee-holiday`
  - `wp5c-routes-attendance-salary`
  - `wp6-aes-compat`
  - `wp7-aes-migration`
  - `wp8-ops`
  - `wp9-line-qr`

### 4.2 Checkpoint 規則

- Git tag 格式：`cpN-short-name`
- 資料快照格式：`db-backup/cpN-short-name-YYYYMMDD-HHMM`
- 每個 checkpoint 都必須對應一份簡短變更紀錄

### 4.3 回滾原則

- 純程式改動 phase：直接切回前一個 git checkpoint
- 含資料格式變更 phase：先 restore 該 phase 前的資料快照，再切回前一個 code checkpoint
- 失敗分支不覆寫，保留作為問題分析樣本

### 4.4 最低回退保證

- `cp0`：可回到今天的程式狀態
- `cp6`：可回到 AES 相容但尚未遷移的安全狀態
- `cp7`：可回到 AES 完成遷移後的穩定狀態

## 5. 驗收標準

### 5.1 全域驗收

- `A1`：`npm run check` 通過
- `A2`：`npm run build` 通過
- `A3`：管理員登入 / 更新 PIN 正常
- `A4`：員工 CRUD 正常
- `A5`：假日新增刪除正常
- `A6`：特休日期同步正常
- `A7`：薪資計算正常
- `A8`：歷史薪資紀錄編修正常
- `A9`：薪資單列印正常
- `A10`：有資料變更的 phase 必須完成備份與 restore 驗證

### 5.2 每個工作包最少輸出

- 可審查的 code 變更
- 可重跑的驗證命令
- 對應 checkpoint
- 回滾說明

## 6. 正式任務清單

## Phase 0: 專案治理與基線封存

### TASK-WP0-01 建立整合分支

- Size：S
- 依賴：無
- 內容：建立 `integration/v3-v10-hardening`
- 交付：主整合分支
- 驗收：可從主分支獨立開發

### TASK-WP0-02 建立 `cp0-v3-baseline`

- Size：S
- 依賴：`TASK-WP0-01`
- 內容：記錄目前 HEAD、封存 `.config/`、`.local/`
- 交付：git tag + 本地封存檔
- 驗收：可完整回到今天狀態
- 回滾點：`cp0-v3-baseline`

### TASK-WP0-03 盤點資料來源與備份流程

- Size：S
- 依賴：`TASK-WP0-01`
- 內容：確認使用 PostgreSQL、Supabase 或雙寫模式
- 交付：資料來源說明、備份方式清單
- 驗收：後續資料 phase 可執行備份

## Phase 1: 可重現開發環境

### TASK-WP1-01 鎖定本地執行版本

- Size：S
- 依賴：`TASK-WP0-02`
- 內容：確認 Node、npm、套件安裝方式
- 交付：版本需求與啟動命令
- 驗收：團隊成員可重現安裝環境

### TASK-WP1-02 補齊依賴並跑通 `check/build`

- Size：M
- 依賴：`TASK-WP1-01`
- 內容：補齊 `typescript`、`vite` 或缺漏安裝問題
- 交付：綠燈的 `check/build`
- 驗收：通過 `A1`、`A2`
- Checkpoint：`cp1-env-green`
- 回滾點：`cp0-v3-baseline`

### TASK-WP1-03 建立基線 smoke 指令

- Size：S
- 依賴：`TASK-WP1-02`
- 內容：固定化開發用驗證命令
- 交付：`baseline verification command set`
- 驗收：後續每個 phase 都可重跑

## Phase 2: 測試安全網

### TASK-WP2-01 導入 `vitest`

- Size：S
- 依賴：`TASK-WP1-02`
- 內容：新增測試依賴與 script
- 交付：`npm run test`
- 驗收：測試框架可執行

### TASK-WP2-02 建立核心回歸測試

- Size：M
- 依賴：`TASK-WP2-01`
- 內容：
  - 管理員驗證
  - 特休同步
  - 津貼/扣款計算
  - 歷史薪資編修計算
- 交付：最小回歸測試集
- 驗收：核心功能有保護網
- Checkpoint：`cp2-test-baseline`
- 回滾點：`cp1-env-green`

## Phase 3: 安全基礎設施整合

### TASK-WP3-01 搬入環境驗證器

- Size：S
- 依賴：`TASK-WP2-02`
- 來源：`V10/server/config/envValidator.ts`
- 落點：`V3/server/index.ts`、新增 `server/config/*`
- 驗收：啟動前可驗證必要環境變數

### TASK-WP3-02 搬入安全中介層

- Size：M
- 依賴：`TASK-WP3-01`
- 來源：`V10/server/middleware/security.ts`
- 落點：`V3/server/index.ts`、新增 `server/middleware/*`
- 驗收：可啟用 helmet、CORS、proxy trust

### TASK-WP3-03 搬入速率限制

- Size：S
- 依賴：`TASK-WP3-01`
- 來源：`V10/server/middleware/rateLimiter.ts`
- 落點：敏感 API
- 驗收：管理員驗證與敏感操作有 rate limit

### TASK-WP3-04 安全基線回歸

- Size：S
- 依賴：`TASK-WP3-02`、`TASK-WP3-03`
- 驗收：通過 `A1`、`A2`、`A3`、`A4`、`A5`
- Checkpoint：`cp3-security-foundation`
- 回滾點：`cp2-test-baseline`

## Phase 4: 管理員驗證與前端授權相容重構

### TASK-WP4-01 清理重複 admin route

- Size：M
- 依賴：`TASK-WP3-04`
- 內容：移除 `server/routes.ts` 內重複定義的 `/api/verify-admin`、`/api/update-admin-pin`
- 驗收：只有單一可信入口

### TASK-WP4-02 導入 PIN 強度驗證器

- Size：S
- 依賴：`TASK-WP4-01`
- 來源：`V10/shared/utils/passwordValidator.ts`
- 驗收：更新 PIN 時會驗證弱密碼

### TASK-WP4-03 將 admin-auth 改為相容模式

- Size：L
- 依賴：`TASK-WP4-01`
- 內容：
  - 支援 plaintext 驗證
  - 支援 hash 驗證
  - 不直接做不可逆 cutover
- 驗收：舊資料仍可登入，新 PIN 可安全更新

### TASK-WP4-04 前端統一攜帶授權標頭

- Size：M
- 依賴：`TASK-WP4-03`
- 來源：`V10/client/src/lib/queryClient.ts`、`V10/client/src/hooks/useAdmin.tsx`
- 驗收：敏感 API 一律能帶 `x-admin-pin`

### TASK-WP4-05 認證回歸驗證

- Size：S
- 依賴：`TASK-WP4-02`、`TASK-WP4-03`、`TASK-WP4-04`
- 驗收：通過 `A1`、`A2`、`A3`
- Checkpoint：`cp4-admin-compat`
- 回滾點：`cp3-security-foundation`

## Phase 5: 路由模組化重構

### TASK-WP5A-01 拆出 `admin.routes`、`settings.routes`

- 狀態：已完成
- Size：M
- 依賴：`TASK-WP4-05`
- 驗收：設定頁、管理員登入、PIN 更新正常
- Checkpoint：`cp5a-routes-admin-settings`
- 回滾點：`cp4-admin-compat`

### TASK-WP5B-01 拆出 `employee.routes`

- 狀態：已完成
- Size：M
- 依賴：`TASK-WP5A-01`
- 驗收：員工 CRUD、加密欄位、在職狀態正常

### TASK-WP5B-02 拆出 `holiday.routes`

- 狀態：已完成
- Size：L
- 依賴：`TASK-WP5B-01`
- 驗收：假日新增、刪除、特休反向同步正常

### TASK-WP5B-03 特休同步回歸

- 狀態：已完成
- Size：S
- 依賴：`TASK-WP5B-02`
- 驗收：通過 `A5`、`A6`
- Checkpoint：`cp5b-routes-employee-holiday`
- 回滾點：`cp5a-routes-admin-settings`

### TASK-WP5C-01 拆出 `attendance.routes`

- 狀態：已完成
- Size：M
- 依賴：`TASK-WP5B-03`
- 驗收：考勤新增、刪除、清空、讀取正常

### TASK-WP5C-02 拆出 `salary.routes`、`history` 相關路由

- 狀態：已完成
- Size：L
- 依賴：`TASK-WP5C-01`
- 驗收：薪資計算、歷史薪資紀錄查詢與編修正常

### TASK-WP5C-03 模組化總回歸

- 狀態：已完成
- Size：S
- 依賴：`TASK-WP5C-02`
- 驗收：通過 `A1` 到 `A9`
- Checkpoint：`cp5c-routes-core-complete`
- 回滾點：`cp5b-routes-employee-holiday`

### Phase 5 目前剩餘風險

- `routes.ts` 已收斂為 registration 入口，但 `server/storage.ts` 仍保留 `@ts-nocheck`
- 掃碼流程已改為只依賴正式 `IStorage` 介面，下一階段應把儲存層型別補齊
- `cp5c-routes-core-complete` 可在本輪驗證與提交後建立

## Phase 6: AES 相容層導入

### TASK-WP6-01 搬入 AES 加密工具

- Size：M
- 依賴：`TASK-WP5C-03`
- 來源：`V10/shared/utils/encryption.ts`
- 驗收：程式已能辨識 AES 格式

### TASK-WP6-02 更新 storage 相容讀寫

- Size：L
- 依賴：`TASK-WP6-01`
- 內容：
  - 支援 plaintext
  - 支援 Caesar
  - 支援 AES
  - 預設仍不強制遷移舊資料
- 前置提醒：
  - 員工管理 UI 目前仍假設可在前端直接做 Caesar 解密
  - 因此 Phase 6 第一段只能先做 server-side read compatibility，不可直接打開 AES 寫入
- 驗收：舊資料照常可讀寫

### TASK-WP6-03 建立 feature flag

- Size：S
- 依賴：`TASK-WP6-02`
- 內容：以環境變數控制新寫入是否採用 AES
- 驗收：可安全灰度切換

### TASK-WP6-04 AES 相容回歸

- Size：S
- 依賴：`TASK-WP6-02`、`TASK-WP6-03`
- 驗收：通過 `A1` 到 `A9`
- Checkpoint：`cp6-aes-compatible`
- 回滾點：`cp5c-routes-core-complete`

## Phase 7: AES 資料遷移

### TASK-WP7-01 遷移前資料快照

- Size：S
- 依賴：`TASK-WP6-04`
- 內容：完整備份 `employees` 與相關設定
- 驗收：有可 restore 的備份檔

### TASK-WP7-02 建立 dry-run 遷移報表

- Size：M
- 依賴：`TASK-WP7-01`
- 來源：`V10/server/auto-migration.ts`
- 驗收：能先列出預計遷移筆數、已是 AES 筆數、失敗筆數

### TASK-WP7-03 執行正式遷移

- Size：M
- 依賴：`TASK-WP7-02`
- 驗收：所有需遷移資料成功轉成 AES

### TASK-WP7-04 Restore 演練或至少 restore 驗證

- Size：S
- 依賴：`TASK-WP7-03`
- 驗收：資料可回退

### TASK-WP7-05 遷移後功能驗證

- Size：S
- 依賴：`TASK-WP7-03`
- 驗收：員工查詢、身分證比對、打卡流程正常
- Checkpoint：`cp7-aes-migrated`
- 回滾點：restore `cp6` 前備份後，再切回 `cp6-aes-compatible`

## Phase 8: 維運與觀測能力

### TASK-WP8-01 搬入健康檢查路由

- Size：S
- 依賴：`TASK-WP7-05`
- 來源：`V10/server/routes/health.routes.ts`
- 驗收：有 `/api/health`、`/ready`、`/live`

### TASK-WP8-02 建立 verify 腳本

- Size：M
- 依賴：`TASK-WP8-01`
- 內容：將 smoke 驗證整理為固定腳本
- 驗收：可一鍵重跑

### TASK-WP8-03 補齊文件

- Size：S
- 依賴：`TASK-WP8-02`
- 內容：更新安裝、維護、故障排除說明
- 驗收：新整合後專案可交接

### TASK-WP8-04 維運總驗收

- Size：S
- 依賴：`TASK-WP8-01`、`TASK-WP8-02`、`TASK-WP8-03`
- 驗收：通過 `A1` 到 `A10`
- Checkpoint：`cp8-ops-hardening`
- 回滾點：`cp7-aes-migrated`

## Phase 9: 可選功能整合

### TASK-WP9-01 評估是否導入 LINE/QR 打卡

- Size：S
- 依賴：`TASK-WP8-04`
- 驗收：有明確 go / no-go 決策

### TASK-WP9-02 導入 `ClockInPage` 與 `QRCodePage`

- Size：L
- 依賴：`TASK-WP9-01`
- 驗收：前端頁面可正常使用

### TASK-WP9-03 重做安全版 LINE callback

- Size：L
- 依賴：`TASK-WP9-02`
- 內容：不用 query string 暫存敏感資訊，改用 session 或 signed token
- 驗收：LINE 綁定與打卡流程安全可用

### TASK-WP9-04 功能總驗收

- Size：M
- 依賴：`TASK-WP9-03`
- 驗收：新增功能與 V3 核心能力都正常
- Checkpoint：`cp9-line-qr-optional`
- 回滾點：`cp8-ops-hardening`

## 7. 實際施工順序

1. `WP0` 基線與封存
2. `WP1` 開發環境綠燈
3. `WP2` 測試安全網
4. `WP3` 安全基礎設施
5. `WP4` 管理員驗證相容化
6. `WP5A` 到 `WP5C` 路由模組化
7. `WP6` AES 相容層
8. `WP7` AES 正式遷移
9. `WP8` 健康檢查與交接能力
10. `WP9` 視需求才做

## 8. 每個工作包的 DoD

- 該 phase 的 code 已完成
- 對應測試或 smoke 已通過
- 已建立 checkpoint
- 已記錄回滾方式
- 未破壞 V3 特休、津貼、歷史編修三大核心能力

## 9. 第一輪正式開工建議

第一輪不要直接碰 AES 遷移與 LINE/QR。

第一輪建議只做到：

- `WP0`
- `WP1`
- `WP2`
- `WP3`
- `WP4`
- `WP5A`

理由：

- 這一段能先把專案從「可維護性弱」提升到「可安全迭代」
- 風險主要在程式層，不需要先做資料層不可逆變更
- 完成後就已經能顯著改善後續開發效率與穩定性

## 10. 後續執行紀錄欄

### Checkpoint Ledger

- `cp0-v3-baseline`：已建立，指向 `f680638ee91e535fa991ed41b51b0d0406bc84ce`
- `cp1-env-green`：已建立，指向 `a7fcc62`
- `cp2-test-baseline`：已建立，指向 `b3e6ce6`
- `cp3-security-foundation`：已建立，指向 `c00b348`
- `cp4-admin-compat`：已建立，指向 `c00b348`
- `cp4a-auth-postgres-foundation`：已建立，指向 `d817c53f995bafcb8e87c59b821c4e82cf1b5628`
- `cp5a-routes-admin-settings`：已建立，指向 `8326edb2d3e75bb34c9a7b65b384063c40539e7b`
- `cp5b-routes-employee-holiday`：已建立
- `cp5c-routes-core-complete`：可於本輪提交後建立
- `cp6-aes-compatible`：待建立
- `cp7-aes-migrated`：待建立
- `cp8-ops-hardening`：待建立
- `cp9-line-qr-optional`：待建立

### 備註

- 本文件是正式施工主計畫
- 實作過程若有新風險，必須先更新本文件再進入下一 phase
- `cp3` 與 `cp4` 目前落在同一個 commit，因為安全基礎設施與管理員相容驗證共用同一批 auth / route 檔案
- `cp5b` 以 `cp5a` 為回退基線，後續 `WP5C` 若失敗，優先回切到 `cp5b`
- `WP5C` 已完成總回歸；掃碼殘留單體邏輯已拆出為 `scan.routes`
