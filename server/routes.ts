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
      const attendanceRecords = await storage.getTemporaryAttendance();
      
      // 為了顯示員工資訊，我們需要獲取所有員工數據
      const employees = await storage.getAllEmployees();
      
      // 將員工信息添加到考勤記錄中
      const enhancedRecords = attendanceRecords.map(record => {
        // 如果有 employeeId，則查找相應的員工信息
        if (record.employeeId) {
          const employee = employees.find(emp => emp.id === record.employeeId);
          if (employee) {
            return {
              ...record,
              _employeeName: employee.name,
              _employeeDepartment: employee.department
            };
          }
        }
        return record;
      });
      
      res.json(enhancedRecords);
    } catch (err) {
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

  // 條碼掃描打卡路由
  app.post("/api/barcode-scan", async (req, res) => {
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
        console.log(`找不到匹配的員工，ID: ${idNumber}`);
        return res.status(404).json({
          success: false,
          message: "找不到匹配的員工，請確認條碼資料正確"
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
          message: "打卡失敗，請稍後再試"
        });
      }
      
      res.json({
        success: true,
        attendance: result,
        message: `${isClockIn ? '上班' : '下班'}打卡成功`,
        action: isClockIn ? 'clock-in' : 'clock-out',
        employee: employee
      });
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
