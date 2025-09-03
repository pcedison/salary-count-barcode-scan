// 遷移到新 Supabase 專案的完整流程
const fs = require('fs');
const postgres = require('postgres');

// 讀取備份資料
function loadBackupData() {
  const backupFiles = fs.readdirSync('.').filter(f => f.startsWith('neon-backup-') && f.endsWith('.json'));
  if (backupFiles.length === 0) {
    throw new Error('找不到備份檔案');
  }
  
  const latestBackup = backupFiles.sort().pop();
  console.log(`載入備份檔案: ${latestBackup}`);
  
  const backupData = JSON.parse(fs.readFileSync(latestBackup, 'utf8'));
  return backupData;
}

// 測試新 Supabase 連接
async function testSupabaseConnection(connectionUrl) {
  console.log('測試 Supabase 連接...');
  
  try {
    const sql = postgres(connectionUrl, {
      ssl: 'require',
      connect_timeout: 10,
      max: 1
    });
    
    const result = await sql`SELECT current_database(), current_user, version()`;
    console.log(`✅ 連接成功 - 資料庫: ${result[0].current_database}, 用戶: ${result[0].current_user}`);
    
    await sql.end();
    return true;
  } catch (error) {
    console.error(`❌ 連接失敗: ${error.message}`);
    return false;
  }
}

// 建立資料庫結構
async function createDatabaseSchema(sql) {
  console.log('建立資料庫結構...');
  
  try {
    // 建立 users 表
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL
      )
    `;
    
    // 建立 employees 表
    await sql`
      CREATE TABLE IF NOT EXISTS employees (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        "idNumber" VARCHAR(255) NOT NULL,
        department VARCHAR(255),
        position VARCHAR(255),
        "isActive" BOOLEAN DEFAULT true
      )
    `;
    
    // 建立 settings 表
    await sql`
      CREATE TABLE IF NOT EXISTS settings (
        id SERIAL PRIMARY KEY,
        "baseHourlyRate" INTEGER NOT NULL,
        "ot1Multiplier" DECIMAL(3,2) NOT NULL,
        "ot2Multiplier" DECIMAL(3,2) NOT NULL,
        "laborInsurance" DECIMAL(5,4) NOT NULL,
        "healthInsurance" DECIMAL(5,4) NOT NULL,
        "welfareAllowance" INTEGER NOT NULL,
        "housingAllowance" INTEGER NOT NULL
      )
    `;
    
    // 建立 salary_records 表
    await sql`
      CREATE TABLE IF NOT EXISTS salary_records (
        id SERIAL PRIMARY KEY,
        "employeeId" INTEGER NOT NULL,
        "employeeName" VARCHAR(255) NOT NULL,
        "salaryYear" INTEGER NOT NULL,
        "salaryMonth" INTEGER NOT NULL,
        "totalWorkHours" DECIMAL(10,2) NOT NULL,
        "regularHours" DECIMAL(10,2) NOT NULL,
        "ot1Hours" DECIMAL(10,2) NOT NULL,
        "ot2Hours" DECIMAL(10,2) NOT NULL,
        "totalSalary" INTEGER NOT NULL,
        "laborInsuranceDeduction" INTEGER NOT NULL,
        "healthInsuranceDeduction" INTEGER NOT NULL,
        "welfareAllowance" INTEGER NOT NULL,
        "housingAllowance" INTEGER NOT NULL,
        "netSalary" INTEGER NOT NULL,
        "createdAt" TIMESTAMP DEFAULT NOW()
      )
    `;
    
    // 建立 holidays 表
    await sql`
      CREATE TABLE IF NOT EXISTS holidays (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL
      )
    `;
    
    // 建立 temporary_attendance 表
    await sql`
      CREATE TABLE IF NOT EXISTS temporary_attendance (
        id SERIAL PRIMARY KEY,
        "employeeId" INTEGER NOT NULL,
        "employeeName" VARCHAR(255) NOT NULL,
        date DATE NOT NULL,
        "startTime" TIME,
        "endTime" TIME,
        "lunchBreakMinutes" INTEGER DEFAULT 60,
        "totalWorkHours" DECIMAL(10,2),
        "regularHours" DECIMAL(10,2),
        "ot1Hours" DECIMAL(10,2),
        "ot2Hours" DECIMAL(10,2),
        "isHoliday" BOOLEAN DEFAULT false,
        notes TEXT,
        "createdAt" TIMESTAMP DEFAULT NOW()
      )
    `;
    
    console.log('✅ 資料庫結構建立完成');
    return true;
  } catch (error) {
    console.error(`❌ 建立資料庫結構失敗: ${error.message}`);
    return false;
  }
}

// 匯入資料
async function importData(sql, backupData) {
  console.log('開始匯入資料...');
  
  try {
    const { tables } = backupData;
    
    // 匯入 settings
    if (tables.settings && tables.settings.length > 0) {
      console.log('匯入系統設定...');
      for (const setting of tables.settings) {
        await sql`
          INSERT INTO settings (
            "baseHourlyRate", "ot1Multiplier", "ot2Multiplier", 
            "laborInsurance", "healthInsurance", "welfareAllowance", "housingAllowance"
          ) VALUES (
            ${setting.baseHourlyRate}, ${setting.ot1Multiplier}, ${setting.ot2Multiplier},
            ${setting.laborInsurance}, ${setting.healthInsurance}, ${setting.welfareAllowance}, ${setting.housingAllowance}
          )
        `;
      }
      console.log(`✅ 匯入 ${tables.settings.length} 個系統設定`);
    }
    
    // 匯入 employees
    if (tables.employees && tables.employees.length > 0) {
      console.log('匯入員工資料...');
      for (const employee of tables.employees) {
        await sql`
          INSERT INTO employees (
            id, name, "idNumber", department, position, "isActive"
          ) VALUES (
            ${employee.id}, ${employee.name}, ${employee.idNumber}, 
            ${employee.department}, ${employee.position}, ${employee.isActive}
          )
        `;
      }
      console.log(`✅ 匯入 ${tables.employees.length} 位員工`);
    }
    
    // 匯入 salary_records (關鍵資料)
    if (tables.salary_records && tables.salary_records.length > 0) {
      console.log('匯入薪資記錄...');
      for (const record of tables.salary_records) {
        await sql`
          INSERT INTO salary_records (
            id, "employeeId", "employeeName", "salaryYear", "salaryMonth",
            "totalWorkHours", "regularHours", "ot1Hours", "ot2Hours",
            "totalSalary", "laborInsuranceDeduction", "healthInsuranceDeduction",
            "welfareAllowance", "housingAllowance", "netSalary"
          ) VALUES (
            ${record.id}, ${record.employeeId}, ${record.employeeName}, 
            ${record.salaryYear}, ${record.salaryMonth}, ${record.totalWorkHours},
            ${record.regularHours}, ${record.ot1Hours}, ${record.ot2Hours},
            ${record.totalSalary}, ${record.laborInsuranceDeduction}, ${record.healthInsuranceDeduction},
            ${record.welfareAllowance}, ${record.housingAllowance}, ${record.netSalary}
          )
        `;
      }
      console.log(`✅ 匯入 ${tables.salary_records.length} 筆薪資記錄`);
    }
    
    // 匯入 holidays
    if (tables.holidays && tables.holidays.length > 0) {
      console.log('匯入假日設定...');
      for (const holiday of tables.holidays) {
        await sql`
          INSERT INTO holidays (id, date, name, type) 
          VALUES (${holiday.id}, ${holiday.date}, ${holiday.name}, ${holiday.type})
        `;
      }
      console.log(`✅ 匯入 ${tables.holidays.length} 個假日設定`);
    }
    
    // 匯入 temporary_attendance
    if (tables.temporary_attendance && tables.temporary_attendance.length > 0) {
      console.log('匯入考勤記錄...');
      for (const attendance of tables.temporary_attendance) {
        await sql`
          INSERT INTO temporary_attendance (
            id, "employeeId", "employeeName", date, "startTime", "endTime",
            "lunchBreakMinutes", "totalWorkHours", "regularHours", "ot1Hours", "ot2Hours",
            "isHoliday", notes
          ) VALUES (
            ${attendance.id}, ${attendance.employeeId}, ${attendance.employeeName},
            ${attendance.date}, ${attendance.startTime}, ${attendance.endTime},
            ${attendance.lunchBreakMinutes}, ${attendance.totalWorkHours}, ${attendance.regularHours},
            ${attendance.ot1Hours}, ${attendance.ot2Hours}, ${attendance.isHoliday}, ${attendance.notes}
          )
        `;
      }
      console.log(`✅ 匯入 ${tables.temporary_attendance.length} 筆考勤記錄`);
    }
    
    return true;
  } catch (error) {
    console.error(`❌ 匯入資料失敗: ${error.message}`);
    return false;
  }
}

// 驗證遷移結果
async function verifyMigration(sql, backupData) {
  console.log('驗證遷移結果...');
  
  try {
    // 檢查薪資記錄數量
    const salaryCount = await sql`SELECT COUNT(*) as count FROM salary_records`;
    const expectedSalaryCount = backupData.tables.salary_records.length;
    
    if (salaryCount[0].count == expectedSalaryCount) {
      console.log(`✅ 薪資記錄數量正確: ${salaryCount[0].count} 筆`);
    } else {
      console.log(`❌ 薪資記錄數量不符: 預期 ${expectedSalaryCount}, 實際 ${salaryCount[0].count}`);
      return false;
    }
    
    // 檢查員工數量
    const employeeCount = await sql`SELECT COUNT(*) as count FROM employees`;
    const expectedEmployeeCount = backupData.tables.employees.length;
    
    if (employeeCount[0].count == expectedEmployeeCount) {
      console.log(`✅ 員工數量正確: ${employeeCount[0].count} 位`);
    } else {
      console.log(`❌ 員工數量不符: 預期 ${expectedEmployeeCount}, 實際 ${employeeCount[0].count}`);
      return false;
    }
    
    // 顯示關鍵薪資記錄
    console.log('\n📊 遷移的薪資記錄:');
    const records = await sql`SELECT "salaryYear", "salaryMonth", "employeeName", "netSalary" FROM salary_records ORDER BY "salaryYear", "salaryMonth"`;
    records.forEach(record => {
      console.log(`${record.salaryYear}年${record.salaryMonth}月 ${record.employeeName}: ${record.netSalary}元`);
    });
    
    return true;
  } catch (error) {
    console.error(`❌ 驗證失敗: ${error.message}`);
    return false;
  }
}

// 主執行函數
async function migrateToSupabase(connectionUrl) {
  console.log('🚀 開始遷移到 Supabase...\n');
  
  try {
    // 1. 載入備份資料
    const backupData = loadBackupData();
    console.log(`備份資料載入完成: ${backupData.summary.total_records} 筆記錄\n`);
    
    // 2. 測試連接
    const connectionSuccess = await testSupabaseConnection(connectionUrl);
    if (!connectionSuccess) {
      throw new Error('Supabase 連接失敗');
    }
    
    // 3. 建立連接
    const sql = postgres(connectionUrl, {
      ssl: 'require',
      connect_timeout: 30,
      max: 1
    });
    
    // 4. 建立資料庫結構
    const schemaSuccess = await createDatabaseSchema(sql);
    if (!schemaSuccess) {
      throw new Error('資料庫結構建立失敗');
    }
    
    // 5. 匯入資料
    const importSuccess = await importData(sql, backupData);
    if (!importSuccess) {
      throw new Error('資料匯入失敗');
    }
    
    // 6. 驗證遷移
    const verifySuccess = await verifyMigration(sql, backupData);
    if (!verifySuccess) {
      throw new Error('遷移驗證失敗');
    }
    
    await sql.end();
    
    console.log('\n🎉 Supabase 遷移完成！');
    console.log('下一步:');
    console.log('1. 更新 DATABASE_URL 環境變數');
    console.log('2. 更新 server/storage.ts 使用 postgres 驅動');
    console.log('3. 重新啟動應用程式');
    
    return true;
    
  } catch (error) {
    console.error(`\n❌ 遷移失敗: ${error.message}`);
    return false;
  }
}

// 命令行執行
if (require.main === module) {
  const connectionUrl = process.argv[2];
  
  if (!connectionUrl) {
    console.log('使用方式: node migrate-to-new-supabase.cjs "postgresql://postgres.PROJECT_ID:PASSWORD@HOST:PORT/postgres"');
    console.log('\n請提供新的 Supabase 連接字串');
    process.exit(1);
  }
  
  migrateToSupabase(connectionUrl)
    .then(success => {
      if (success) {
        console.log('\n✅ 遷移程序完成');
        process.exit(0);
      } else {
        console.log('\n❌ 遷移程序失敗');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('執行錯誤:', error);
      process.exit(1);
    });
}

module.exports = { migrateToSupabase };