# 薪資計算系統 - GitHub上傳指南

由於我們無法直接從當前環境推送代碼到您的GitHub倉庫，以下是手動上傳項目的步驟：

## 選項1：下載並上傳壓縮包

1. 在Replit界面右側的"Files"面板中，右鍵點擊項目根目錄
2. 選擇"Download as zip"下載整個項目的壓縮包
3. 在您的本地電腦上解壓此文件
4. 前往GitHub網站，登錄您的賬戶
5. 訪問 https://github.com/pcedison/Salary-counting 倉庫
6. 如果倉庫是新的：
   - 點擊"Add file" > "Upload files"
   - 將解壓的文件拖到上傳區域或選擇文件上傳
   - 添加提交消息，如："初始項目上傳"
   - 點擊"Commit changes"

## 選項2：使用Git客戶端

如果您在本地電腦上安裝了Git客戶端：

1. 從Replit下載項目壓縮包
2. 解壓到本地文件夾
3. 打開終端或命令提示符
4. 執行以下命令：

```bash
# 進入項目目錄
cd 解壓的項目路徑

# 初始化Git倉庫
git init

# 添加所有文件
git add .

# 提交更改
git commit -m "初始項目上傳"

# 添加遠程倉庫
git remote add origin https://github.com/pcedison/Salary-counting.git

# 推送到GitHub
git push -u origin main
```

## 重要文件清單

以下是項目的核心文件和目錄，確保這些文件被正確上傳：

### 項目結構
- `/client` - 前端React代碼
- `/server` - 後端Express服務器代碼
- `/shared` - 前後端共享的數據模型和類型
- `supabase_schema.sql` - 數據庫架構定義
- `DEPLOYMENT.md` - 部署指南
- `package.json` - 項目依賴配置
- `drizzle.config.ts` - Drizzle ORM配置

### 服務端關鍵文件
- `/server/routes.ts` - API路由定義
- `/server/storage.ts` - 數據庫交互層
- `/server/db.ts` - 數據庫連接設置
- `/shared/schema.ts` - 數據模型定義

### 客戶端關鍵文件
- `/client/src/App.tsx` - 主應用組件和路由
- `/client/src/hooks/useAdmin.tsx` - 管理員認證鉤子
- `/client/src/hooks/useAttendanceData.ts` - 考勤數據管理
- `/client/src/hooks/useSettings.ts` - 系統設置管理
- `/client/src/pages/` - 所有頁面組件
- `/client/src/components/` - UI組件

## 確認上傳完成

上傳完成後，請瀏覽GitHub倉庫確認所有文件都已正確上傳。特別檢查：

1. 文件結構是否完整
2. 是否包含了所有配置文件
3. `.gitignore`是否正確配置（應排除`node_modules`、`.env`等）

## 後續步驟

上傳完成後，請按照`DEPLOYMENT.md`中的說明進行部署：

1. 設置Supabase數據庫（使用`supabase_schema.sql`）
2. 配置必要的環境變量
3. 安裝依賴並啟動應用

如有任何問題，請參考`README.md`或提交GitHub issue。
