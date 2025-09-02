# GitHub 上傳指南

## 🚀 快速上傳步驟

### 1. 在 GitHub 創建新倉庫
1. 登入 GitHub
2. 點選右上角的 "+" → "New repository"
3. 輸入倉庫名稱（建議：`employee-salary-system`）
4. 設為 Public 或 Private（您的選擇）
5. **不要**勾選 "Add a README file"（我們已經有了）
6. 點選 "Create repository"

### 2. 在 Replit 中上傳

複製以下命令到 Replit 的 Shell：

```bash
# 初始化 Git 倉庫
git init

# 添加所有檔案
git add .

# 提交第一個版本
git commit -m "Initial commit: Employee Salary Management System"

# 添加 GitHub 倉庫連結（請替換為您的用戶名和倉庫名）
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git

# 推送到 GitHub
git branch -M main
git push -u origin main
```

## 📁 將包含的檔案

✅ **核心程式碼**：
- 完整的前端 React 應用程式
- 後端 Express.js API 服務
- 資料庫 Schema 和 Drizzle 配置
- TypeScript 類型定義

✅ **功能特色**：
- 員工薪資計算系統
- 考勤記錄管理
- 加班費計算（OT1, OT2）
- 歷史記錄查詢
- CSV 匯出功能

✅ **部署配置**：
- Replit 配置檔案
- 環境變數範例
- 資料庫遷移腳本
- 自動備份系統

## 🔧 環境變數設置

在 GitHub 或部署平台上，您需要設定以下環境變數：

```
DATABASE_URL=您的資料庫連線字串
SESSION_SECRET=您的會話金鑰
```

## 📝 README 預覽

倉庫將包含詳細的 README.md，說明：
- 專案功能介紹
- 安裝和設定步驟  
- 技術架構說明
- 使用方式指南

## ⚠️ 注意事項

1. **敏感資料已排除**：.env 檔案不會上傳
2. **資料庫**：需要在新環境中重新設定資料庫連線
3. **依賴項目**：package.json 已包含所有必要依賴

準備好上傳了嗎？