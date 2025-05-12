// @ts-nocheck
import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { z } from "zod";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import { eq, and } from "drizzle-orm";
import {
  insertTemporaryAttendanceSchema,
  insertSettingsSchema,
  insertSalaryRecordSchema,
  insertHolidaySchema,
  insertEmployeeSchema,
  temporaryAttendance
} from "@shared/schema";
import { getSupabaseConfig, saveSupabaseConfig } from "./supabase-config";
import { checkSupabaseConnection } from "./supabase-client";
import { initializeDatabase, isUsingSupabase, enableSupabase, disableSupabase } from "./db-with-supabase";
import { registerDashboardRoutes } from "./dashboard-routes";
import { startMonitoring } from "./db-monitoring";
import { logOperation, OperationType } from "./admin-auth";
// 導入凱薩加密工具
import { tryDecrypt, isEncrypted, caesarEncrypt, caesarDecrypt } from "../shared/utils/caesarCipher";
// 導入子進程模組
import { spawn } from "child_process";

export async function registerRoutes(app: Express): Promise<Server> {
  // 初始化數據庫
  console.log("初始化數據庫並確定存儲實現...");
  const { useSupabase } = await initializeDatabase();
  console.log(`使用${useSupabase ? 'Supabase' : 'PostgreSQL'}存儲實現`);
  
  // 註冊儀表板相關路由
  registerDashboardRoutes(app);
  
  // 啟動數據庫監控（每分鐘檢查一次連接狀態）
  const monitoringTimer = startMonitoring(60000);
  
  // 記錄系統啟動日誌
  logOperation(
    OperationType.SYSTEM_CONFIG,
    `系統啟動，使用${useSupabase ? 'Supabase' : 'PostgreSQL'}存儲`,
    { success: true }
  );
  
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

  // Admin verification routes
  app.post("/api/verify-admin", async (req, res) => {
    try {
      const { pin } = req.body;
      
      if (!pin) {
        return res.status(400).json({ success: false, message: "PIN is required" });
      }
      
      const settings = await storage.getSettings();
      
      if (!settings) {
        return res.status(404).json({ success: false, message: "Settings not found" });
      }
      
      const isValid = settings.adminPin === pin;
      
      return res.json({ success: isValid });
    } catch (err) {
      handleError(err, res);
    }
  });
  
  app.post("/api/update-admin-pin", async (req, res) => {
    try {
      const { oldPin, newPin } = req.body;
      
      if (!oldPin || !newPin) {
        return res.status(400).json({ success: false, message: "Old PIN and new PIN are required" });
      }
      
      if (newPin.length !== 6 || !/^\d+$/.test(newPin)) {
        return res.status(400).json({ success: false, message: "New PIN must be 6 digits" });
      }
      
      const settings = await storage.getSettings();
      
      if (!settings) {
        return res.status(404).json({ success: false, message: "Settings not found" });
      }
      
      if (settings.adminPin !== oldPin) {
        return res.status(401).json({ success: false, message: "Current PIN is incorrect" });
      }
      
      const updatedSettings = await storage.createOrUpdateSettings({
        ...settings,
        adminPin: newPin
      });
      
      return res.json({ success: true });
    } catch (err) {
      handleError(err, res);
    }
  });

  // Temporary attendance routes
  app.get("/api/attendance", async (_req, res) => {
    try {
      console.log("[數據查詢] 獲取所有考勤記錄");
      const attendanceRecords = await storage.getTemporaryAttendance();
      
      console.log(`[查詢考勤] 成功從儲存層獲取考勤記錄，數量: ${attendanceRecords.length}`);
      res.json(attendanceRecords);
    } catch (err) {
      console.error("[查詢考勤] 獲取考勤記錄失敗:", err);
      handleError(err, res);
    }
  });
  
  // 新增：專門用於獲取今日考勤記錄的API
  app.get("/api/attendance/today", async (_req, res) => {
    try {
      // 獲取今天的日期格式 (YYYY/MM/DD)
      const todayDate = new Date().toLocaleDateString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).replace(/\//g, '/');
      
      console.log(`[查詢考勤] 獲取今日 (${todayDate}) 考勤記錄`);
      
      // 直接從儲存層獲取考勤記錄
      const allAttendanceRecords = await storage.getTemporaryAttendance();
      
      // 篩選今天的記錄
      const todayRecords = allAttendanceRecords.filter(record => record.date === todayDate);
      console.log(`[查詢考勤] 找到 ${todayRecords.length} 筆今日考勤記錄`);
      
      // 為了更高效地獲取員工信息，僅獲取今日記錄所需的員工
      if (todayRecords.length > 0) {
        // 獲取不重複的員工ID列表
        const employeeIds = [...new Set(todayRecords.map(record => record.employeeId).filter(Boolean))];
        
        if (employeeIds.length > 0) {
          console.log(`[查詢考勤] 需要查詢 ${employeeIds.length} 位員工的信息`);
          
          // 獲取相關員工信息
          const employees = await Promise.all(
            employeeIds.map(id => storage.getEmployeeById(id))
          );
          
          // 創建員工ID到信息的映射
          const employeeMap = new Map();
          employees.forEach(emp => {
            if (emp) employeeMap.set(emp.id, emp);
          });
          
          // 將員工信息添加到考勤記錄中
          todayRecords.forEach(record => {
            if (record.employeeId && employeeMap.has(record.employeeId)) {
              const employee = employeeMap.get(record.employeeId);
              record._employeeName = employee.name;
              record._employeeDepartment = employee.department;
            }
          });
        }
      }
      
      res.json(todayRecords);
    } catch (err) {
      console.error("[查詢考勤] 獲取今日考勤記錄失敗:", err);
      handleError(err, res);
    }
  });

  app.post("/api/attendance", async (req, res) => {
    try {
      const validatedData = insertTemporaryAttendanceSchema.parse(req.body);
      const attendance = await storage.createTemporaryAttendance(validatedData);
      res.status(201).json(attendance);
    } catch (err) {
      handleError(err, res);
    }
  });

  app.put("/api/attendance/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID" });
      }

      const validatedData = insertTemporaryAttendanceSchema.partial().parse(req.body);
      const updatedAttendance = await storage.updateTemporaryAttendance(id, validatedData);
      
      if (!updatedAttendance) {
        return res.status(404).json({ message: "Attendance record not found" });
      }
      
      res.json(updatedAttendance);
    } catch (err) {
      handleError(err, res);
    }
  });

  app.delete("/api/attendance/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID" });
      }

      const success = await storage.deleteTemporaryAttendance(id);
      
      if (!success) {
        return res.status(404).json({ message: "Attendance record not found" });
      }
      
      res.status(204).end();
    } catch (err) {
      handleError(err, res);
    }
  });

  app.delete("/api/attendance", async (_req, res) => {
    try {
      await storage.deleteAllTemporaryAttendance();
      res.status(204).end();
    } catch (err) {
      handleError(err, res);
    }
  });
  
  // 刪除特定員工的考勤記錄
  app.delete("/api/attendance/employee/:employeeId", async (req, res) => {
    try {
      const employeeId = parseInt(req.params.employeeId);
      if (isNaN(employeeId)) {
        return res.status(400).json({ message: "Invalid employee ID" });
      }
      
      // 刪除指定員工的所有考勤記錄
      await storage.deleteTemporaryAttendanceByEmployeeId(employeeId);
      res.status(204).end();
    } catch (err) {
      handleError(err, res);
    }
  });

  // Settings routes
  app.get("/api/settings", async (_req, res) => {
    try {
      let settings = await storage.getSettings();
      
      if (!settings) {
        // 當設置不存在時，創建一個預設設置
        const defaultSettings = {
          baseHourlyRate: 119,
          ot1Multiplier: 1.34,
          ot2Multiplier: 1.67,
          baseMonthSalary: 28590,
          welfareAllowance: 0,
          adminPin: "123456", // 預設管理員PIN碼
          deductions: [
            { name: "勞保費", amount: 525, description: "勞工保險費用" },
            { name: "健保費", amount: 372, description: "全民健康保險費用" }
          ]
        };
        
        // 將預設設置存儲到數據庫
        settings = await storage.createOrUpdateSettings(defaultSettings);
        console.log("Created default settings with admin PIN:", defaultSettings.adminPin);
      }
      
      // 返回設置，但不返回管理員PIN碼（出於安全考慮）
      const { adminPin, ...settingsToReturn } = settings;
      
      res.json(settingsToReturn);
    } catch (err) {
      handleError(err, res);
    }
  });

  app.post("/api/settings", async (req, res) => {
    try {
      const validatedData = insertSettingsSchema.parse(req.body);
      const settings = await storage.createOrUpdateSettings(validatedData);
      res.json(settings);
    } catch (err) {
      handleError(err, res);
    }
  });

  // Salary records routes
  app.get("/api/salary-records", async (_req, res) => {
    try {
      const records = await storage.getAllSalaryRecords();
      res.json(records);
    } catch (err) {
      handleError(err, res);
    }
  });

  app.get("/api/salary-records/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID" });
      }

      const record = await storage.getSalaryRecordById(id);
      
      if (!record) {
        return res.status(404).json({ message: "Salary record not found" });
      }
      
      res.json(record);
    } catch (err) {
      handleError(err, res);
    }
  });

  app.post("/api/salary-records", async (req, res) => {
    try {
      // 獲取系統設置以進行薪資計算
      const settings = await storage.getSettings();
      if (!settings) {
        return res.status(500).json({ message: "系統設置未找到，無法計算薪資" });
      }
      
      // 解析並驗證基本資料
      const validatedData = insertSalaryRecordSchema.parse(req.body);
      
      // 使用標準化計算模組來確保正確計算
      const { totalOT1Hours, totalOT2Hours, attendanceData } = validatedData;
      
      // 從導入的計算模組中獲取標準化函數
      // 使用動態導入而非require (避免ESM兼容性問題)
      const salaryCalculator = await import('./utils/salaryCalculator');
      const { calculateSalary } = salaryCalculator;
      
      // 準備薪資計算所需的參數
      const totalDeductions = validatedData.deductions ? 
        validatedData.deductions.reduce((sum, d) => sum + d.amount, 0) : 0;
      
      // 執行標準化薪資計算
      const calculationSettings = {
        baseHourlyRate: settings.baseHourlyRate,
        ot1Multiplier: settings.ot1Multiplier,
        ot2Multiplier: settings.ot2Multiplier,
        baseMonthSalary: settings.baseMonthSalary,
        welfareAllowance: settings.welfareAllowance
      };
      
      const salaryResult = calculateSalary(
        validatedData.salaryYear,
        validatedData.salaryMonth,
        { totalOT1Hours, totalOT2Hours },
        validatedData.baseSalary,
        totalDeductions,
        calculationSettings,
        validatedData.totalHolidayPay || 0,
        validatedData.welfareAllowance,
        validatedData.housingAllowance || 0
      );
      
      // 將計算結果合併到資料中，確保一致性
      const finalData = {
        ...validatedData,
        totalOT1Hours: salaryResult.totalOT1Hours,
        totalOT2Hours: salaryResult.totalOT2Hours,
        totalOvertimePay: salaryResult.totalOvertimePay,
        grossSalary: salaryResult.grossSalary,
        totalDeductions,
        netSalary: salaryResult.netSalary
      };
      
      // 存儲標準化後的薪資記錄
      const record = await storage.createSalaryRecord(finalData);
      res.status(201).json(record);
    } catch (err) {
      handleError(err, res);
    }
  });
  
  app.patch("/api/salary-records/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID" });
      }
      
      // 獲取系統設置以進行薪資計算
      const settings = await storage.getSettings();
      if (!settings) {
        return res.status(500).json({ message: "系統設置未找到，無法更新薪資計算" });
      }
      
      // 獲取現有記錄
      const existingRecord = await storage.getSalaryRecordById(id);
      if (!existingRecord) {
        return res.status(404).json({ message: "Salary record not found" });
      }
      
      // 解析更新資料
      const updateData = req.body;
      
      // 檢查是否有強制更新標誌 (不進行重新計算)
      const forceUpdate = req.headers['x-force-update'] === 'true';
      
      // 如果沒有強制更新且包含加班時數相關欄位，則重新計算薪資
      if (!forceUpdate && (
          updateData.totalOT1Hours !== undefined || 
          updateData.totalOT2Hours !== undefined || 
          updateData.baseSalary !== undefined || 
          updateData.deductions !== undefined ||
          updateData.housingAllowance !== undefined ||
          updateData.welfareAllowance !== undefined ||
          updateData.totalHolidayPay !== undefined)) {
        
        // 從導入的計算模組中獲取標準化函數
        // 使用動態導入而非require (避免ESM兼容性問題)
        const salaryCalculator = await import('./utils/salaryCalculator');
        const { calculateSalary } = salaryCalculator;
        
        // 合併現有資料和更新資料
        const mergedData = {
          ...existingRecord,
          ...updateData
        };
        
        // 準備薪資計算所需的參數
        const totalDeductions = mergedData.deductions ? 
          mergedData.deductions.reduce((sum, d) => sum + d.amount, 0) : 0;
        
        // 執行標準化薪資計算
        const calculationSettings = {
          baseHourlyRate: settings.baseHourlyRate,
          ot1Multiplier: settings.ot1Multiplier,
          ot2Multiplier: settings.ot2Multiplier,
          baseMonthSalary: settings.baseMonthSalary,
          welfareAllowance: settings.welfareAllowance
        };
        
        const salaryResult = calculateSalary(
          mergedData.salaryYear,
          mergedData.salaryMonth,
          { 
            totalOT1Hours: mergedData.totalOT1Hours, 
            totalOT2Hours: mergedData.totalOT2Hours 
          },
          mergedData.baseSalary,
          totalDeductions,
          calculationSettings,
          mergedData.totalHolidayPay || 0,
          mergedData.welfareAllowance,
          mergedData.housingAllowance || 0
        );
        
        // 更新最終計算結果
        updateData.totalOT1Hours = salaryResult.totalOT1Hours;
        updateData.totalOT2Hours = salaryResult.totalOT2Hours;
        updateData.totalOvertimePay = salaryResult.totalOvertimePay;
        updateData.grossSalary = salaryResult.grossSalary;
        updateData.totalDeductions = totalDeductions;
        updateData.netSalary = salaryResult.netSalary;
      }
      
      // 應用更新
      const record = await storage.updateSalaryRecord(id, updateData);
      
      if (!record) {
        return res.status(404).json({ message: "找不到薪資記錄" });
      }
      
      res.json(record);
    } catch (err) {
      handleError(err, res);
    }
  });
  
  app.delete("/api/salary-records/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID" });
      }
      
      const deleted = await storage.deleteSalaryRecord(id);
      
      if (!deleted) {
        return res.status(404).json({ message: "Salary record not found" });
      }
      
      res.status(204).end();
    } catch (err) {
      handleError(err, res);
    }
  });

  // Admin verification
  app.post("/api/verify-admin", async (req, res) => {
    try {
      const { pin } = req.body;
      
      if (!pin) {
        return res.status(400).json({ success: false, message: "PIN is required" });
      }
      
      // 由於剛剛建立新的數據庫，設置可能還沒有初始化
      // 所以這裡先檢查緊急管理員密碼
      const emergencyPin = '000000';
      if (pin === emergencyPin) {
        console.log('使用緊急管理員密碼成功登入');
        return res.json({ success: true });
      }
      
      // 再嘗試從數據庫讀取設置
      try {
        const settings = await storage.getSettings();
        if (settings) {
          const isValid = pin === settings.adminPin;
          return res.json({ success: isValid });
        } else {
          console.log('設置不存在，只能使用緊急密碼');
          return res.json({ success: false });
        }
      } catch (settingsError) {
        console.error('獲取設置時出錯:', settingsError);
        // 數據庫錯誤已通過緊急密碼處理
        return res.json({ success: false });
      }
    } catch (err) {
      handleError(err, res);
    }
  });
  
  app.post("/api/update-admin-pin", async (req, res) => {
    try {
      const { oldPin, newPin } = req.body;
      
      if (!oldPin || !newPin) {
        return res.status(400).json({ success: false, message: "Both old and new PINs are required" });
      }
      
      if (newPin.length !== 6 || !/^\d+$/.test(newPin)) {
        return res.status(400).json({ success: false, message: "New PIN must be a 6-digit number" });
      }
      
      const settings = await storage.getSettings();
      if (!settings) {
        return res.status(404).json({ success: false, message: "Settings not found" });
      }
      
      if (oldPin !== settings.adminPin) {
        return res.status(400).json({ success: false, message: "Current PIN is incorrect" });
      }
      
      // Update the admin PIN
      const updatedSettings = await storage.createOrUpdateSettings({
        ...settings,
        adminPin: newPin
      });
      
      res.json({ success: true });
    } catch (err) {
      handleError(err, res);
    }
  });

  // Holiday routes
  app.get("/api/holidays", async (_req, res) => {
    try {
      const holidays = await storage.getAllHolidays();
      res.json(holidays);
    } catch (err) {
      handleError(err, res);
    }
  });

  app.post("/api/holidays", async (req, res) => {
    try {
      const validatedData = insertHolidaySchema.parse(req.body);
      const holiday = await storage.createHoliday(validatedData);
      res.status(201).json(holiday);
    } catch (err) {
      handleError(err, res);
    }
  });

  app.delete("/api/holidays/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID" });
      }

      const success = await storage.deleteHoliday(id);
      
      if (!success) {
        return res.status(404).json({ message: "Holiday not found" });
      }
      
      res.status(204).end();
    } catch (err) {
      handleError(err, res);
    }
  });

  // 測試薪資計算路由 - 使用標準化計算模組
  app.get("/api/test-salary-calculation", async (_req, res) => {
    try {
      // 獲取設置
      const settings = await storage.getSettings();
      
      if (!settings) {
        return res.status(404).json({ message: "找不到設置" });
      }
      
      // 從導入的計算模組中獲取標準化函數
      // 注意：使用動態導入，因為TypeScript中不能直接用require
      const salaryCalculator = await import('./utils/salaryCalculator');
      const { 
        calculateSalary, 
        calculateOvertimePay, 
        getMonthSpecificOvertimePay,
        getMonthSpecificOvertimeHours
      } = salaryCalculator;
      
      // 使用標準化的計算方法獲取2025年3月的薪資
      const march2025Result = calculateSalary(
        2025,
        3,
        { totalOT1Hours: 40, totalOT2Hours: 21 },
        settings.baseMonthSalary,
        5401, // 3月份扣除項總和: 658 + 443 + 1800 + 2500 = 5401
        settings,
        0, // 無假日工資
        settings.welfareAllowance,
        0 // 無住房補貼
      );
      
      // 使用標準化的計算方法獲取2025年4月的薪資
      const april2025Result = calculateSalary(
        2025,
        4,
        { totalOT1Hours: 42, totalOT2Hours: 13 },
        settings.baseMonthSalary,
        5401, // 4月份扣除項總和: 658 + 443 + 1800 + 2500 = 5401
        settings,
        0, // 無假日工資
        settings.welfareAllowance,
        0 // 無住房補貼
      );
      
      // 執行詳細計算作為參考
      // 使用常規計算方法
      const calculationSettings = {
        baseHourlyRate: settings.baseHourlyRate,
        ot1Multiplier: settings.ot1Multiplier,
        ot2Multiplier: settings.ot2Multiplier,
        baseMonthSalary: settings.baseMonthSalary,
        welfareAllowance: settings.welfareAllowance
      };
      
      // 直接計算正確的加班費 - 3月份
      const marchOvertimeHours = { totalOT1Hours: 40, totalOT2Hours: 21 };
      const marchRawOvertimePay = calculateOvertimePay(marchOvertimeHours, calculationSettings);
      const marchFinalOvertimePay = getMonthSpecificOvertimePay(2025, 3, marchOvertimeHours, marchRawOvertimePay);
      
      // 直接計算正確的加班費 - 4月份
      const aprilOvertimeHours = { totalOT1Hours: 42, totalOT2Hours: 13 };
      const aprilRawOvertimePay = calculateOvertimePay(aprilOvertimeHours, calculationSettings);
      const aprilFinalOvertimePay = getMonthSpecificOvertimePay(2025, 4, aprilOvertimeHours, aprilRawOvertimePay);
      
      // 返回比較結果
      return res.json({
        settings: {
          baseHourlyRate: settings.baseHourlyRate,
          ot1Multiplier: settings.ot1Multiplier,
          ot2Multiplier: settings.ot2Multiplier,
          baseMonthSalary: settings.baseMonthSalary,
          welfareAllowance: settings.welfareAllowance
        },
        
        // 2025年3月份結果
        march2025: {
          ...march2025Result,
          rawOvertimePay: marchRawOvertimePay,
          finalOvertimePay: marchFinalOvertimePay,
          expectedNetSalary: 36248, // 預期的淨薪資 (來自實際文件)
          difference: 36248 - march2025Result.netSalary // 差異
        },
        
        // 2025年4月份結果
        april2025: {
          ...april2025Result,
          rawOvertimePay: aprilRawOvertimePay,
          finalOvertimePay: aprilFinalOvertimePay,
          expectedNetSalary: 35054, // 預期的淨薪資 (來自實際文件)
          difference: 35054 - april2025Result.netSalary // 差異
        },
        
        // 系統備註
        notes: "此路由使用伺服器端標準化薪資計算模組，確保所有計算使用相同的一致方法"
      });
    } catch (err) {
      handleError(err, res);
    }
  });

  // PDF download route
  app.get("/api/salary-records/:id/pdf", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID" });
      }
      
      const record = await storage.getSalaryRecordById(id);
      
      if (!record) {
        return res.status(404).json({ message: "Salary record not found" });
      }
      
      // 在實際應用中，這裡應該生成PDF
      // 由於我們沒有實現完整的PDF生成功能，我們將重定向到打印頁面
      res.redirect(`/print-salary?id=${id}`);
      
    } catch (err) {
      handleError(err, res);
    }
  });

  // 員工管理路由
  app.get("/api/employees", async (_req, res) => {
    try {
      const employees = await storage.getAllEmployees();
      res.json(employees);
    } catch (err) {
      handleError(err, res);
    }
  });

  app.get("/api/employees/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "無效的ID" });
      }

      const employee = await storage.getEmployeeById(id);
      
      if (!employee) {
        return res.status(404).json({ message: "找不到員工" });
      }
      
      res.json(employee);
    } catch (err) {
      handleError(err, res);
    }
  });

  app.post("/api/employees", async (req, res) => {
    try {
      // 先獲取原始請求中的 useEncryption 值
      const useEncryption = req.body.useEncryption === true;
      
      // 然後驗證其餘數據
      const validatedData = insertEmployeeSchema.parse(req.body);
      
      // 加密標記檢查 - 確保 isEncrypted 欄位正確設置
      // 若啟用了加密功能，確認 isEncrypted 標記設為 true
      if (validatedData.idNumber && useEncryption) {
        console.log(`新增員工，ID加密已啟用 ${validatedData.idNumber}`);
        validatedData.isEncrypted = true;
      } else {
        console.log(`新增員工，ID加密未啟用 ${validatedData.idNumber}`);
        validatedData.isEncrypted = false;
      }
      
      const employee = await storage.createEmployee(validatedData);
      res.status(201).json(employee);
    } catch (err) {
      handleError(err, res);
    }
  });

  app.put("/api/employees/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "無效的ID" });
      }

      // 先獲取原始請求中的 useEncryption 值
      const useEncryption = req.body.useEncryption === true;
      
      // 然後驗證其餘數據
      const validatedData = insertEmployeeSchema.partial().parse(req.body);
      
      // 加密標記檢查 - 確保 isEncrypted 欄位正確設置
      // 若啟用了加密功能，確認 isEncrypted 標記設為 true
      if (validatedData.idNumber && useEncryption) {
        console.log(`更新員工，ID加密已啟用 ${validatedData.idNumber}`);
        validatedData.isEncrypted = true;
      } else if ('useEncryption' in req.body) {
        // 只有當明確傳入useEncryption時才更新isEncrypted
        console.log(`更新員工，ID加密未啟用 ${validatedData.idNumber || '(未修改ID)'}`);
        validatedData.isEncrypted = false;
      }
      
      const updatedEmployee = await storage.updateEmployee(id, validatedData);
      
      if (!updatedEmployee) {
        return res.status(404).json({ message: "找不到員工" });
      }
      
      res.json(updatedEmployee);
    } catch (err) {
      handleError(err, res);
    }
  });

  app.delete("/api/employees/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "無效的ID" });
      }

      const success = await storage.deleteEmployee(id);
      
      if (!success) {
        return res.status(404).json({ message: "找不到員工" });
      }
      
      res.status(204).end();
    } catch (err) {
      handleError(err, res);
    }
  });

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
            return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
          })[0];
          
          // 獲取對應的員工信息
          const employee = await storage.getEmployee(latestRecord.employeeId);
          if (employee) {
            // 判斷打卡類型 - 如果沒有下班時間，就是上班打卡；如果有下班時間，就是下班打卡
            const isClockIn = !latestRecord.clockOut || latestRecord.clockOut === '';
            const currentTime = isClockIn ? latestRecord.clockIn : latestRecord.clockOut;
            
            console.log(`[最後掃描結果] 最新記錄: 員工=${employee.name}, 類型=${isClockIn ? '上班' : '下班'}, 上班=${latestRecord.clockIn}, 下班=${latestRecord.clockOut || '未打卡'}`);
            
            // 構建結果對象，使用實際的打卡時間
            const result = {
              employeeId: latestRecord.employeeId,
              employeeName: employee.name,
              department: employee.department || '未知部門',
              idNumber: employee.idNumber || '',
              action: isClockIn ? 'clock-in' : 'clock-out',
              isClockIn: isClockIn,
              attendance: latestRecord,
              success: true,
              timestamp: new Date().toISOString(), // 使用當前時間作為時間戳
              message: `${employee.name} ${isClockIn ? '上班' : '下班'}打卡成功`,
              clockTime: currentTime
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
          // 設置 500 毫秒超時 - 顯著降低超時時間提高響應速度
          const timeout = setTimeout(() => {
            console.log("員工查找超時優化，嘗試使用緩存");
            // 優先檢查緩存
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
            
            // 緩存未命中時使用最後一次成功的員工數據
            try {
              const lastScannedEmployee = employeeCache.get('last_scanned_employee');
              if (lastScannedEmployee) {
                console.log("使用最後一次掃描的員工數據作為備用");
                resolve(lastScannedEmployee);
                return;
              }
            } catch {}
            
            reject(new Error('查找員工超時'));
          }, 800); // 從3秒減少到800毫秒，響應更快
          
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
      
      // 我們將員工查找異步進行，但不等待其完成
      findEmployeePromise = findEmployeeWithTimeout();
      
      // 先立即向用戶返回處理中的響應
      const processingResponse = {
        success: true,
        inProgress: true,
        message: "正在處理打卡請求，請稍候...",
        timestamp: now.toISOString()
      };
      
      // 發送處理中的響應
      res.json(processingResponse);
      
      // 後台繼續處理
      (async () => {
        try {
          // 等待員工查找完成
          const employee = await findEmployeePromise;
          
          if (!employee) {
            console.log(`找不到匹配的員工，ID: ${idNumber}`);
            // 在伺服器端記錄錯誤
            console.error("找不到匹配的員工，請確認條碼資料正確");
            return;
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
            
            // 獲取更詳細的員工信息
            let employeeWithDetails = employee;
            try {
              // 嘗試獲取完整的員工信息
              if (employee && employee.id) {
                try {
                  const fullEmployeeInfo = await storage.getEmployeeById(employee.id);
                  if (fullEmployeeInfo) {
                    employeeWithDetails = fullEmployeeInfo;
                    console.log(`[詳細信息] 成功獲取員工完整資料: ${employeeWithDetails.name}, 部門: ${employeeWithDetails.department || '未指定'}`);
                  }
                } catch (detailError) {
                  console.error("[詳細信息] 查詢錯誤，使用基本信息:", detailError.message);
                }
              } else {
                console.error("[詳細信息] 員工ID無效，無法獲取詳細信息");
              }
            } catch (err) {
              console.error("獲取詳細員工信息時出錯:", err);
              // 繼續使用現有的員工信息
            }
            
            // 在伺服器端追蹤打卡狀態 (替代前端的 EventBus)
            // 使用前面已定義的 actionType 變數
            
            // 輸出更詳細的打卡狀態日誌
            console.log(`[打卡狀態] 員工: ${employeeWithDetails.name}, 打卡類型: ${isClockIn ? '上班' : '下班'}, 動作: ${actionType}`);
            
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
            
          } catch (err) {
            console.error("處理打卡記錄時出錯:", err);
            
            // 在伺服器端記錄打卡失敗
            console.error(`打卡失敗: ${employee?.name || '未知員工'}, 錯誤: ${err.message}`);
          }
        } catch (error) {
          console.error("打卡後台處理過程中出錯:", error);
          
          // 在伺服器端記錄處理錯誤
          console.error(`打卡處理過程中錯誤: ${error.message}`);
        }
      })();
      
    } catch (err) {
      console.error('條碼掃描打卡錯誤:', err);
      
      // 如果已經開始響應，則記錄錯誤
      if (findEmployeePromise) {
        console.error(`打卡處理失敗: ${err.message}`);
      } else {
        // 否則直接返回錯誤
        handleError(err, res);
      }
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

  // Supabase configuration and management routes
  // 數據庫狀態檢查端點
  app.get("/api/db-status", async (_req, res) => {
    try {
      // 檢查當前使用的數據庫
      const isSupabase = isUsingSupabase();
      
      // 檢查 Supabase 連接狀態
      const supabaseConnection = await checkSupabaseConnection();
      
      // 檢查 PostgreSQL 連接狀態
      let postgresConnection = false;
      try {
        await db.execute('SELECT 1');
        postgresConnection = true;
      } catch (e) {
        console.error('PostgreSQL 連接測試失敗:', e);
      }
      
      res.json({
        currentStorage: isSupabase ? 'Supabase' : 'PostgreSQL',
        environment: {
          USE_SUPABASE: process.env.USE_SUPABASE || 'not set'
        },
        connections: {
          postgres: postgresConnection,
          supabase: supabaseConnection
        }
      });
    } catch (err) {
      handleError(err, res);
    }
  });

  app.get("/api/supabase-config", async (_req, res) => {
    try {
      const config = await getSupabaseConfig();
      // 為了安全原因，我們遮蔽 key 的值（只顯示前 5 個字符）
      const safeConfig = {
        url: config.url,
        key: config.key ? `${config.key.substring(0, 5)}...` : '',
        isConfigured: !!(config.url && config.key),
        isActive: isUsingSupabase()
      };
      res.json(safeConfig);
    } catch (err) {
      handleError(err, res);
    }
  });

  app.post("/api/supabase-config", async (req, res) => {
    try {
      const { url, key } = req.body;
      
      if (!url || !key) {
        return res.status(400).json({ 
          success: false, 
          message: "URL 和密鑰都是必需的" 
        });
      }
      
      await saveSupabaseConfig(url, key);
      
      // 初始化數據庫並嘗試連接
      const { useSupabase } = await initializeDatabase();
      
      res.json({ 
        success: true, 
        message: "Supabase 配置已成功保存", 
        isActive: useSupabase
      });
    } catch (err) {
      handleError(err, res);
    }
  });
  
  // 檢查 Supabase 連接
  app.get("/api/supabase-connection", async (_req, res) => {
    try {
      const connectionStatus = await checkSupabaseConnection();
      res.json({ 
        success: true, 
        isConnected: connectionStatus.isConnected,
        errorMessage: connectionStatus.errorMessage,
        isActive: isUsingSupabase()
      });
    } catch (err) {
      handleError(err, res);
    }
  });
  
  // 切換數據存儲實現（PostgreSQL 或 Supabase）
  app.post("/api/supabase-toggle", async (req, res) => {
    try {
      const { enable, adminPin } = req.body;
      
      // 檢查 enable 是否是一個布爾值
      if (typeof enable !== 'boolean') {
        return res.status(400).json({ 
          success: false, 
          message: "請提供有效的 enable 參數（布爾值）" 
        });
      }
      
      // 如果禁用 Supabase（切換到 PostgreSQL），需要管理員驗證
      if (!enable) {
        // 驗證管理員密碼
        if (!adminPin || adminPin.trim() === '') {
          return res.status(401).json({
            success: false,
            message: "切換到本地數據庫需要管理員密碼驗證"
          });
        }
        
        // 從數據庫獲取設置以驗證 PIN
        let settings;
        try {
          const settingsFromDb = await storage.getSettings();
          settings = settingsFromDb || { adminPin: "123456" }; // 默認 PIN
        } catch (error) {
          console.error("獲取設置時出錯:", error);
          settings = { adminPin: "123456" }; // 備用 PIN
        }
        
        // 驗證 PIN 是否正確
        if (settings.adminPin !== adminPin) {
          return res.status(401).json({
            success: false,
            message: "管理員密碼不正確，無法切換數據庫"
          });
        }
      }
      
      // 如果啟用 Supabase，先檢查連接
      if (enable) {
        const connectionStatus = await checkSupabaseConnection();
        if (!connectionStatus.isConnected) {
          return res.status(400).json({ 
            success: false, 
            message: `無法連接到 Supabase：${connectionStatus.errorMessage || '請檢查URL和API Key是否正確'}`
          });
        }
        enableSupabase();
      } else {
        disableSupabase();
      }
      
      res.json({ 
        success: true, 
        message: enable ? "已切換到 Supabase 存儲" : "已切換到 PostgreSQL 存儲",
        isActive: isUsingSupabase()
      });
    } catch (err) {
      handleError(err, res);
    }
  });
  
  // 將數據遷移到 Supabase
  app.post("/api/supabase-migrate", async (_req, res) => {
    try {
      // 檢查 Supabase 連接狀態
      const connectionStatus = await checkSupabaseConnection();
      if (!connectionStatus.isConnected) {
        return res.status(400).json({
          success: false,
          message: `無法連接到 Supabase：${connectionStatus.errorMessage || '請檢查URL和API Key是否正確'}`
        });
      }
      
      // 使用 child_process 啟動遷移腳本，確保環境變數正確傳遞
      const migration = spawn('node', ['migrate-to-supabase.cjs'], {
        env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL }
      });
      
      let output = '';
      let errorOutput = '';
      
      migration.stdout.on('data', (data: Buffer) => {
        const text = data.toString();
        output += text;
        console.log(`遷移輸出: ${text}`);
      });
      
      migration.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        errorOutput += text;
        console.error(`遷移錯誤: ${text}`);
      });
      
      migration.on('close', (code: number) => {
        if (code === 0) {
          // 成功完成
          enableSupabase(); // 自動切換到 Supabase 存儲
          res.json({
            success: true,
            message: "數據遷移成功完成，已切換到 Supabase 存儲",
            details: output,
            isActive: true
          });
        } else {
          res.status(500).json({
            success: false,
            message: "遷移過程中發生錯誤",
            details: errorOutput || "未知錯誤"
          });
        }
      });
    } catch (err) {
      handleError(err, res);
    }
  });

  // CSV 匯入相關路由 - 處理考勤記錄匯入
  app.post("/api/admin/import/attendance", async (req, res) => {
    try {
      // 驗證管理員權限
      if (!req.body.adminVerified && !req.query.adminVerified) {
        return res.status(403).json({ success: false, message: "需要管理員權限才能匯入資料" });
      }

      // 解析CSV檔案內容
      const csvContent = req.body.csvContent;
      if (!csvContent) {
        return res.status(400).json({ success: false, message: "未提供CSV內容" });
      }

      const lines = csvContent.split('\n');
      if (lines.length < 2) {
        return res.status(400).json({ success: false, message: "CSV檔案格式不正確或內容為空" });
      }

      // 解析標題行
      const headers = lines[0].split(',');
      const dateIndex = headers.findIndex(h => h.trim() === '日期');
      const clockInIndex = headers.findIndex(h => h.trim() === '上班時間');
      const clockOutIndex = headers.findIndex(h => h.trim() === '下班時間');
      const isHolidayIndex = headers.findIndex(h => h.trim() === '是否假日');
      
      if (dateIndex === -1 || clockInIndex === -1 || clockOutIndex === -1) {
        return res.status(400).json({ 
          success: false, 
          message: "CSV檔案格式不正確，缺少必要欄位 (日期、上班時間、下班時間)"
        });
      }

      // 解析並匯入考勤記錄
      const results = {
        success: true,
        totalRecords: 0,
        successCount: 0,
        failCount: 0,
        errors: []
      };

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const fields = line.split(',');
        if (fields.length <= Math.max(dateIndex, clockInIndex, clockOutIndex)) {
          results.errors.push(`第 ${i+1} 行: 欄位數量不足`);
          results.failCount++;
          continue;
        }

        const date = fields[dateIndex].trim();
        const clockIn = fields[clockInIndex].trim();
        const clockOut = fields[clockOutIndex].trim();
        const isHoliday = isHolidayIndex !== -1 ? 
          fields[isHolidayIndex].trim() === '是' || fields[isHolidayIndex].trim() === 'true' : 
          false;

        try {
          // 檢查日期和時間格式
          if (!/^\d{4}[-\/](0?[1-9]|1[012])[-\/](0?[1-9]|[12][0-9]|3[01])$/.test(date)) {
            throw new Error(`日期格式不正確: ${date}`);
          }

          if (!/^([01]?[0-9]|2[0-3]):([0-5][0-9])$/.test(clockIn)) {
            throw new Error(`上班時間格式不正確: ${clockIn}`);
          }

          if (!/^([01]?[0-9]|2[0-3]):([0-5][0-9])$/.test(clockOut)) {
            throw new Error(`下班時間格式不正確: ${clockOut}`);
          }

          // 添加考勤記錄
          await storage.createTemporaryAttendance({
            date,
            clockIn,
            clockOut,
            isHoliday
          });

          results.successCount++;
        } catch (error) {
          results.errors.push(`第 ${i+1} 行: ${error.message}`);
          results.failCount++;
        }

        results.totalRecords++;
      }

      return res.json({
        success: true,
        message: `匯入完成: 成功 ${results.successCount} 筆，失敗 ${results.failCount} 筆`,
        ...results
      });
    } catch (err) {
      console.error("匯入考勤記錄時出錯:", err);
      handleError(err, res);
    }
  });

  // CSV 匯入相關路由 - 處理完整薪資記錄匯入
  app.post("/api/admin/import/salary-record", async (req, res) => {
    try {
      // 驗證管理員權限
      if (!req.body.adminVerified && !req.query.adminVerified) {
        return res.status(403).json({ success: false, message: "需要管理員權限才能匯入資料" });
      }

      // 解析CSV檔案內容
      const csvContent = req.body.csvContent;
      if (!csvContent) {
        return res.status(400).json({ success: false, message: "未提供CSV內容" });
      }

      const lines = csvContent.split('\n');
      if (lines.length < 2) {
        return res.status(400).json({ success: false, message: "CSV檔案格式不正確或內容為空" });
      }

      // 解析標題行
      const headers = lines[0].split(',');
      const yearIndex = headers.findIndex(h => h.trim() === '薪資年份');
      const monthIndex = headers.findIndex(h => h.trim() === '薪資月份');
      const baseSalaryIndex = headers.findIndex(h => h.trim() === '基本底薪');
      
      if (yearIndex === -1 || monthIndex === -1 || baseSalaryIndex === -1) {
        return res.status(400).json({ 
          success: false, 
          message: "CSV檔案格式不正確，缺少必要欄位 (薪資年份、薪資月份、基本底薪)"
        });
      }

      // 解析薪資記錄
      const dataRow = lines[1].split(',');
      const year = parseInt(dataRow[yearIndex], 10);
      const month = parseInt(dataRow[monthIndex], 10);
      
      if (isNaN(year) || isNaN(month)) {
        return res.status(400).json({ 
          success: false, 
          message: "薪資年份或月份格式不正確"
        });
      }

      // 查找考勤資料區段
      let attendanceHeaderIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('考勤詳細記錄')) {
          attendanceHeaderIndex = i + 1; // 考勤標題行的索引
          break;
        }
      }

      if (attendanceHeaderIndex === -1 || attendanceHeaderIndex >= lines.length) {
        return res.status(400).json({ 
          success: false, 
          message: "CSV檔案格式不正確，找不到考勤詳細記錄區段"
        });
      }

      // 解析考勤標題行
      const attendanceHeaders = lines[attendanceHeaderIndex].split(',');
      const dateIndex = attendanceHeaders.findIndex(h => h.trim() === '日期');
      const clockInIndex = attendanceHeaders.findIndex(h => h.trim() === '上班時間');
      const clockOutIndex = attendanceHeaders.findIndex(h => h.trim() === '下班時間');
      const isHolidayIndex = attendanceHeaders.findIndex(h => h.trim() === '是否假日');
      
      if (dateIndex === -1 || clockInIndex === -1 || clockOutIndex === -1) {
        return res.status(400).json({ 
          success: false, 
          message: "考勤記錄格式不正確，缺少必要欄位"
        });
      }

      // 解析考勤記錄
      const attendanceData = [];
      for (let i = attendanceHeaderIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const fields = line.split(',');
        if (fields.length <= Math.max(dateIndex, clockInIndex, clockOutIndex)) continue;

        const date = fields[dateIndex].trim();
        const clockIn = fields[clockInIndex].trim();
        const clockOut = fields[clockOutIndex].trim();
        const isHoliday = isHolidayIndex !== -1 ? 
          fields[isHolidayIndex].trim() === '是' || fields[isHolidayIndex].trim() === 'true' : 
          false;

        // 檢查必要欄位是否存在
        if (!date || !clockIn || !clockOut) continue;

        attendanceData.push({
          date,
          clockIn,
          clockOut,
          isHoliday
        });
      }

      // 檢查考勤記錄是否為空
      if (attendanceData.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: "沒有有效的考勤記錄可匯入"
        });
      }

      // 查找扣除項目區段
      let deductionHeaderIndex = -1;
      for (let i = 2; i < attendanceHeaderIndex; i++) {
        if (lines[i].includes('扣除項目')) {
          deductionHeaderIndex = i;
          break;
        }
      }

      // 解析扣除項目
      const deductions = [];
      if (deductionHeaderIndex !== -1) {
        for (let i = deductionHeaderIndex + 1; i < attendanceHeaderIndex; i++) {
          const line = lines[i].trim();
          if (!line || line.includes('考勤詳細記錄')) break;

          const fields = line.split(',');
          if (fields.length < 2) continue;

          const name = fields[0].trim();
          const amount = parseInt(fields[1].trim(), 10);
          
          if (name && !isNaN(amount)) {
            deductions.push({ name, amount });
          }
        }
      }

      // 構建薪資記錄對象
      const housingAllowanceIndex = headers.findIndex(h => h.trim() === '住宿津貼');
      const welfareAllowanceIndex = headers.findIndex(h => h.trim() === '福利津貼');
      const ot1HoursIndex = headers.findIndex(h => h.trim() === '加班總時數OT1');
      const ot2HoursIndex = headers.findIndex(h => h.trim() === '加班總時數OT2');
      const overtimePayIndex = headers.findIndex(h => h.trim() === '加班總費用');
      const holidayDaysIndex = headers.findIndex(h => h.trim() === '假日天數');
      const holidayPayIndex = headers.findIndex(h => h.trim() === '假日總薪資');
      const grossSalaryIndex = headers.findIndex(h => h.trim() === '總薪資');
      const totalDeductionsIndex = headers.findIndex(h => h.trim() === '總扣除額');
      const netSalaryIndex = headers.findIndex(h => h.trim() === '實領金額');

      const salaryRecord = {
        salaryYear: year,
        salaryMonth: month,
        baseSalary: parseInt(dataRow[baseSalaryIndex], 10) || 0,
        housingAllowance: housingAllowanceIndex !== -1 ? parseInt(dataRow[housingAllowanceIndex], 10) || 0 : 0,
        welfareAllowance: welfareAllowanceIndex !== -1 ? parseInt(dataRow[welfareAllowanceIndex], 10) || 0 : 0,
        totalOT1Hours: ot1HoursIndex !== -1 ? parseFloat(dataRow[ot1HoursIndex]) || 0 : 0,
        totalOT2Hours: ot2HoursIndex !== -1 ? parseFloat(dataRow[ot2HoursIndex]) || 0 : 0,
        totalOvertimePay: overtimePayIndex !== -1 ? parseInt(dataRow[overtimePayIndex], 10) || 0 : 0,
        holidayDays: holidayDaysIndex !== -1 ? parseInt(dataRow[holidayDaysIndex], 10) || 0 : 0,
        holidayDailySalary: 0, // 將在下方計算
        totalHolidayPay: holidayPayIndex !== -1 ? parseInt(dataRow[holidayPayIndex], 10) || 0 : 0,
        grossSalary: grossSalaryIndex !== -1 ? parseInt(dataRow[grossSalaryIndex], 10) || 0 : 0,
        deductions: deductions,
        totalDeductions: totalDeductionsIndex !== -1 ? parseInt(dataRow[totalDeductionsIndex], 10) || 0 : 0,
        netSalary: netSalaryIndex !== -1 ? parseInt(dataRow[netSalaryIndex], 10) || 0 : 0,
        attendanceData: attendanceData
      };

      // 計算假日單日薪資
      if (salaryRecord.holidayDays > 0 && salaryRecord.totalHolidayPay > 0) {
        salaryRecord.holidayDailySalary = Math.ceil(salaryRecord.totalHolidayPay / salaryRecord.holidayDays);
      }

      // 檢查是否已存在相同年月的薪資記錄
      const existingRecord = await storage.getSalaryRecordByYearMonth(year, month);
      let result;
      
      if (existingRecord) {
        // 更新現有記錄
        result = await storage.updateSalaryRecord(existingRecord.id, salaryRecord);
        return res.json({
          success: true,
          message: `成功更新 ${year}年${month}月 的薪資記錄，包含 ${attendanceData.length} 筆考勤記錄`,
          record: result
        });
      } else {
        // 創建新記錄
        result = await storage.createSalaryRecord(salaryRecord);
        return res.json({
          success: true,
          message: `成功匯入 ${year}年${month}月 的薪資記錄，包含 ${attendanceData.length} 筆考勤記錄`,
          record: result
        });
      }
    } catch (err) {
      console.error("匯入薪資記錄時出錯:", err);
      handleError(err, res);
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
