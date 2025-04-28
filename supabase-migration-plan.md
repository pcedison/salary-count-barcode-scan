# 將應用程序從 PostgreSQL 遷移到 Supabase 的計劃

## 概述

本文檔概述了將當前基於 PostgreSQL 的應用遷移到 Supabase 的計劃。遷移完成後，系統將使用 Supabase 作為主要數據存儲，這將提供以下好處：

1. 數據庫異地備份和冗餘性
2. 更容易與其他部門共享數據
3. 改進的擴展性和可維護性
4. Supabase 提供的附加功能（如認證、存儲等）

## 先決條件

1. Supabase 項目設置和訪問憑據（URL 和匿名密鑰）
2. 執行 `updated_supabase_schema.sql` 來設置 Supabase 數據庫結構

## 遷移步驟

### 1. 創建 Supabase 客戶端工具

創建一個專用的 Supabase 客戶端文件 (`server/supabase-client.ts`)，處理所有與 Supabase 的通信。

### 2. 修改存儲接口

更新 `server/storage.ts` 文件，實現 `SupabaseStorage` 類，該類實現 `IStorage` 接口但使用 Supabase 作為後端。

### 3. 修改服務器路由

更新 `server/routes.ts` 文件，使用新的 Supabase 存儲類代替當前的 PostgreSQL 實現。

### 4. 數據遷移

實現一個數據遷移腳本，將現有的 PostgreSQL 數據遷移到 Supabase。

### 5. 前端集成更新

確保前端組件與新的 Supabase 後端正確集成。

## 修改的文件

以下文件需要創建或修改：

1. `server/supabase-client.ts` - 新文件
2. `server/storage.ts` - 添加 Supabase 實現
3. `server/db.ts` - 更新為使用 Supabase
4. `server/routes.ts` - 更新為使用 Supabase 存儲
5. `migrate-to-supabase.js` - 新的遷移腳本

## 遷移計劃詳細說明

### 階段 1: 準備 Supabase

1. 在 Supabase 中設置項目
2. 運行 `updated_supabase_schema.sql` 創建數據庫結構
3. 設置適當的行級安全策略（如需要）

### 階段 2: 實施代碼更改

1. 創建 Supabase 客戶端工具
2. 實現 Supabase 存儲類
3. 更新服務器路由

### 階段 3: 測試和驗證

1. 在不中斷現有系統的情況下測試 Supabase 實現
2. 驗證所有功能正常工作
3. 進行性能測試

### 階段 4: 遷移數據和切換

1. 運行數據遷移腳本
2. 驗證數據完整性
3. 切換到 Supabase 實現

### 階段 5: 監控和優化

1. 監控系統性能
2. 優化查詢和索引
3. 添加額外的 Supabase 功能（如需要）