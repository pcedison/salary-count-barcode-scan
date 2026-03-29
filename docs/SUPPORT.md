# 支援與交接指南

## 1. 先看哪裡

若要快速理解目前狀態，請依序看：

1. `docs/PRODUCTION_EXECUTION_QUEUE.md`
2. `docs/CLAUDE_CODE_SUBAGENT_HANDOFF.md`
3. `RELEASE_CHECKLIST.md`
4. `docs/OPERATIONS_RUNBOOK.md`
5. `docs/AES_MIGRATION_RUNBOOK.md`

## 2. 問題分類

### 開發問題

先跑：

```bash
npm run check
npm test
npm run test:smoke
npm run build
```

### 真實資料庫問題

先跑：

```bash
npm run test:real-db
npm run verify:ops
```

### restore / backup 問題

先跑：

```bash
npm run restore:check
npm run restore:rehearse
```

### AES migration 問題

先跑：

```bash
npm run aes:inspect
ENCRYPTION_KEY=... npm run aes:report
ENCRYPTION_KEY=... npm run aes:status
ENCRYPTION_KEY=... npm run aes:ready
```

## 3. 支援時要收哪些證據

- 發生時間
- 使用環境：local / staging / production
- 執行命令
- 錯誤輸出
- `/api/health`、`/ready`、`/live` 回應
- 是否涉及：
  - 管理員登入
  - 條碼掃描
  - 歷史薪資編修
  - restore / AES migration

若涉及資料安全或 migration，再補：

- `npm run restore:check`
- `ENCRYPTION_KEY=... npm run aes:status`

## 4. 目前主線原則

- PostgreSQL-only
- admin auth = session / cookie
- 敏感證號讀寫相容 `plaintext + Caesar + AES`
- 正式 AES execute 前一定先做 readiness gate
- 正式 restore 前一定先確認 restore readiness / rehearsal

## 5. 不要做的事

- 不要直接信任前端狀態當授權
- 不要跳過 `restore:rehearse` 就做正式 restore
- 不要跳過 `aes:ready` 就做正式 `aes:migrate`
- 不要重新引入前端 Supabase 切換 UI
- 不要用 `@ts-nocheck` 掩蓋主線 runtime 問題

## 6. 建議交接格式

交接時請至少包含：

- 本次修改範圍
- 是否動到 live-data 相關腳本
- 驗證命令與結果
- 未完成項
- 風險與回退點
