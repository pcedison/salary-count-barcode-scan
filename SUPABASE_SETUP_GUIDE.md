# Supabase 連接字串獲取指南

## 步驟 1：登入 Supabase 控制台

1. 前往 https://supabase.com
2. 點擊右上角「Sign In」
3. 使用您的帳號登入

## 步驟 2：檢查現有專案狀態

### 選項 A：修復現有專案 pezkrfptwoudqpruaier
1. 在控制台首頁查看專案列表
2. 找到專案 `pezkrfptwoudqpruaier`
3. 檢查專案狀態：
   - 🟢 **Active**：專案正常運行
   - 🟡 **Paused**：專案已暫停（免費專案 1 週不活動會暫停）
   - ❌ **Not Found**：專案已刪除

### 如果專案顯示「Paused」（暫停）
1. 點擊進入專案
2. 會看到「Resume Project」按鈕
3. 點擊「Resume Project」重新啟動
4. 等待 2-3 分鐘完成啟動

### 如果專案顯示「Active」
1. 點擊進入專案
2. 點擊左側選單「Settings」
3. 點擊「Database」
4. 找到「Connection string」區域

## 步驟 3：重置資料庫密碼（建議執行）

1. 在 Settings > Database 頁面
2. 找到「Database Password」區域
3. 點擊「Reset Database Password」
4. 輸入新密碼（建議：`43Marcus43` 保持一致）
5. 點擊「Update Password」
6. **重要**：記住新密碼

## 步驟 4：獲取連接字串

### Transaction Pooler（推薦）
1. 在 Settings > Database 頁面
2. 找到「Connection pooling」區域
3. 確保選擇「Transaction」模式
4. 複製「Connection string」
5. 格式應該是：
```
postgresql://postgres.pezkrfptwoudqpruaier:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

### 替換密碼
將 `[YOUR-PASSWORD]` 替換為您在步驟 3 設定的密碼

---

## 方案 B：建立全新專案（如果現有專案已刪除）

### 步驟 1：建立新專案
1. 在 Supabase 控制台首頁
2. 點擊「New Project」
3. 填寫專案資訊：
   - **Name**: Employee Salary System
   - **Database Password**: 43Marcus43
   - **Region**: Northeast US (us-east-1) - 建議選擇與原專案相同區域
4. 點擊「Create new project」
5. 等待 2-3 分鐘建立完成

### 步驟 2：獲取新專案連接字串
1. 專案建立完成後，點擊進入
2. 點擊左側「Settings」
3. 點擊「Database」
4. 在「Connection pooling」區域選擇「Transaction」
5. 複製完整連接字串

---

## 提供連接字串給我

獲取連接字串後，請按以下格式提供：

```
postgresql://postgres.PROJECT_ID:PASSWORD@HOST:PORT/postgres
```

**範例**：
```
postgresql://postgres.abcd1234:43Marcus43@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

**安全提醒**：
- 連接字串包含敏感資訊，僅在此對話中使用
- 不要在其他地方公開分享

---

## 常見問題解決

### 如果忘記 Supabase 帳號
- 嘗試用常用 email 重置密碼
- 或建立新帳號和新專案

### 如果專案建立失敗
- 免費帳號限制 2 個活躍專案
- 需要刪除舊專案或升級帳號

### 如果連接測試仍失敗
- 確認密碼正確
- 確認選擇 Transaction pooler
- 嘗試等待 5 分鐘後再測試

---

## 下一步

獲得連接字串後，我將執行：
1. 測試新連接
2. 建立完整資料庫結構
3. 匯入所有歷史資料（5 筆薪資記錄）
4. 更新系統配置
5. 驗證遷移完成

預估時間：20-30 分鐘完整遷移