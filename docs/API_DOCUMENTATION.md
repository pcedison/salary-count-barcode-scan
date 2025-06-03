# API 介面文檔

## 概述

員工薪資計算系統提供完整的 RESTful API，支援員工管理、考勤記錄、薪資計算等核心功能。

**基礎 URL**: `http://your-domain.com/api`

**認證方式**: Session-based 認證

## 認證 API

### 管理員驗證

```http
POST /api/verify-admin
Content-Type: application/json

{
  "pin": "your_admin_pin"
}
```

**回應**:
```json
{
  "success": true
}
```

## 員工管理 API

### 獲取所有員工

```http
GET /api/employees
```

**回應**:
```json
[
  {
    "id": 1,
    "name": "王小文",
    "idNumber": "K011133456",
    "department": "生產部",
    "position": "作業員",
    "hourlyRate": 119,
    "active": true,
    "joinDate": "2025/01/01",
    "leaveDate": null,
    "note": ""
  }
]
```

### 新增員工

```http
POST /api/employees
Content-Type: application/json

{
  "name": "陳文山",
  "idNumber": "A123456789",
  "department": "生產部",
  "position": "作業員",
  "hourlyRate": 119,
  "joinDate": "2025/01/01",
  "note": "新進員工"
}
```

### 更新員工資料

```http
PUT /api/employees/:id
Content-Type: application/json

{
  "name": "陳文山",
  "department": "品管部",
  "position": "品管員",
  "hourlyRate": 125
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
- `employeeId`: 員工ID (可選)
- `date`: 日期 (YYYY/MM/DD) (可選)
- `month`: 月份 (YYYY/MM) (可選)

**回應**:
```json
[
  {
    "id": 1,
    "employeeId": 1,
    "date": "2025/05/02",
    "clockIn": "08:00",
    "clockOut": "17:30",
    "workHours": 8.5,
    "overtimeHours": 0.5,
    "isBarcodeScanned": true,
    "note": ""
  }
]
```

### 新增考勤記錄

```http
POST /api/attendance
Content-Type: application/json

{
  "employeeId": 1,
  "date": "2025/05/02",
  "clockIn": "08:00",
  "clockOut": "17:30",
  "note": "正常出勤"
}
```

### 條碼掃描打卡

```http
POST /api/barcode-scan
Content-Type: application/json

{
  "idNumber": "A123456789"
}
```

**回應**:
```json
{
  "success": true,
  "employeeId": 1,
  "employeeName": "陳文山",
  "department": "生產部",
  "action": "clock-in",
  "isClockIn": true,
  "message": "陳文山 上班打卡成功",
  "clockTime": "08:00",
  "attendance": {
    "id": 1,
    "date": "2025/05/02",
    "clockIn": "08:00"
  }
}
```

### 更新考勤記錄

```http
PUT /api/attendance/:id
Content-Type: application/json

{
  "clockIn": "08:30",
  "clockOut": "17:30",
  "note": "遲到30分鐘"
}
```

### 刪除考勤記錄

```http
DELETE /api/attendance/:id
```

## 薪資計算 API

### 獲取薪資記錄

```http
GET /api/salary-records
```

**查詢參數**:
- `year`: 年份 (可選)
- `month`: 月份 (可選)
- `employeeId`: 員工ID (可選)

**回應**:
```json
[
  {
    "id": 1,
    "employeeId": 1,
    "employeeName": "陳文山",
    "salaryYear": 2025,
    "salaryMonth": 5,
    "baseSalary": 20000,
    "overtimePay": 2500,
    "grossSalary": 22500,
    "laborInsurance": 434,
    "healthInsurance": 319,
    "totalDeductions": 753,
    "netSalary": 21747,
    "workDays": 22,
    "totalWorkHours": 184,
    "totalOvertimeHours": 16,
    "calculationDate": "2025/05/31"
  }
]
```

### 計算特定員工薪資

```http
POST /api/salary-records/calculate
Content-Type: application/json

{
  "employeeId": 1,
  "year": 2025,
  "month": 5
}
```

### 批量計算薪資

```http
POST /api/salary-records/calculate-all
Content-Type: application/json

{
  "year": 2025,
  "month": 5
}
```

### 重新計算薪資

```http
PUT /api/salary-records/:id/recalculate
```

## 系統設置 API

### 獲取系統設置

```http
GET /api/settings
```

**回應**:
```json
{
  "id": 1,
  "baseHourlyRate": 119,
  "ot1Multiplier": 1.34,
  "ot2Multiplier": 1.67,
  "standardWorkHours": 8,
  "deductionItems": [
    {
      "name": "勞保費",
      "rate": 0.105,
      "type": "percentage"
    },
    {
      "name": "健保費",
      "rate": 0.0517,
      "type": "percentage"
    }
  ],
  "adminPin": "encrypted_pin"
}
```

### 更新系統設置

```http
PUT /api/settings
Content-Type: application/json

{
  "baseHourlyRate": 120,
  "ot1Multiplier": 1.34,
  "ot2Multiplier": 1.67,
  "deductionItems": [
    {
      "name": "勞保費",
      "rate": 0.105,
      "type": "percentage"
    }
  ]
}
```

## 假日管理 API

### 獲取假日設定

```http
GET /api/holidays
```

**回應**:
```json
[
  {
    "id": 1,
    "date": "2025/01/01",
    "name": "元旦",
    "type": "national"
  }
]
```

### 新增假日

```http
POST /api/holidays
Content-Type: application/json

{
  "date": "2025/02/10",
  "name": "春節",
  "type": "national"
}
```

## 報表 API

### 月薪資報表

```http
GET /api/reports/monthly-salary?year=2025&month=5
```

### 考勤統計報表

```http
GET /api/reports/attendance-summary?year=2025&month=5
```

### 加班統計報表

```http
GET /api/reports/overtime-summary?year=2025&month=5
```

## 資料匯出 API

### 匯出薪資記錄

```http
GET /api/export/salary-records?format=excel&year=2025&month=5
```

**支援格式**: `excel`, `csv`, `pdf`

### 匯出考勤記錄

```http
GET /api/export/attendance?format=excel&startDate=2025/05/01&endDate=2025/05/31
```

## 系統監控 API

### 健康檢查

```http
GET /api/health
```

**回應**:
```json
{
  "status": "ok",
  "timestamp": "2025-05-02T10:00:00.000Z",
  "database": "connected",
  "memory": {
    "used": "128MB",
    "free": "896MB"
  }
}
```

### 系統狀態

```http
GET /api/system-status
```

**回應**:
```json
{
  "uptime": "24h 30m",
  "version": "1.0.0",
  "environment": "production",
  "database": {
    "status": "connected",
    "connections": 5
  },
  "cache": {
    "hit_rate": "95%",
    "memory_usage": "45MB"
  }
}
```

## 備份 API

### 創建備份

```http
POST /api/backup/create
```

### 獲取備份列表

```http
GET /api/backup/list
```

### 恢復備份

```http
POST /api/backup/restore
Content-Type: application/json

{
  "backupId": "backup-2025-05-02"
}
```

## 錯誤回應格式

所有 API 錯誤回應遵循統一格式：

```json
{
  "error": "錯誤訊息",
  "code": "ERROR_CODE",
  "details": {
    "field": "具體錯誤欄位"
  }
}
```

## 常見錯誤代碼

- `400 Bad Request`: 請求參數錯誤
- `401 Unauthorized`: 未授權存取
- `403 Forbidden`: 權限不足
- `404 Not Found`: 資源不存在
- `409 Conflict`: 資料衝突
- `422 Unprocessable Entity`: 資料驗證失敗
- `500 Internal Server Error`: 伺服器內部錯誤

## 限流與配額

- 每個 IP 每分鐘最多 60 次請求
- 大量資料匯出操作每小時最多 10 次
- 批量計算操作每天最多 100 次

## SDK 與範例

### JavaScript/Node.js 範例

```javascript
// 獲取員工列表
const response = await fetch('/api/employees', {
  method: 'GET',
  credentials: 'include'
});
const employees = await response.json();

// 新增考勤記錄
const attendance = await fetch('/api/attendance', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  credentials: 'include',
  body: JSON.stringify({
    employeeId: 1,
    date: '2025/05/02',
    clockIn: '08:00',
    clockOut: '17:30'
  })
});
```

### Python 範例

```python
import requests

# 設置基礎 URL
base_url = 'http://your-domain.com/api'

# 獲取薪資記錄
response = requests.get(f'{base_url}/salary-records', 
                       params={'year': 2025, 'month': 5})
salary_records = response.json()

# 條碼掃描打卡
scan_response = requests.post(f'{base_url}/barcode-scan',
                             json={'idNumber': 'A123456789'})
```

## WebSocket 即時功能

### 連接 WebSocket

```javascript
const ws = new WebSocket('ws://your-domain.com/ws');

ws.onmessage = function(event) {
  const data = JSON.parse(event.data);
  
  switch(data.type) {
    case 'attendance_update':
      // 處理考勤更新
      break;
    case 'salary_calculation_complete':
      // 處理薪資計算完成
      break;
  }
};
```

### 支援的即時事件

- `attendance_update`: 考勤記錄更新
- `employee_added`: 新增員工
- `salary_calculation_complete`: 薪資計算完成
- `system_alert`: 系統警報

這份 API 文檔涵蓋了系統的所有主要功能介面，開發者可以據此進行整合開發。