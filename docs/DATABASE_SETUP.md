# 資料庫設置指南

## 1. 主線說明

專案目前只支援 PostgreSQL。

- 可使用本機 PostgreSQL
- 可使用託管 PostgreSQL
- 若你的 provider 是 Supabase / Neon，也只當作 PostgreSQL provider 使用

不再支援：

- 前端切換資料庫
- Supabase runtime config
- Supabase runtime migrate

## 2. 建立資料庫與帳號

```sql
CREATE DATABASE employee_salary_db;
CREATE USER app_user WITH PASSWORD 'replace_me';
GRANT ALL PRIVILEGES ON DATABASE employee_salary_db TO app_user;
```

若 schema push 遇到權限問題：

```sql
\c employee_salary_db
GRANT USAGE, CREATE ON SCHEMA public TO app_user;
ALTER SCHEMA public OWNER TO app_user;
```

## 3. 設定 `DATABASE_URL`

```env
DATABASE_URL=postgresql://app_user:replace_me@localhost:5432/employee_salary_db
```

## 4. 推送 schema

```bash
npm run db:push
```

資料表結構定義請以：

- `shared/schema.ts`

為準。

## 5. session table

管理員 session 使用 `connect-pg-simple`，啟動時會自動建立：

- `user_sessions`

因此第一次啟動時看到 session table 建立屬正常行為。

## 6. 健康檢查與資料庫驗證

```bash
curl http://localhost:5000/api/health
curl http://localhost:5000/ready
curl http://localhost:5000/live
npm run test:real-db
```

## 7. backup / restore 驗證

```bash
npm run restore:check
npm run restore:rehearse
```

目前 restore 路徑已包含：

- `employees`
- `settings`
- `pending_bindings`
- `holidays`
- `salary_records`
- `temporary_attendance`

並會在 restore 前做 readiness 檢查與 restore order 驗證。

## 8. AES migration 與資料庫

若要執行 AES migration：

```bash
ENCRYPTION_KEY=... npm run aes:report
ENCRYPTION_KEY=... npm run aes:snapshot
ENCRYPTION_KEY=... npm run aes:rehearse
ENCRYPTION_KEY=... npm run aes:ready
```

正式 execute 前請確認：

- `restore:rehearse` 已通過
- `aes:ready` 為綠燈
- `ENCRYPTION_SALT` 已顯式設定

## 9. 建議維運檢查

- 定期跑 `npm run verify:ops`
- 檢查 `backups/` 是否有新檔與輪替
- 確認 `/api/health`、`/ready`、`/live` 與真實資料庫狀態一致
