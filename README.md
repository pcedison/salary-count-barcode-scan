# Employee Salary Management System

一個全功能的員工薪資計算與考勤管理系統，專為中小型企業設計。

## ✨ 主要功能

### 📊 薪資計算
- **多層加班費計算**：支援 OT1 (1.34x) 和 OT2 (1.67x) 費率
- **每日計算法**：符合勞動法規的每日加班計算後匯總
- **假日工作費**：週末和國定假日的特殊費率
- **扣款管理**：支援勞保、健保等各項扣款
- **津貼補助**：福利金、房屋津貼等額外給付

### 👥 員工管理
- **完整員工資料**：包含部門、職位追蹤
- **資料加密**：敏感個資（身分證號）採用 Caesar 加密
- **狀態管理**：在職/離職狀態管理

### ⏰ 考勤系統
- **條碼掃描器整合**：支援實體條碼掃描器快速打卡
- **手動時間輸入**：網頁介面手動記錄考勤
- **即時追蹤**：即時顯示目前考勤狀態
- **彈性記錄**：支援半日、加班、假日工作

### 📈 報表功能
- **月度薪資報表**：詳細薪資計算明細
- **CSV 匯出**：完整資料匯出供外部分析
- **列印友善**：最佳化的列印版面
- **歷史記錄**：完整的薪資計算審計軌跡

## 🛠️ 技術架構

### 前端
- **React 18** with TypeScript
- **Vite** 快速開發工具
- **Tailwind CSS + shadcn/ui** 現代化 UI 設計
- **TanStack Query** 高效資料獲取與狀態管理
- **React Hook Form + Zod** 表單處理與驗證
- **Wouter** 輕量級路由

### 後端
- **Node.js + Express.js** RESTful API 服務
- **TypeScript** 類型安全的伺服器開發
- **Drizzle ORM** 現代化資料庫操作
- **Passport.js** 基於會話的身份驗證
- **自訂管理員驗證** PIN 碼存取控制

### 資料庫
- **PostgreSQL** 主要資料庫（支援 Neon/Supabase）
- **自動備份系統** 每日、每週、每月備份
- **資料完整性檢查** 自動監控和恢復

## 🚀 快速開始

### 前置需求
- Node.js 18+
- PostgreSQL 資料庫
- Git

### 安裝步驟

1. **克隆專案**
```bash
git clone https://github.com/YOUR_USERNAME/employee-salary-system.git
cd employee-salary-system
```

2. **安裝依賴**
```bash
npm install
```

3. **設定環境變數**
```bash
cp .env.example .env
# 編輯 .env 檔案，填入您的資料庫連線資訊
```

4. **資料庫設定**
```bash
# 推送資料庫結構
npm run db:push

# （可選）填入範例資料
npm run db:seed
```

5. **啟動應用程式**
```bash
npm run dev
```

應用程式將在 `http://localhost:5000` 啟動。

## 📁 專案結構

```
├── client/                 # 前端 React 應用
│   ├── src/
│   │   ├── components/     # UI 組件
│   │   ├── pages/          # 頁面組件
│   │   ├── hooks/          # 自訂 Hooks
│   │   └── lib/            # 工具函數
├── server/                 # 後端 API 服務
│   ├── routes.ts           # API 路由
│   ├── storage.ts          # 資料存取層
│   └── auth.ts             # 身份驗證
├── shared/                 # 共用程式碼
│   ├── schema.ts           # 資料庫結構定義
│   └── utils/              # 共用工具
└── docs/                   # 文件
```

## 🔧 配置選項

### 環境變數

```env
DATABASE_URL=postgresql://username:password@host:port/database
SESSION_SECRET=your-secure-session-secret
```

### 薪資計算設定

在系統設定頁面可配置：
- 基本時薪
- 加班費倍率（OT1, OT2）
- 各項扣款比例
- 津貼金額

## 📱 支援的硬體

- **USB 條碼掃描器**：標準 USB HID 條碼掃描器
- **Raspberry Pi**：專用的條碼掃描工作站
- **行動裝置**：響應式設計支援手機、平板

## 🔒 安全特性

- **資料加密**：敏感個資採用加密存儲
- **會話管理**：安全的使用者會話處理
- **權限控制**：分層的存取控制系統
- **審計日誌**：完整的操作記錄追蹤

## 🤝 貢獻指南

歡迎提交 Issue 和 Pull Request！

1. Fork 專案
2. 創建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 開啟 Pull Request

## 📄 授權

本專案採用 MIT 授權 - 詳見 [LICENSE](LICENSE) 檔案。

## 🆘 支援

如有問題或需要協助，請：
- 開啟 GitHub Issue
- 查看 [文件](docs/) 目錄
- 參考 API 文件

## 🔄 更新日誌

### v1.0.0 (2025-09-02)
- 初始版本發布
- 完整的薪資計算功能
- 條碼掃描器整合
- 自動備份系統
- 歷史記錄管理

---

**注意**：本系統包含實際的薪資計算邏輯和員工資料管理功能。請確保在生產環境中妥善保護敏感資料。