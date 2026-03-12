// @ts-nocheck
import type { Express, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { z } from "zod";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import { eq, and } from "drizzle-orm";
import {
  temporaryAttendance
} from "@shared/schema";
import { registerAdminRoutes } from "./routes/admin.routes";
import { registerAttendanceRoutes } from "./routes/attendance.routes";
import { registerEmployeeRoutes } from "./routes/employees.routes";
import { registerHolidayRoutes } from "./routes/holidays.routes";
import { registerImportRoutes } from "./routes/import.routes";
import { registerSalaryRoutes } from "./routes/salary.routes";
import { registerSettingsRoutes } from "./routes/settings.routes";
import { registerDashboardRoutes } from "./dashboard-routes";
// 導入凱薩加密工具
import { tryDecrypt, isEncrypted, caesarEncrypt, caesarDecrypt } from "../shared/utils/caesarCipher";
import { requireAdmin } from "./middleware/requireAdmin";

export async function registerRoutes(app: Express): Promise<Server> {
  // 初始化數據庫 - 直接使用 PostgreSQL 連接到 Supabase
  console.log("初始化數據庫並確定存儲實現...");
  console.log(`使用PostgreSQL存儲實現`);
  
  // 註冊儀表板相關路由
  registerDashboardRoutes(app);
  registerAdminRoutes(app);
  registerAttendanceRoutes(app);
  registerEmployeeRoutes(app);
  registerHolidayRoutes(app);
  registerImportRoutes(app);
  registerSalaryRoutes(app);
  registerSettingsRoutes(app);
  
  // Error handling middleware
  const handleError = (err: any, res: Response) => {
    console.error("API Error:", err);
    
    if (err instanceof ZodError) {
      const validationError = fromZodError(err);
      return res.status(400).json({ 
        message: "Validation error", 
        errors: validationError.details 
      });
    }
    
    return res.status(500).json({ 
      message: err.message || "Internal server error" 
    });
  };

  // 緩存上次成功的假日數據，避免重複查詢
  let cachedHolidays = [];
  let holidaysCacheTime = 0;
  
  // 定義用於服務器內部通知的變數，替代前端的 EventBus
  const ServerEvents = {
    ATTENDANCE_UPDATED: 'attendance_updated',
    BARCODE_SCANNED: 'barcode_scanned',
    BARCODE_ERROR: 'barcode_error'
  };
  
  // 伺服器端的員工緩存，替代 localStorage
  const employeeCache = new Map();
  
  // 考勤記錄緩存，減少重複查詢
  const attendanceCache = new Map();
  
  // 條碼掃描打卡路由 - 優化版本
  // 用於前端查詢最近掃描結果的API（優化版）
  // 最後一次掃描結果的專用緩存，避免每次搜索全部緩存
  let lastScanResultCache = null;
  let lastScanTimestamp = 0;
  
  app.get("/api/last-scan-result", async (_req, res) => {
    try {
      const now = Date.now();
      console.log(`[最後掃描結果] 請求時間: ${new Date().toLocaleTimeString()}`);
      
      // 獲取當前日期（使用台灣時區 UTC+8）
      const taiwanTime = new Date(now + 8 * 60 * 60 * 1000);
      const currentDate = `${taiwanTime.getUTCFullYear()}/${String(taiwanTime.getUTCMonth() + 1).padStart(2, '0')}/${String(taiwanTime.getUTCDate()).padStart(2, '0')}`;
      const currentTimeStr = `${String(taiwanTime.getUTCHours()).padStart(2, '0')}:${String(taiwanTime.getUTCMinutes()).padStart(2, '0')}`;
      
      // 1. 從數據庫獲取今天最新的考勤記錄（優先）
      console.log(`[最後掃描結果] 嘗試從數據庫獲取今日 (${currentDate}) 最新考勤記錄`);
      try {
        // 直接從數據庫獲取當天的所有考勤記錄
        const todayAttendance = await storage.getAttendanceByDate(currentDate);
        
        // 如果找到考勤記錄，返回最新的一條
        if (todayAttendance && todayAttendance.length > 0) {
          console.log(`[最後掃描結果] 找到 ${todayAttendance.length} 條今日考勤記錄`);
          
          // 獲取最新的一條記錄（按創建時間降序排列）
          const latestRecord = todayAttendance.sort((a, b) => {
            const timeA = new Date(b.createdAt || b.updatedAt || 0).getTime();
            const timeB = new Date(a.createdAt || a.updatedAt || 0).getTime();
            return timeA - timeB;
          })[0];
          
          // 獲取對應的員工信息
          const employee = await storage.getEmployee(latestRecord.employeeId);
          if (employee) {
            // 判斷打卡類型 - 如果沒有下班時間或剛更新了下班時間，就是下班打卡；否則是上班打卡
            const justUpdatedClockOut = latestRecord.clockOut && latestRecord.clockOut !== '' && 
                                       (new Date().getTime() - new Date(latestRecord.updatedAt || 0).getTime() < 10000);
            
            const isClockIn = !justUpdatedClockOut && (!latestRecord.clockOut || latestRecord.clockOut === '');
            const currentTime = isClockIn ? latestRecord.clockIn : latestRecord.clockOut;
            
            console.log(`[最後掃描結果] 最新記錄: 員工=${employee.name}, 類型=${isClockIn ? '上班' : '下班'}, 上班=${latestRecord.clockIn}, 下班=${latestRecord.clockOut || '未打卡'}`);
            
            // 構建更完整的結果對象，包含所有前端需要的信息
            const result = {
              employeeId: latestRecord.employeeId,
              employeeName: employee.name,
              department: employee.department || '生產部',
              idNumber: employee.idNumber || '',
              action: isClockIn ? 'clock-in' : 'clock-out',
              isClockIn: isClockIn,
              attendance: latestRecord,
              success: true,
              timestamp: new Date().toISOString(), // 使用當前時間作為時間戳
              message: `${employee.name} ${isClockIn ? '上班' : '下班'}打卡成功`,
              statusMessage: `${employee.name} ${isClockIn ? '上班' : '下班'}打卡成功`,
              clockTime: currentTime,
              time: currentTime,
              // 添加員工對象，使返回格式與前端期望的一致
              employee: {
                id: employee.id,
                name: employee.name,
                department: employee.department || '生產部',
                idNumber: employee.idNumber
              }
            };
            
            // 更新全局緩存（但總是優先使用數據庫記錄）
            lastScanResultCache = result;
            lastScanTimestamp = now;
            
            console.log(`[最後掃描結果] 返回數據庫查詢結果: 員工=${result.employeeName}, 類型=${result.isClockIn ? '上班' : '下班'}, 打卡時間=${currentTime}`);
            return res.json(result);
          }
        } else {
          console.log(`[最後掃描結果] 數據庫中未找到今日考勤記錄`);
        }
      } catch (dbErr) {
        console.error(`[最後掃描結果] 查詢數據庫出錯:`, dbErr);
      }
      
      // 2. 如果全局緩存足夠新鮮，使用全局緩存（但不信任緩存的打卡類型，重新從最新考勤記錄確認）
      if (lastScanResultCache && lastScanTimestamp) {
        const cacheAge = now - lastScanTimestamp;
        
        console.log(`[最後掃描結果] 檢查全局緩存，緩存年齡: ${cacheAge}ms`);
        console.log(`[最後掃描結果] 緩存內容: ${lastScanResultCache.employeeName}, 打卡類型: ${lastScanResultCache.isClockIn ? '上班' : '下班'}`);
        
        try {
          // 嘗試獲取該員工的最新考勤記錄，以確認真實的打卡狀態
          const employeeAttendance = await storage.getAttendanceByEmployeeId(lastScanResultCache.employeeId, currentDate);
          
          if (employeeAttendance && employeeAttendance.length > 0) {
            // 獲取最新記錄
            const latestRecord = employeeAttendance[0];
            // 判斷真實打卡類型
            const actualIsClockIn = !latestRecord.clockOut || latestRecord.clockOut === '';
            const currentTime = actualIsClockIn ? latestRecord.clockIn : latestRecord.clockOut;
            
            console.log(`[最後掃描結果] 從數據庫確認的打卡類型: ${actualIsClockIn ? '上班' : '下班'}, 打卡時間: ${currentTime}`);
            
            // 使用最新的打卡狀態更新緩存
            const updatedResult = {
              ...lastScanResultCache,
              isClockIn: actualIsClockIn,
              action: actualIsClockIn ? 'clock-in' : 'clock-out',
              message: `${lastScanResultCache.employeeName} ${actualIsClockIn ? '上班' : '下班'}打卡成功`,
              clockTime: currentTime,
              timestamp: new Date().toISOString()
            };
            
            // 更新全局緩存
            lastScanResultCache = updatedResult;
            lastScanTimestamp = now;
            
            console.log(`[最後掃描結果] 返回更新的緩存: ${updatedResult.employeeName}, 類型: ${updatedResult.isClockIn ? '上班' : '下班'}`);
            return res.json(updatedResult);
          }
        } catch (empErr) {
          console.error(`[最後掃描結果] 獲取員工考勤記錄出錯:`, empErr);
        }
        
        // 如果無法從數據庫獲取最新狀態，但緩存足夠新鮮，仍然返回緩存
        if (cacheAge < 60 * 1000) { // 1分鐘內
          console.log(`[最後掃描結果] 使用全局緩存: ${lastScanResultCache.employeeName}`);
          return res.json(lastScanResultCache);
        }
      }
      
      // 3. 從所有緩存中尋找最新的掃描結果
      console.log(`[最後掃描結果] 從所有緩存中尋找最新掃描結果`);
      let latestScanResult = null;
      let latestTimestamp = 0;
      
      // 遍歷所有緩存項目，找出最新的掃描結果
      for (const [key, value] of attendanceCache.entries()) {
        if (key.startsWith('scan_result_') && key.includes(currentDate)) {
          // 從緩存中提取時間戳
          const timestamp = value.timestamp ? 
                          (typeof value.timestamp === 'string' ? 
                            new Date(value.timestamp).getTime() : value.timestamp) : 0;
          
          if (timestamp > latestTimestamp) {
            latestScanResult = value;
            latestTimestamp = timestamp;
          }
        }
      }
      
      // 如果找到了緩存結果
      if (latestScanResult) {
        console.log(`[最後掃描結果] 找到緩存的掃描結果: 員工=${latestScanResult.employeeName}`);
        
        // 不盲目信任緩存的打卡類型，嘗試從數據庫再次確認
        try {
          const employeeAttendance = await storage.getAttendanceByEmployeeId(latestScanResult.employeeId, currentDate);
          
          if (employeeAttendance && employeeAttendance.length > 0) {
            const latestRecord = employeeAttendance[0];
            const actualIsClockIn = !latestRecord.clockOut || latestRecord.clockOut === '';
            const currentTime = actualIsClockIn ? latestRecord.clockIn : latestRecord.clockOut;
            
            // 使用最新的打卡狀態更新緩存
            latestScanResult = {
              ...latestScanResult,
              isClockIn: actualIsClockIn,
              action: actualIsClockIn ? 'clock-in' : 'clock-out',
              message: `${latestScanResult.employeeName} ${actualIsClockIn ? '上班' : '下班'}打卡成功`,
              clockTime: currentTime
            };
          }
        } catch (error) {
          console.error(`[最後掃描結果] 再次確認打卡類型時出錯:`, error);
        }
        
        // 保存到全局緩存
        lastScanResultCache = {...latestScanResult};
        lastScanTimestamp = now;
        
        return res.json(latestScanResult);
      }
      
      // 4. 如果緩存和數據庫都沒有找到結果，但有全局緩存，返回全局緩存
      if (lastScanResultCache) {
        console.log(`[最後掃描結果] 使用過期全局緩存: ${lastScanResultCache.employeeName}`);
        return res.json(lastScanResultCache);
      }
      
      // 如果所有方法都沒有找到結果
      console.log(`[最後掃描結果] 未找到任何掃描記錄`);
      return res.status(404).json({ error: "今日尚無掃描記錄" });
    } catch (error) {
      console.error("[最後掃描結果] 出錯:", error);
      res.status(500).json({ error: "獲取最後掃描結果時出錯" });
    }
  });

  app.post("/api/barcode-scan", async (req, res) => {
    let findEmployeePromise;
    
    try {
      const { idNumber } = req.body;
      
      if (!idNumber) {
        return res.status(400).json({ 
          success: false, 
          message: "必須提供身分證號碼或居留證號碼" 
        });
      }
      
      // 記錄詳細日誌方便調試
      console.log(`掃描處理過程 [Web]: 原始輸入的ID = ${idNumber}`);
      console.log(`此ID是否被識別為加密 = ${isEncrypted(idNumber)}`);
      
      // 根據ID生成持久化打卡緩存鍵
      const cacheKey = `barcode_scan_${idNumber.replace(/[^a-zA-Z0-9]/g, '_')}`;
      
      // 創建快速查找員工的函數
      const findEmployeeWithTimeout = () => {
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            console.log("員工查找超時，嘗試使用緩存");
            try {
              const cachedResult = employeeCache.get(cacheKey);
              if (cachedResult) {
                console.log("快速響應：使用緩存的員工數據");
                resolve(cachedResult);
                return;
              }
            } catch (e) {
              console.error("讀取緩存時出錯", e);
            }
            
            try {
              const lastScannedEmployee = employeeCache.get('last_scanned_employee');
              if (lastScannedEmployee) {
                console.log("使用最後一次掃描的員工數據作為備用");
                resolve(lastScannedEmployee);
                return;
              }
            } catch {}
            
            reject(new Error('查找員工超時'));
          }, 5000);
          
          // 執行優化的並行查找流程
          (async () => {
            try {
              // 1. 檢查緩存 - 最快路徑優先
              const cachedEmployee = employeeCache.get(cacheKey);
              if (cachedEmployee) {
                console.log(`[性能優化] 緩存命中直接返回: ${cachedEmployee.name}`);
                clearTimeout(timeout);
                resolve(cachedEmployee);
                return;
              }
              
              // 2. 並行執行多個查詢策略 - 大幅提高處理效率
              const decrypted = caesarDecrypt(idNumber);
              
              // 準備並行查詢 - 同時執行多個可能的查詢方式
              console.log(`[並行查詢] 同時執行多策略查詢`);
              
              // 並行查詢，恢復到原始實現，確保穩定性
              const [directResult, decryptedResult, employeesList] = await Promise.allSettled([
                // 直接查詢
                storage.getEmployeeByIdNumber(idNumber).catch(() => null),
                // 解密後查詢
                storage.getEmployeeByIdNumber(decrypted).catch(() => null),
                // 獲取所有員工列表
                storage.getAllEmployees().catch(() => [])
              ]);
              
              // 3. 按優先級處理結果
              let employee = null;
              
              // 檢查直接查詢結果 - 最常見最快的情況
              if (directResult.status === 'fulfilled' && directResult.value) {
                employee = directResult.value;
                console.log(`[優化] 直接查詢成功: ${employee.name}`);
              }
              // 檢查解密查詢結果 - 次常見的情況
              else if (decryptedResult.status === 'fulfilled' && decryptedResult.value) {
                employee = decryptedResult.value;
                console.log(`[優化] 解密後查詢成功: ${employee.name}`);
              }
              // 進行更復雜的比對 - 最後嘗試
              else if (employeesList.status === 'fulfilled' && employeesList.value && Array.isArray(employeesList.value)) {
                const allEmployees = employeesList.value;
                console.log(`[優化] 進行快速比對，員工數量: ${allEmployees.length}`);
                
                // 高效匹配邏輯 - 只需一次循環
                for (const emp of allEmployees) {
                  // 情況1：直接比對
                  if (emp.idNumber === idNumber) {
                    console.log(`[優化] 匹配成功: 直接ID相等`);
                    employee = emp;
                    break;
                  }
                  
                  // 情況2：掃描的是解密的ID，資料庫儲存的是加密ID
                  if (isEncrypted(emp.idNumber)) {
                    const empDecrypted = caesarDecrypt(emp.idNumber);
                    if (empDecrypted === idNumber) {
                      console.log(`[優化] 匹配成功: 資料庫存的是加密ID，掃描的是解密ID`);
                      employee = emp;
                      break;
                    }
                  }
                  
                  // 情況3：掃描的是加密的ID，資料庫儲存的是解密ID
                  if (decrypted === emp.idNumber) {
                    console.log(`[優化] 匹配成功: 資料庫存的是解密ID，掃描的是加密ID`);
                    employee = emp;
                    break;
                  }
                  
                  // 情況4：兩邊都是加密ID，但使用不同的加密方式
                  if (isEncrypted(idNumber) && isEncrypted(emp.idNumber)) {
                    if (caesarDecrypt(idNumber) === caesarDecrypt(emp.idNumber)) {
                      console.log(`匹配成功: 兩邊都是加密的，但加密方式不同`);
                      employee = emp;
                      break;
                    }
                  }
                }
              }
              
              if (employee) {
                // 找到員工時緩存結果
                try {
                  // 使用服務器端的Map緩存員工數據，加長有效期到4小時，提高快取效率
                  employeeCache.set(cacheKey, employee, 4 * 60 * 60 * 1000);
                  // 同時保存到最後掃描記錄
                  employeeCache.set('last_scanned_employee', employee);
                  console.log(`員工數據已緩存: ${employee.name} (4小時有效期)`);
                } catch (e) {
                  console.error("緩存員工數據時出錯", e);
                }
              }
              
              clearTimeout(timeout);
              resolve(employee);
            } catch (error) {
              clearTimeout(timeout);
              reject(error);
            }
          })();
        });
      };
      
      // 獲取當前日期和時間（使用台灣時區 UTC+8）
      const now = new Date();
      const taiwanTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
      const currentDate = `${taiwanTime.getUTCFullYear()}/${String(taiwanTime.getUTCMonth() + 1).padStart(2, '0')}/${String(taiwanTime.getUTCDate()).padStart(2, '0')}`;
      const currentTime = `${String(taiwanTime.getUTCHours()).padStart(2, '0')}:${String(taiwanTime.getUTCMinutes()).padStart(2, '0')}`;
      
      // 【效能優化】改為同步處理，立即查找員工
      findEmployeePromise = findEmployeeWithTimeout();
      
      // 【效能優化】等待員工查找完成，然後同步處理所有邏輯
      try {
        // 等待員工查找完成
        const employee = await findEmployeePromise;
          
        if (!employee) {
          console.log(`找不到匹配的員工，ID: ${idNumber}`);
          return res.status(404).json({
            success: false,
            message: "找不到匹配的員工",
            code: "EMPLOYEE_NOT_FOUND"
          });
        }
          
          // 並行處理：同時檢查假日狀態和考勤記錄 - 顯著提高效率
          console.log(`[優化流程] 啟動並行處理`);
          
          // 並行運行多個數據查詢
          const [holidayData, attendanceData] = await Promise.all([
            // 1. 假日檢查（快速路徑優先）
            (async () => {
              try {
                // 使用快速緩存檢查
                const now24h = Date.now();
                if (cachedHolidays.length > 0 && (now24h - holidaysCacheTime < 24 * 60 * 60 * 1000)) {
                  console.log("[並行] 使用假日緩存數據");
                  return cachedHolidays.some(holiday => holiday.date === currentDate);
                }
                
                // 設置超時 Promise，減少等待時間到 300ms - 提高掃碼速度
                const holidayPromise = Promise.race([
                  storage.getAllHolidays(),
                  new Promise(resolve => setTimeout(() => resolve([]), 300))
                ]);
                
                const holidays = await holidayPromise;
                // 更新緩存
                cachedHolidays = holidays;
                holidaysCacheTime = Date.now();
                return holidays.some(holiday => holiday.date === currentDate);
              } catch (err) {
                console.error("[並行] 檢查假日時出錯:", err);
                return false; // 發生錯誤時默認非假日
              }
            })(),
            
            // 2. 考勤記錄查詢（減少等待時間）
            (async () => {
              try {
                // 嘗試從緩存獲取
                const cacheKey = `attendance_${employee.id}_${currentDate}`;
                const cachedAttendance = attendanceCache.get(cacheKey);
                if (cachedAttendance) {
                  console.log("[並行] 使用考勤緩存數據");
                  return cachedAttendance;
                }
                
                // 使用儲存層的方法而不是直接查詢數據庫
                console.log(`[查詢考勤記錄] 員工ID: ${employee.id}, 日期: ${currentDate}`);
                
                try {
                  // 使用儲存層的專用方法進行查詢
                  const records = await storage.getTemporaryAttendanceByEmployeeAndDate(employee.id, currentDate);
                  console.log(`[查詢考勤] 成功從儲存層獲取考勤記錄，數量: ${records.length}`);
                  
                  // 設置緩存
                  attendanceCache.set(cacheKey, records);
                  return records;
                } catch (error) {
                  console.error(`[查詢考勤] 發生錯誤: ${error.message}`);
                  return [];
                }
              } catch (err) {
                console.error("[並行] 查詢考勤記錄時出錯:", err);
                return []; // 發生錯誤時返回空數組
              }
            })()
          ]);
          
          // 解構並行結果
          const isHoliday = holidayData;
          const attendanceRecords = attendanceData;
          
          let result;
          let isClockIn = true; // 默認是上班打卡
          // 預設動作類型，稍後在使用前重新賦值
          
          try {
            // 詳細的日誌信息
            console.log(`[打卡處理] 開始處理打卡記錄，員工: ${employee.name}, 日期: ${currentDate}, 時間: ${currentTime}`);
            console.log(`[打卡處理] 員工ID: ${employee.id}, 員工部門: ${employee.department || '生產部'}`);  
            console.log(`[打卡處理] 共找到 ${attendanceRecords.length} 筆今日考勤記錄`);
            
            // 輸出所有記錄的詳細信息
            if (attendanceRecords.length > 0) {
              console.log('[打卡處理] 今日考勤記錄詳情:');
              attendanceRecords.forEach((record, idx) => {
                console.log(`  [${idx}] ID: ${record.id}, 日期: ${record.date}, 上班: ${record.clockIn}, 下班: ${record.clockOut || '尚未打卡'}`);
              });
            }
            
            // 確保僅過濾今天的記錄
            const todayRecords = attendanceRecords.filter(record => record.date === currentDate);
            console.log(`[打卡處理] 過濾後的今日記錄數: ${todayRecords.length}`);
            
            // 檢查今日是否有未完成打卡記錄（沒有下班時間）
            const incompleteRecords = todayRecords.filter(
              record => !record.clockOut || record.clockOut === ''
            );
            
            console.log(`[打卡處理] 找到 ${incompleteRecords.length} 筆未完成打卡記錄`);
            
            // 如果沒有今日記錄或所有今日記錄都已經有完整的上下班時間，則創建新的上班打卡記錄
            if (todayRecords.length === 0 || incompleteRecords.length === 0) {
              console.log(`[打卡處理] 未找到未完成打卡記錄或無記錄，創建新的上班打卡`);
              
              // 避免在同一分鐘創建多條記錄
              const existingRecordInSameMinute = todayRecords.find(record => 
                record.clockIn === currentTime && record.date === currentDate
              );
              
              if (existingRecordInSameMinute) {
                console.log(`[打卡處理] 發現在同一分鐘內已有打卡記錄，ID: ${existingRecordInSameMinute.id}`);
                // 如果這條記錄已經有下班時間，清除它
                if (existingRecordInSameMinute.clockOut && existingRecordInSameMinute.clockOut !== '') {
                  console.log(`[打卡處理] 此記錄已有下班時間 ${existingRecordInSameMinute.clockOut}，更新為空`);
                  result = await storage.updateTemporaryAttendance(
                    existingRecordInSameMinute.id,
                    { clockOut: '' }
                  );
                } else {
                  result = existingRecordInSameMinute;
                }
              } else {
                // 創建新的上班打卡記錄
                result = await storage.createTemporaryAttendance({
                  employeeId: employee.id,
                  date: currentDate,
                  clockIn: currentTime,
                  clockOut: '', // 下班時間暫時為空
                  isHoliday: isHoliday,
                  isBarcodeScanned: true
                });
              }
              isClockIn = true; // 確保狀態是上班打卡
            } else {
              // 已有未完成的打卡記錄，更新為下班打卡（使用最近的一筆記錄）
              // 按上班時間排序，獲取最新的未完成記錄
              const latestIncompleteRecord = incompleteRecords.sort((a, b) => {
                const timeA = a.clockIn ? a.clockIn.split(':').map(Number) : [0, 0];
                const timeB = b.clockIn ? b.clockIn.split(':').map(Number) : [0, 0];
                return (timeB[0] * 60 + timeB[1]) - (timeA[0] * 60 + timeA[1]);
              })[0];
              
              console.log(`[打卡處理] 找到未完成打卡記錄，ID: ${latestIncompleteRecord.id}，上班時間: ${latestIncompleteRecord.clockIn}，更新為下班打卡`);
              result = await storage.updateTemporaryAttendance(
                latestIncompleteRecord.id,
                { clockOut: currentTime }
              );
              isClockIn = false; // 確保狀態是下班打卡
              // actionType 會在之後由 isClockIn 決定，無需在此更新
            }
            
            // 在伺服器端追蹤打卡狀態 (提前定義actionType)
            const actionType = isClockIn ? 'clock-in' : 'clock-out';
            
            // 在伺服器端記錄打卡成功，保留具體上班/下班資訊僅用於後端伺服器日誌
            console.log(`打卡成功: ${employee.name} ${isClockIn ? '上班' : '下班'}打卡 (操作類型: ${actionType})`);
            
            // 【效能優化】直接使用已有的員工信息，移除多餘的資料庫查詢
            const employeeWithDetails = employee;
            
            const successResult = {
              employeeId: employeeWithDetails.id,
              employeeName: employeeWithDetails.name,
              department: employeeWithDetails.department || '生產部',
              idNumber: employeeWithDetails.idNumber,
              action: actionType,
              isClockIn: isClockIn, // 確保這是一個明確的布爾值
              attendance: result,
              success: true,
              timestamp: new Date().toISOString(),
              message: `${employeeWithDetails.name} 打卡成功`
            };
            
            // 將結果儲存在全域快取中，讓前端能取得最新的打卡狀態
            const scanResultKey = `scan_result_${employee.id}_${currentDate}`;
            attendanceCache.set(scanResultKey, {...successResult});
            
            // 同時更新專用緩存，確保始終返回最新結果
            lastScanResultCache = {...successResult};
            lastScanTimestamp = Date.now();
            
            // 輸出詳細的緩存狀態日誌，方便調試
            console.log(`[緩存更新] 類型=${isClockIn ? '上班' : '下班'}, action=${successResult.action}, isClockIn=${successResult.isClockIn}`);
            console.log(`[緩存資訊] 包含訊息: ${successResult.message}`)
            
            // 更新考勤緩存，確保下次讀取是最新的
            const attendanceCacheKey = `attendance_${employee.id}_${currentDate}`;
            attendanceCache.delete(attendanceCacheKey);
            
            // 清除所有與此員工相關的緩存，確保下次讀取始終是最新的
            // 遍歷所有緩存條目，刪除所有與此員工相關的緩存
            for (const key of attendanceCache.keys()) {
              // 清除所有與此員工ID相關的緩存
              if (key.includes(`${employee.id}_`)) {
                console.log(`[緩存清理] 刪除舊緩存: ${key}`);
                attendanceCache.delete(key);
              }
          }
          
          // 【效能優化】同步返回成功結果，不再異步處理
          return res.json(successResult);
          
        } catch (err) {
          console.error("處理打卡記錄時出錯:", err);
          return res.status(500).json({
            success: false,
            message: `打卡失敗: ${err.message}`,
            code: "ATTENDANCE_ERROR"
          });
        }
      } catch (error) {
        console.error("打卡處理過程中出錯:", error);
        return res.status(500).json({
          success: false,
          message: `處理打卡時發生錯誤: ${error.message}`,
          code: "PROCESSING_ERROR"
        });
      }
      
    } catch (err) {
      console.error('條碼掃描打卡錯誤:', err);
      handleError(err, res);
    }
  });

  // Raspberry Pi 專用的輕量級打卡端點
  app.post("/api/raspberry-scan", async (req, res) => {
    try {
      const { idNumber, deviceId } = req.body;
      
      if (!idNumber) {
        return res.status(400).json({ 
          success: false, 
          message: "必須提供身分證號碼或居留證號碼",
          code: "MISSING_ID"
        });
      }
      
      // 記錄哪個設備發起的請求
      console.log(`Received scan from device: ${deviceId || 'unknown'}, ID: ${idNumber}`);
      
      // 記錄詳細日誌方便調試
      console.log(`掃描處理過程 [RaspberryPi]: 原始輸入的ID = ${idNumber}`);
      console.log(`此ID是否被識別為加密 = ${isEncrypted(idNumber)}`);
      
      // 先直接嘗試查找員工
      let employee = await storage.getEmployeeByIdNumber(idNumber);
      console.log(`直接查找結果: ${employee ? '找到員工 ' + employee.name : '未找到員工'}`);
      
      // 嘗試解密後再查找（無論是否被判斷為加密）
      if (!employee) {
        // 嘗試解密，即使原始判斷可能沒認為是加密的
        const decrypted = caesarDecrypt(idNumber);
        console.log(`嘗試解密ID = ${decrypted}`);
        
        employee = await storage.getEmployeeByIdNumber(decrypted);
        console.log(`解密後查找結果: ${employee ? '找到員工 ' + employee.name : '未找到員工'}`);
      }
      
      // 如果仍然找不到，嘗試獲取所有員工並逐一比對
      if (!employee) {
        console.log('未找到匹配的員工，嘗試全部員工比對');
        const allEmployees = await storage.getAllEmployees();
        console.log(`現有員工數量: ${allEmployees.length}`);
        
        // 嘗試多種比對方案
        for (const emp of allEmployees) {
          console.log(`比對員工: ${emp.name}, ID: ${emp.idNumber}, 此ID是否已加密: ${isEncrypted(emp.idNumber)}`);
          
          // 情況1：直接比對
          if (emp.idNumber === idNumber) {
            console.log(`匹配成功: 直接ID相等 (${emp.idNumber} == ${idNumber})`);
            employee = emp;
            break;
          }
          
          // 情況2：掃描的是解密的ID，資料庫儲存的是加密ID
          if (isEncrypted(emp.idNumber)) {
            const decrypted = caesarDecrypt(emp.idNumber);
            if (decrypted === idNumber) {
              console.log(`匹配成功: 資料庫存的是加密ID (${emp.idNumber})，掃描的是解密ID (${idNumber})`);
              employee = emp;
              break;
            }
          }
          
          // 情況3：掃描的是加密的ID，資料庫儲存的是解密ID
          const decrypted = caesarDecrypt(idNumber);
          if (decrypted === emp.idNumber) {
            console.log(`匹配成功: 資料庫存的是解密ID (${emp.idNumber})，掃描的是加密ID (${idNumber})`);
            employee = emp;
            break;
          }
          
          // 情況4：兩邊都是加密ID，但使用不同的加密方式
          if (isEncrypted(idNumber) && isEncrypted(emp.idNumber)) {
            if (caesarDecrypt(idNumber) === caesarDecrypt(emp.idNumber)) {
              console.log(`匹配成功: 兩邊都是加密的，但加密方式不同`);
              employee = emp;
              break;
            }
          }
        }
      }
      
      if (!employee) {
        return res.status(404).json({
          success: false,
          message: "找不到匹配的員工",
          code: "EMPLOYEE_NOT_FOUND"
        });
      }
      
      // 獲取當前日期和時間（使用台灣時區 UTC+8）
      const now = new Date();
      // 將時間轉換為台灣時區 (UTC+8)
      const taiwanTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
      const currentDate = `${taiwanTime.getUTCFullYear()}/${String(taiwanTime.getUTCMonth() + 1).padStart(2, '0')}/${String(taiwanTime.getUTCDate()).padStart(2, '0')}`;
      const currentTime = `${String(taiwanTime.getUTCHours()).padStart(2, '0')}:${String(taiwanTime.getUTCMinutes()).padStart(2, '0')}`;
      
      // 檢查是否為假日
      const holidays = await storage.getAllHolidays();
      const isHoliday = holidays.some(holiday => holiday.date === currentDate);
      
      // 查找今天是否已有該員工打卡記錄
      const attendanceRecords = await db
        .select()
        .from(temporaryAttendance)
        .where(
          and(
            eq(temporaryAttendance.date, currentDate),
            eq(temporaryAttendance.employeeId, employee.id)
          )
        );
      
      let result;
      let isClockIn = true;
      
      // 如果沒有記錄，創建上班打卡記錄
      if (attendanceRecords.length === 0) {
        result = await storage.createTemporaryAttendance({
          employeeId: employee.id,
          date: currentDate,
          clockIn: currentTime,
          clockOut: '', // 下班時間暫時為空
          isHoliday: isHoliday,
          isBarcodeScanned: true
        });
      } else {
        // 已有記錄，更新為下班打卡
        const existingRecord = attendanceRecords[0];
        
        // 檢查記錄狀態
        if (!existingRecord.clockOut || existingRecord.clockOut === '') {
          // 下班打卡為空，更新為下班打卡
          result = await storage.updateTemporaryAttendance(
            existingRecord.id,
            { clockOut: currentTime }
          );
          isClockIn = false;
        } else {
          // 已經有完整的上下班記錄
          // 此時我們應該刪除現有記錄，建立新的上班打卡記錄（開始新的打卡週期）
          await storage.deleteTemporaryAttendance(existingRecord.id);
          
          // 創建新的上班打卡記錄
          result = await storage.createTemporaryAttendance({
            employeeId: employee.id,
            date: currentDate,
            clockIn: currentTime,
            clockOut: '', // 下班時間暫時為空
            isHoliday: isHoliday,
            isBarcodeScanned: true
          });
          
          // 這是上班打卡
          isClockIn = true;
        }
      }
      
      if (!result) {
        return res.status(500).json({
          success: false,
          message: "打卡失敗，請稍後再試",
          code: "PROCESS_ERROR"
        });
      }
      
      // 輕量級回應，便於嵌入式設備解析
      res.json({
        success: true,
        code: "SUCCESS",
        action: isClockIn ? 'clock-in' : 'clock-out',
        name: employee.name,
        department: employee.department,
        time: currentTime,
        isHoliday: isHoliday
      });
    } catch (err) {
      console.error('Raspberry Pi 打卡錯誤:', err);
      res.status(500).json({
        success: false,
        message: "內部處理錯誤",
        code: "INTERNAL_ERROR"
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
