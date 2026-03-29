# 維護指南

## 每日檢查

建議至少執行：

```bash
curl http://localhost:5000/api/health
curl http://localhost:5000/ready
curl http://localhost:5000/live
npm run restore:check
```

確認：

- health / ready / live 都正常
- 最新 backup 可通過 restore readiness
- `backups/` 有持續產生新檔

## 每週檢查

建議執行：

```bash
npm run verify:ops
npm run restore:rehearse
```

如果準備做 AES migration，再加：

```bash
ENCRYPTION_KEY=... npm run aes:status
ENCRYPTION_KEY=... npm run aes:ready
```

## 例行維護

- 檢查 PostgreSQL 磁碟空間
- 檢查 `backups/` 保留量是否符合預期
- 確認 `SESSION_SECRET`、`ENCRYPTION_KEY`、`ENCRYPTION_SALT` 沒有遺失
- 檢查 `/api/health` 的 database check 延遲是否異常升高

## 發版前

```bash
npm run check
npm test
npm run test:smoke
npm run test:real-db
npm run build
npm run verify:ops
```

完整項目請看：

- `RELEASE_CHECKLIST.md`

## restore / rollback

正式 restore 前：

```bash
npm run restore:check
npm run restore:rehearse
```

並記錄：

- source backup id
- operator
- timestamp
- post-restore 驗證結果

詳細流程請看：

- `docs/OPERATIONS_RUNBOOK.md`

## AES migration 維護

正式 execute 前：

```bash
npm run aes:inspect
ENCRYPTION_KEY=... npm run aes:report
ENCRYPTION_KEY=... npm run aes:snapshot
ENCRYPTION_KEY=... npm run aes:rehearse
ENCRYPTION_KEY=... npm run aes:ready
```

詳細流程請看：

- `docs/AES_MIGRATION_RUNBOOK.md`
