# Supabase 數據庫使用指南

本系統支持兩種數據庫模式：PostgreSQL（本地）和 Supabase（雲端）。以下是如何配置和切換這兩種模式的說明。

## 數據庫模式優勢對比

### PostgreSQL 模式（默認）
- 簡單設置，無需外部依賴
- 適合開發和測試
- 數據存儲在本地

### Supabase 模式
- 雲端數據存儲，提供備份和恢復功能
- 多設備和多部門訪問支持
- 更好的可擴展性和安全性

## 配置 Supabase

要使用 Supabase 模式，您需要：

1. 在 [Supabase](https://supabase.com) 上創建帳戶和項目
2. 獲取 Supabase URL 和 API 密鑰
3. 在系統的設置頁面中輸入這些值，或直接編輯 `supabase_config.json` 文件

## 切換數據庫模式

### 方法 1：使用界面（推薦）
1. 進入系統設置頁面
2. 找到「數據庫設置」部分
3. 選擇 PostgreSQL 或 Supabase
4. 如果選擇 Supabase，需確保已配置 Supabase URL 和 API 密鑰
5. 保存設置

### 方法 2：使用環境變量（持久化設置）
要永久設置數據庫模式，可以添加以下環境變量：

```
USE_SUPABASE=true    # 使用 Supabase
USE_SUPABASE=false   # 使用 PostgreSQL
```

在 Replit 中，可以通過 Secrets 管理環境變量。

### 方法 3：使用命令行腳本（臨時切換）
系統提供了兩個腳本用於臨時切換數據庫模式：

- `./enable-supabase.sh`：切換到 Supabase 模式
- `./disable-supabase.sh`：切換到 PostgreSQL 模式

這些腳本會自動重啟應用程序以應用更改。

## 數據遷移

首次從 PostgreSQL 切換到 Supabase 時，系統會嘗試自動遷移數據。但為了確保數據安全，建議先備份您的數據：

1. 在切換之前，使用「數據導出」功能導出所有數據
2. 切換到 Supabase 後，檢查數據是否正確遷移
3. 如有問題，可以使用「數據導入」功能恢復數據

## 故障排除

如果在使用 Supabase 時遇到問題：

1. 檢查 Supabase URL 和 API 密鑰是否正確
2. 確保 Supabase 項目正常運行
3. 查看應用程序日誌以獲取詳細錯誤訊息
4. 如果問題持續，可以切換回 PostgreSQL 模式繼續工作，同時聯繫支持

## 注意事項

- 在兩種模式之間切換時，建議避免同時編輯數據
- 如果長時間使用 Supabase，建議定期備份您的數據
- 如果您的團隊需要同時訪問系統，Supabase 模式是更好的選擇