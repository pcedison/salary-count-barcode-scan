import { pgTable, text, serial, integer, boolean, timestamp, json, doublePrecision, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Original users table (kept for reference)
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Employee table for barcode scanning
export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  idNumber: text("id_number").notNull().unique(), // 身分證字號或居留證號碼（條碼ID）
  isEncrypted: boolean("is_encrypted").default(false), // 標記ID是否已加密
  position: text("position"), // 職位
  department: text("department"), // 部門
  email: text("email"),
  phone: text("phone"),
  active: boolean("active").default(true), // 員工是否在職
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEmployeeSchema = createInsertSchema(employees)
  .omit({ id: true, createdAt: true });

export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employees.$inferSelect;

// Temporary attendance records
export const temporaryAttendance = pgTable("temporary_attendance", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id"), // 關聯到員工資料表的ID (可為空，兼容舊系統)
  date: text("date").notNull(),
  clockIn: text("clock_in").notNull(),
  clockOut: text("clock_out").default(''), // 允許下班時間為空，方便分開記錄上下班
  isHoliday: boolean("is_holiday").default(false),
  isBarcodeScanned: boolean("is_barcode_scanned").default(false), // 標記是否通過條碼掃描錄入
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTemporaryAttendanceSchema = createInsertSchema(temporaryAttendance)
  .omit({ id: true, createdAt: true });

export type InsertTemporaryAttendance = z.infer<typeof insertTemporaryAttendanceSchema>;
export type TemporaryAttendance = typeof temporaryAttendance.$inferSelect;

// Salary calculation settings
export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  baseHourlyRate: doublePrecision("base_hourly_rate").notNull().default(119),
  ot1Multiplier: doublePrecision("ot1_multiplier").notNull().default(1.34),
  ot2Multiplier: doublePrecision("ot2_multiplier").notNull().default(1.67),
  baseMonthSalary: doublePrecision("base_month_salary").notNull().default(28590),
  welfareAllowance: doublePrecision("welfare_allowance").notNull().default(0),
  deductions: json("deductions").$type<{ name: string; amount: number; description: string }[]>().default([]),
  adminPin: text("admin_pin").notNull().default("123456"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSettingsSchema = createInsertSchema(settings)
  .omit({ id: true, updatedAt: true });

export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settings.$inferSelect;

// Finalized salary records
export const salaryRecords = pgTable("salary_records", {
  id: serial("id").primaryKey(),
  salaryYear: integer("salary_year").notNull(),
  salaryMonth: integer("salary_month").notNull(),
  employeeId: integer("employee_id"), // 員工ID欄位
  employeeName: text("employee_name"), // 員工姓名欄位
  baseSalary: doublePrecision("base_salary").notNull(),
  housingAllowance: doublePrecision("housing_allowance").default(0),
  welfareAllowance: doublePrecision("welfare_allowance").default(0),
  totalOT1Hours: doublePrecision("total_ot1_hours").default(0),
  totalOT2Hours: doublePrecision("total_ot2_hours").default(0),
  totalOvertimePay: doublePrecision("total_overtime_pay").default(0),
  holidayDays: integer("holiday_days").default(0),
  holidayDailySalary: doublePrecision("holiday_daily_salary").default(0),
  totalHolidayPay: doublePrecision("total_holiday_pay").default(0),
  grossSalary: doublePrecision("gross_salary").notNull(),
  deductions: json("deductions").$type<{ name: string; amount: number }[]>().default([]),
  totalDeductions: doublePrecision("total_deductions").default(0),
  netSalary: doublePrecision("net_salary").notNull(),
  attendanceData: json("attendance_data").$type<TemporaryAttendance[]>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSalaryRecordSchema = createInsertSchema(salaryRecords)
  .omit({ id: true, createdAt: true });

export type InsertSalaryRecord = z.infer<typeof insertSalaryRecordSchema>;
export type SalaryRecord = typeof salaryRecords.$inferSelect;

// Holiday settings
export const holidays = pgTable("holidays", {
  id: serial("id").primaryKey(),
  date: text("date").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertHolidaySchema = createInsertSchema(holidays)
  .omit({ id: true, createdAt: true });

export type InsertHoliday = z.infer<typeof insertHolidaySchema>;
export type Holiday = typeof holidays.$inferSelect;

// 特殊薪資計算規則
export const calculationRules = pgTable("calculation_rules", {
  id: serial("id").primaryKey(),
  
  // 規則版本和識別
  ruleKey: varchar("rule_key", { length: 50 }).notNull().unique(), // 規則識別碼，例如 "2025-4-陳文山"
  version: varchar("version", { length: 20 }).notNull(), // 規則版本，例如 "2025.4.1"
  
  // 規則適用條件
  year: integer("year").notNull(), // 適用年份
  month: integer("month").notNull(), // 適用月份
  employeeId: integer("employee_id"), // 適用員工ID (可選)
  
  // 匹配條件
  totalOT1Hours: doublePrecision("total_ot1_hours").notNull(), // 匹配的第一階段加班時數
  totalOT2Hours: doublePrecision("total_ot2_hours").notNull(), // 匹配的第二階段加班時數
  baseSalary: doublePrecision("base_salary").notNull(), // 匹配的基本薪資
  welfareAllowance: doublePrecision("welfare_allowance"), // 匹配的福利津貼 (可選)
  housingAllowance: doublePrecision("housing_allowance"), // 匹配的住房津貼 (可選)
  
  // 特殊規則結果
  totalOvertimePay: doublePrecision("total_overtime_pay").notNull(), // 指定加班費金額
  grossSalary: doublePrecision("gross_salary").notNull(), // 指定總薪資金額
  netSalary: doublePrecision("net_salary").notNull(), // 指定淨薪資金額
  
  // 附加資訊
  description: text("description"), // 規則描述
  createdBy: varchar("created_by", { length: 50 }), // 創建人員
  createdAt: timestamp("created_at").defaultNow(), // 創建時間
  updatedAt: timestamp("updated_at").defaultNow(), // 更新時間
  isActive: boolean("is_active").default(true), // 規則是否生效
});

export const insertCalculationRuleSchema = createInsertSchema(calculationRules)
  .omit({ id: true, createdAt: true, updatedAt: true });

export type InsertCalculationRule = z.infer<typeof insertCalculationRuleSchema>;
export type CalculationRule = typeof calculationRules.$inferSelect;
