# API 文檔

## 概述
員工薪資管理系統提供RESTful API，支援員工管理、考勤記錄、薪資計算等功能。

## 基本信息
- **Base URL**: `http://localhost:5000` (開發環境)
- **認證方式**: Session-based authentication
- **數據格式**: JSON
- **時區**: Asia/Taipei (UTC+8)

## 認證與授權

### 管理員登入
```http
POST /api/login
Content-Type: application/json

{
  "username": "admin",
  "password": "1234"
}
```

### 登出
```http
POST /api/logout
```

### 檢查登入狀態
```http
GET /api/user
```

## 員工管理 API

### 獲取所有員工
```http
GET /api/employees
```

**回應範例**:
```json
[
  {
    "id": 1,
    "name": "陳文山",
    "idNumber": "N123456789",
    "department": "生產部",
    "isActive": true,
    "createdAt": "2025-01-01T00:00:00.000Z"
  }
]
```

### 新增員工
```http
POST /api/employees
Content-Type: application/json

{
  "name": "員工姓名",
  "idNumber": "身份證號",
  "department": "部門名稱"
}
```

### 更新員工資料
```http
PUT /api/employees/:id
Content-Type: application/json

{
  "name": "新姓名",
  "department": "新部門",
  "isActive": true
}
```

### 刪除員工
```http
DELETE /api/employees/:id
```

## 考勤管理 API

### 獲取考勤記錄
```http
GET /api/attendance
```

**查詢參數**:
- `employeeId`: 員工ID篩選
- `date`: 日期篩選 (YYYY-MM-DD)
- `startDate`: 開始日期
- `endDate`: 結束日期

### 新增考勤記錄
```http
POST /api/attendance
Content-Type: application/json

{
  "employeeId": 1,
  "date": "2025-06-05",
  "clockIn": "08:00",
  "clockOut": "18:00",
  "isHoliday": false,
  "isBarcodeScanned": true
}
```

### 條碼掃描打卡
```http
POST /api/barcode-scan
Content-Type: application/json

{
  "barcode": "employee_barcode_data",
  "timestamp": "2025-06-05T08:00:00.000Z"
}
```

### 更新考勤記錄
```http
PUT /api/attendance/:id
Content-Type: application/json

{
  "clockIn": "08:00",
  "clockOut": "18:30",
  "isHoliday": false
}
```

### 刪除考勤記錄
```http
DELETE /api/attendance/:id
```

## 薪資管理 API

### 獲取薪資記錄
```http
GET /api/salary-records
```

**查詢參數**:
- `year`: 年份篩選
- `month`: 月份篩選
- `employeeId`: 員工ID篩選

### 獲取特定薪資記錄
```http
GET /api/salary-records/:id
```

### 薪資計算
```http
POST /api/calculate-salary
Content-Type: application/json

{
  "year": 2025,
  "month": 6,
  "employeeIds": [1, 2, 3]
}
```

### 更新薪資記錄
```http
PUT /api/salary-records/:id
Content-Type: application/json

{
  "baseSalary": 28590,
  "welfareAllowance": 2500,
  "housingAllowance": 0,
  "deductions": [
    {"name": "勞保費", "amount": 658},
    {"name": "健保費", "amount": 443}
  ]
}
```

### 刪除薪資記錄
```http
DELETE /api/salary-records/:id
```

## 系統設定 API

### 獲取系統設定
```http
GET /api/settings
```

**回應範例**:
```json
{
  "id": 1,
  "baseHourlyRate": 119,
  "ot1Multiplier": 1.34,
  "ot2Multiplier": 1.67,
  "standardWorkHours": 8,
  "adminPin": "1234",
  "deductionItems": [
    {"name": "勞保費", "amount": 658},
    {"name": "健保費", "amount": 443},
    {"name": "服務費", "amount": 1800},
    {"name": "宿舍費", "amount": 2500}
  ]
}
```

### 更新系統設定
```http
PUT /api/settings
Content-Type: application/json

{
  "baseHourlyRate": 120,
  "ot1Multiplier": 1.34,
  "ot2Multiplier": 1.67,
  "adminPin": "新PIN碼",
  "deductionItems": [
    {"name": "勞保費", "amount": 658}
  ]
}
```

## 假日管理 API

### 獲取假日列表
```http
GET /api/holidays
```

### 新增假日
```http
POST /api/holidays
Content-Type: application/json

{
  "date": "2025-12-25",
  "name": "聖誕節",
  "isPaid": true
}
```

### 刪除假日
```http
DELETE /api/holidays/:id
```

## 報表與匯出 API

### 匯出員工考勤報表
```http
GET /api/reports/attendance
```

**查詢參數**:
- `year`: 年份
- `month`: 月份
- `format`: 格式 (csv, json)

### 匯出薪資報表
```http
GET /api/reports/salary
```

**查詢參數**:
- `year`: 年份
- `month`: 月份
- `employeeId`: 員工ID (可選)
- `format`: 格式 (csv, json)

## 數據庫管理 API

### Supabase 配置
```http
POST /api/supabase-config
Content-Type: application/json

{
  "url": "https://your-project.supabase.co",
  "key": "your-supabase-key",
  "isActive": true
}
```

### 檢查數據庫連接
```http
GET /api/supabase-connection
```

### 數據備份
```http
POST /api/backup
Content-Type: application/json

{
  "type": "manual",
  "includeAttendance": true,
  "includeSalary": true
}
```

## 錯誤處理

### 標準錯誤格式
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "請求數據驗證失敗",
    "details": {
      "field": "employeeId",
      "reason": "必須提供有效的員工ID"
    }
  }
}
```

### HTTP 狀態碼
- `200`: 操作成功
- `201`: 資源創建成功
- `400`: 請求參數錯誤
- `401`: 未授權訪問
- `403`: 權限不足
- `404`: 資源不存在
- `409`: 資源衝突
- `422`: 數據驗證失敗
- `500`: 服務器內部錯誤

## 加班時數計算邏輯

### 計算規則
```javascript
// 標準工時: 8小時
// OT1: 超過8小時但不超過10小時的部分 (倍率: 1.34)
// OT2: 超過10小時的部分 (倍率: 1.67)

function calculateOvertime(clockIn, clockOut) {
  const totalHours = calculateWorkHours(clockIn, clockOut);
  const standardHours = 8;
  
  if (totalHours <= standardHours) {
    return { ot1: 0, ot2: 0 };
  }
  
  const overtimeHours = totalHours - standardHours;
  
  if (overtimeHours <= 2) {
    return { ot1: overtimeHours, ot2: 0 };
  } else {
    return { ot1: 2, ot2: overtimeHours - 2 };
  }
}
```

### 薪資計算範例
```javascript
// 基本薪資計算
const baseSalary = 28590; // 月薪
const baseHourlyRate = 119; // 時薪

// 加班費計算
const ot1Pay = ot1Hours * baseHourlyRate * 1.34;
const ot2Pay = ot2Hours * baseHourlyRate * 1.67;
const totalOvertimePay = ot1Pay + ot2Pay;

// 總薪資
const grossSalary = baseSalary + welfareAllowance + housingAllowance + totalOvertimePay;

// 實發薪資
const netSalary = grossSalary - totalDeductions;
```

## 安全性考量

### 身份證號加密
```javascript
// 凱薩密碼加密 (位移7)
function encryptIdNumber(idNumber) {
  return caesarCipher(idNumber, 7);
}

function decryptIdNumber(encryptedId) {
  return caesarCipher(encryptedId, -7);
}
```

### 會話管理
- 會話存儲在PostgreSQL中
- 會話有效期: 24小時
- 自動清理過期會話

## 測試 API

### 使用 curl 測試
```bash
# 登入
curl -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"1234"}' \
  -c cookies.txt

# 獲取員工列表
curl -X GET http://localhost:5000/api/employees \
  -b cookies.txt

# 新增員工
curl -X POST http://localhost:5000/api/employees \
  -H "Content-Type: application/json" \
  -d '{"name":"測試員工","idNumber":"A123456789","department":"測試部"}' \
  -b cookies.txt
```

### 使用 Postman
1. 匯入 API 集合檔案 (如提供)
2. 設置環境變數: `baseUrl = http://localhost:5000`
3. 首先執行登入請求
4. 後續請求會自動使用會話

## 效能考量

### 分頁查詢
```http
GET /api/salary-records?page=1&limit=50&sortBy=salaryMonth&sortOrder=desc
```

### 快取策略
- 系統設定: 記憶體快取 (5分鐘)
- 員工列表: 記憶體快取 (10分鐘)
- 假日列表: 記憶體快取 (24小時)

### 批次操作
```http
POST /api/attendance/batch
Content-Type: application/json

{
  "records": [
    {
      "employeeId": 1,
      "date": "2025-06-05",
      "clockIn": "08:00",
      "clockOut": "18:00"
    }
  ]
}
```

## 版本控制

### API 版本
當前版本: `v1`
- 向後兼容性保證
- 重大變更會發布新版本
- 舊版本支援期: 6個月