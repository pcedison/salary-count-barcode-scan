# WP0 基線報告

## 基線識別

- 工作分支：`integration/v3-v10-hardening`
- 基線 tag：`cp0-v3-baseline`
- 基線 commit：`f680638ee91e535fa991ed41b51b0d0406bc84ce`
- 未追蹤封存檔：`backups/checkpoints/cp0-v3-baseline-20260312-105517-untracked.tar.gz`

## 封存內容

- `.config/`
- `.local/`
- `V3_V10_INTEGRATION_EXECUTION_PLAN.md`

## 當前資料層觀察

- `server/storage.ts` 會透過 `isUsingSupabase()` 決定使用 PostgreSQL 或 Supabase storage
- `server/db-with-supabase.ts` 顯示目前系統為雙軌切換架構
- 決策優先順序：
  - `USE_SUPABASE` 環境變數
  - `supabase_config.json`
  - 連線測試結果
  - 預設回退為 PostgreSQL
- `backup.json` 內部顯示曾以 `supabase` 為資料庫類型建立備份
- `supabase_config.json` 目前沒有有效內容輸出，後續 phase 若碰資料遷移，應重新確認正式資料來源

## 當前環境觀察

- 執行環境 Node：`v25.2.1`
- npm：`11.6.2`
- `WP0` 時點 `node_modules` 尚未存在

## 回滾方式

### 程式回退

```bash
git switch integration/v3-v10-hardening
git reset --hard cp0-v3-baseline
```

### 未追蹤設定還原

```bash
tar -xzf backups/checkpoints/cp0-v3-baseline-20260312-105517-untracked.tar.gz
```

### 注意事項

- 若未來 phase 涉及資料遷移，僅切回 `cp0-v3-baseline` 不足以回復資料內容
- `WP7` 前需額外建立資料快照與 restore 驗證
