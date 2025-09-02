# 部署包說明

## 📦 GitHub 倉庫內容

這個 GitHub 倉庫包含完整的員工薪資管理系統，可以直接部署到各種平台。

### 🎯 核心功能

✅ **完整的薪資計算系統**
- 多層加班費計算 (OT1: 1.34x, OT2: 1.67x)
- 符合勞動法規的每日計算法
- 假日工作費計算
- 各項扣款和津貼管理

✅ **考勤管理**  
- 條碼掃描器整合
- 手動時間輸入
- 即時考勤追蹤
- 歷史記錄管理

✅ **報表功能**
- 月度薪資報表
- CSV 資料匯出
- 列印友善格式
- 完整審計軌跡

### 🛠️ 技術特色

**現代化技術棧**：
- React 18 + TypeScript 前端
- Node.js + Express.js 後端  
- Drizzle ORM 資料庫操作
- TailwindCSS + shadcn/ui 介面

**企業級功能**：
- 資料加密存儲
- 自動備份系統
- 會話管理
- 權限控制

## 🚀 部署選項

### 1. Vercel 部署
```bash
# 安裝 Vercel CLI
npm i -g vercel

# 部署
vercel --prod
```

### 2. Netlify 部署  
```bash
# 安裝 Netlify CLI
npm i -g netlify-cli

# 部署
netlify deploy --prod
```

### 3. 自主伺服器部署
```bash
# 生產環境建置
npm run build

# 啟動生產服務
npm start
```

### 4. Docker 部署
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 5000
CMD ["npm", "start"]
```

## 🔧 環境設定

### 必要環境變數

```env
# 資料庫連線
DATABASE_URL=postgresql://user:pass@host:port/dbname

# 會話安全金鑰  
SESSION_SECRET=your-long-random-string

# 可選：Google Drive 備份
GOOGLE_DRIVE_CREDENTIALS=path/to/credentials.json
```

### 資料庫支援

✅ **PostgreSQL** (推薦)
- Neon (免費雲端 PostgreSQL)
- Supabase (全功能 BaaS)
- Railway (簡單部署)
- 自架 PostgreSQL

✅ **設定步驟**：
1. 建立 PostgreSQL 資料庫
2. 設定 `DATABASE_URL` 環境變數
3. 執行 `npm run db:push` 建立資料表
4. (可選) 執行 `npm run db:seed` 填入範例資料

## 📱 使用指南

### 系統管理
- **管理員登入**：預設 PIN 碼 `1234` (首次使用後請修改)
- **員工管理**：新增、編輯、停用員工資料
- **系統設定**：薪資計算參數、扣款比例設定

### 日常操作  
- **考勤記錄**：支援條碼掃描或手動輸入
- **薪資計算**：自動計算月度薪資
- **報表查看**：歷史薪資記錄和詳細明細
- **資料匯出**：CSV 格式完整資料下載

### 條碼掃描器設定
1. 連接 USB 條碼掃描器
2. 掃描員工證件上的條碼
3. 系統自動記錄打卡時間
4. 支援 Raspberry Pi 工作站模式

## 🔒 安全建議

### 生產環境
- 更改預設管理員 PIN 碼
- 使用強密碼的資料庫連線
- 定期備份資料庫
- 監控系統日誌

### 資料保護
- 員工身分證號自動加密存儲
- 所有敏感操作記錄審計日誌
- 支援 HTTPS 安全連線
- 定期更新系統依賴

## 📞 技術支援

### 常見問題
- 資料庫連線問題：檢查 `DATABASE_URL` 格式
- 條碼掃描器不工作：確認 USB 連接和驅動程式
- 薪資計算錯誤：檢查系統設定中的計算參數

### 進階自定義
- 修改薪資計算邏輯：編輯 `shared/utils/salaryCalculation.ts`
- 新增報表格式：擴展 `client/src/components/reports/`
- 整合其他系統：使用 RESTful API 端點

### 支援資源
- 📚 [完整 API 文件](API_DOCUMENTATION.md)
- 🏗️ [系統架構說明](SYSTEM_ARCHITECTURE.md)
- 💾 [資料庫結構](DATABASE_SCHEMA.md)

---

**這是一個生產就緒的企業級薪資管理系統**，包含完整的功能和文件，可以立即用於實際業務環境。