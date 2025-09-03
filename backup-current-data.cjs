// 備份當前 Neon 資料庫的完整資料
const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);

async function backupAllData() {
  console.log('開始備份當前資料庫資料...');
  
  try {
    // 備份薪資記錄
    console.log('備份薪資記錄...');
    const salaryRecords = await sql`SELECT * FROM salary_records ORDER BY id`;
    console.log(`發現 ${salaryRecords.length} 筆薪資記錄`);
    
    // 備份員工資料
    console.log('備份員工資料...');
    const employees = await sql`SELECT * FROM employees ORDER BY id`;
    console.log(`發現 ${employees.length} 位員工`);
    
    // 備份系統設定
    console.log('備份系統設定...');
    const settings = await sql`SELECT * FROM settings`;
    console.log(`發現 ${settings.length} 個設定記錄`);
    
    // 備份假日設定
    console.log('備份假日設定...');
    const holidays = await sql`SELECT * FROM holidays ORDER BY date`;
    console.log(`發現 ${holidays.length} 個假日記錄`);
    
    // 備份臨時考勤
    console.log('備份臨時考勤...');
    const attendance = await sql`SELECT * FROM temporary_attendance ORDER BY date`;
    console.log(`發現 ${attendance.length} 筆考勤記錄`);
    
    // 建立完整備份物件
    const backup = {
      timestamp: new Date().toISOString(),
      database: 'neon',
      tables: {
        salary_records: salaryRecords,
        employees: employees,
        settings: settings,
        holidays: holidays,
        temporary_attendance: attendance
      },
      summary: {
        salary_records_count: salaryRecords.length,
        employees_count: employees.length,
        settings_count: settings.length,
        holidays_count: holidays.length,
        attendance_count: attendance.length,
        total_records: salaryRecords.length + employees.length + settings.length + holidays.length + attendance.length
      }
    };
    
    // 輸出詳細備份資訊
    console.log('\n=== 備份完成 ===');
    console.log('備份摘要:');
    console.log(`薪資記錄: ${backup.summary.salary_records_count} 筆`);
    console.log(`員工資料: ${backup.summary.employees_count} 位`);
    console.log(`系統設定: ${backup.summary.settings_count} 個`);
    console.log(`假日設定: ${backup.summary.holidays_count} 個`);
    console.log(`考勤記錄: ${backup.summary.attendance_count} 筆`);
    console.log(`總計記錄: ${backup.summary.total_records} 筆`);
    
    // 顯示關鍵薪資記錄詳情
    console.log('\n=== 關鍵薪資記錄 ===');
    salaryRecords.forEach(record => {
      console.log(`${record.salaryYear}年${record.salaryMonth}月 ${record.employeeName}: ${record.netSalary}元`);
    });
    
    // 將備份資料寫入檔案
    const fs = require('fs');
    const backupFilename = `neon-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    fs.writeFileSync(backupFilename, JSON.stringify(backup, null, 2));
    console.log(`\n備份檔案已儲存: ${backupFilename}`);
    
    return backup;
    
  } catch (error) {
    console.error('備份過程中發生錯誤:', error);
    throw error;
  }
}

// 執行備份
if (require.main === module) {
  backupAllData()
    .then(() => {
      console.log('備份程序完成');
      process.exit(0);
    })
    .catch(error => {
      console.error('備份失敗:', error);
      process.exit(1);
    });
}

module.exports = { backupAllData };