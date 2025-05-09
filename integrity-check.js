/**
 * 資料完整性檢查工具
 * 
 * 功能：
 * 1. 檢查所有關鍵資料表是否存在
 * 2. 檢查資料表的結構是否正確
 * 3. 檢查重要資料的完整性
 * 4. 提供數據修復建議
 * 
 * 使用方式: node integrity-check.js [--fix]
 */

import pg from 'pg';

// 創建 PostgreSQL 客戶端
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// 是否自動修復問題
const shouldFix = process.argv.includes('--fix');

// 預期的資料表結構
const expectedTables = {
  employees: [
    { name: 'id', type: 'integer' },
    { name: 'name', type: 'character varying' },
    { name: 'position', type: 'character varying' },
    { name: 'department', type: 'character varying' },
    { name: 'id_number', type: 'character varying' },
    { name: 'contact_number', type: 'character varying' },
    { name: 'email', type: 'character varying' },
    { name: 'join_date', type: 'date' },
    { name: 'status', type: 'character varying' },
    { name: 'base_salary', type: 'numeric' },
    { name: 'housing_allowance', type: 'numeric' },
    { name: 'welfare_allowance', type: 'numeric' },
    { name: 'created_at', type: 'timestamp with time zone' }
  ],
  salary_records: [
    { name: 'id', type: 'integer' },
    { name: 'salary_year', type: 'integer' },
    { name: 'salary_month', type: 'integer' },
    { name: 'employee_id', type: 'integer' },
    { name: 'employee_name', type: 'character varying' },
    { name: 'base_salary', type: 'numeric' },
    { name: 'housing_allowance', type: 'numeric' },
    { name: 'welfare_allowance', type: 'numeric' },
    { name: 'total_ot1_hours', type: 'numeric' },
    { name: 'total_ot2_hours', type: 'numeric' },
    { name: 'total_overtime_pay', type: 'numeric' },
    { name: 'holiday_days', type: 'integer' },
    { name: 'holiday_daily_salary', type: 'numeric' },
    { name: 'total_holiday_pay', type: 'numeric' },
    { name: 'gross_salary', type: 'numeric' },
    { name: 'deductions', type: ['jsonb', 'json'] },
    { name: 'total_deductions', type: 'numeric' },
    { name: 'net_salary', type: 'numeric' },
    { name: 'attendance_data', type: ['jsonb', 'json'] },
    { name: 'created_at', type: 'timestamp with time zone' }
  ],
  attendance: [
    { name: 'id', type: 'integer' },
    { name: 'employee_id', type: 'integer' },
    { name: 'date', type: 'date' },
    { name: 'check_in_time', type: 'time without time zone' },
    { name: 'check_out_time', type: 'time without time zone' },
    { name: 'regular_hours', type: 'numeric' },
    { name: 'ot1_hours', type: 'numeric' },
    { name: 'ot2_hours', type: 'numeric' },
    { name: 'notes', type: 'character varying' },
    { name: 'created_at', type: 'timestamp with time zone' }
  ],
  holidays: [
    { name: 'id', type: 'integer' },
    { name: 'date', type: 'date' },
    { name: 'name', type: 'character varying' },
    { name: 'type', type: 'character varying' },
    { name: 'created_at', type: 'timestamp with time zone' }
  ],
  settings: [
    { name: 'id', type: 'integer' },
    { name: 'base_hourly_rate', type: 'numeric' },
    { name: 'ot1_multiplier', type: 'numeric' },
    { name: 'ot2_multiplier', type: 'numeric' },
    { name: 'regular_hours', type: 'numeric' },
    { name: 'updated_at', type: 'timestamp with time zone' }
  ]
};

/**
 * 檢查資料表是否存在
 * @param {pg.PoolClient} client 資料庫客戶端
 * @param {string} tableName 資料表名稱
 * @returns {Promise<boolean>} 資料表是否存在
 */
async function tableExists(client, tableName) {
  const result = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = $1
    )
  `, [tableName]);
  
  return result.rows[0].exists;
}

/**
 * 獲取資料表的列結構
 * @param {pg.PoolClient} client 資料庫客戶端
 * @param {string} tableName 資料表名稱
 * @returns {Promise<Array>} 資料表的列結構
 */
async function getTableColumns(client, tableName) {
  const result = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = $1
  `, [tableName]);
  
  return result.rows.map(row => ({
    name: row.column_name,
    type: row.data_type
  }));
}

/**
 * 檢查列是否符合預期
 * @param {Object} column 實際列
 * @param {Object} expectedColumn 預期列
 * @returns {boolean} 是否符合預期
 */
function columnMatches(column, expectedColumn) {
  if (column.name !== expectedColumn.name) {
    return false;
  }
  
  if (Array.isArray(expectedColumn.type)) {
    // 如果預期類型是數組，檢查實際類型是否在數組中
    return expectedColumn.type.includes(column.type);
  } else {
    // 否則直接比較
    return column.type === expectedColumn.type;
  }
}

/**
 * 檢查資料表結構
 * @param {pg.PoolClient} client 資料庫客戶端
 * @param {string} tableName 資料表名稱
 * @param {Array} expectedColumns 預期的列結構
 * @returns {Promise<Object>} 檢查結果
 */
async function checkTableStructure(client, tableName, expectedColumns) {
  const exists = await tableExists(client, tableName);
  
  if (!exists) {
    return {
      exists: false,
      columns: [],
      missingColumns: expectedColumns,
      extraColumns: []
    };
  }
  
  const actualColumns = await getTableColumns(client, tableName);
  
  // 檢查缺失的列
  const missingColumns = expectedColumns.filter(expected => 
    !actualColumns.some(actual => columnMatches(actual, expected))
  );
  
  // 檢查多餘的列
  const extraColumns = actualColumns.filter(actual => 
    !expectedColumns.some(expected => columnMatches(actual, expected))
  );
  
  return {
    exists: true,
    columns: actualColumns,
    missingColumns,
    extraColumns
  };
}

/**
 * 檢查薪資記錄的完整性
 * @param {pg.PoolClient} client 資料庫客戶端
 * @returns {Promise<Object>} 檢查結果
 */
async function checkSalaryRecordsIntegrity(client) {
  // 檢查員工名稱是否完整
  const result = await client.query(`
    SELECT id, salary_year, salary_month, employee_id, employee_name
    FROM salary_records
    WHERE employee_name IS NULL OR employee_name = ''
  `);
  
  const recordsWithoutNames = result.rows;
  
  // 檢查計算值是否合理
  const inconsistentCalculations = await client.query(`
    SELECT id, salary_year, salary_month, employee_id, employee_name,
           base_salary, housing_allowance, welfare_allowance,
           total_ot1_hours, total_ot2_hours, total_overtime_pay,
           holiday_days, holiday_daily_salary, total_holiday_pay,
           gross_salary, total_deductions, net_salary
    FROM salary_records
    WHERE (
      -- 檢查總工資計算
      ABS(
        (COALESCE(base_salary, 0) + COALESCE(housing_allowance, 0) + COALESCE(welfare_allowance, 0) + 
         COALESCE(total_overtime_pay, 0) + COALESCE(total_holiday_pay, 0)) - 
        COALESCE(gross_salary, 0)
      ) > 1
    ) OR (
      -- 檢查淨工資計算
      ABS(
        COALESCE(gross_salary, 0) - COALESCE(total_deductions, 0) - COALESCE(net_salary, 0)
      ) > 1
    )
  `);
  
  return {
    recordsWithoutNames,
    inconsistentCalculations: inconsistentCalculations.rows
  };
}

/**
 * 修復薪資記錄中的員工姓名
 * @param {pg.PoolClient} client 資料庫客戶端
 * @param {Array} records 需要修復的記錄
 * @returns {Promise<number>} 修復的記錄數
 */
async function fixSalaryRecordNames(client, records) {
  let fixedCount = 0;
  
  for (const record of records) {
    // 嘗試從員工表獲取名稱
    const employeeResult = await client.query(`
      SELECT name FROM employees WHERE id = $1
    `, [record.employee_id]);
    
    if (employeeResult.rows.length > 0) {
      const name = employeeResult.rows[0].name;
      
      // 更新薪資記錄
      await client.query(`
        UPDATE salary_records 
        SET employee_name = $1 
        WHERE id = $2
      `, [name, record.id]);
      
      console.log(`已修復記錄 ID: ${record.id}, 年月: ${record.salary_year}/${record.salary_month}, 員工姓名設置為: ${name}`);
      fixedCount++;
    } else {
      console.warn(`無法修復記錄 ID: ${record.id}, 年月: ${record.salary_year}/${record.salary_month}, 找不到員工 ID: ${record.employee_id}`);
    }
  }
  
  return fixedCount;
}

/**
 * 修復薪資記錄中的計算不一致
 * @param {pg.PoolClient} client 資料庫客戶端
 * @param {Array} records 需要修復的記錄
 * @returns {Promise<number>} 修復的記錄數
 */
async function fixSalaryCalculations(client, records) {
  let fixedCount = 0;
  
  for (const record of records) {
    // 重新計算總工資
    const grossSalary = (
      parseFloat(record.base_salary || 0) + 
      parseFloat(record.housing_allowance || 0) + 
      parseFloat(record.welfare_allowance || 0) + 
      parseFloat(record.total_overtime_pay || 0) + 
      parseFloat(record.total_holiday_pay || 0)
    );
    
    // 重新計算淨工資
    const netSalary = grossSalary - parseFloat(record.total_deductions || 0);
    
    // 更新薪資記錄
    await client.query(`
      UPDATE salary_records 
      SET gross_salary = $1, net_salary = $2 
      WHERE id = $3
    `, [grossSalary.toFixed(2), netSalary.toFixed(2), record.id]);
    
    console.log(`已修復記錄 ID: ${record.id}, 年月: ${record.salary_year}/${record.salary_month}, 總工資: ${grossSalary.toFixed(2)}, 淨工資: ${netSalary.toFixed(2)}`);
    fixedCount++;
  }
  
  return fixedCount;
}

/**
 * 主函數
 */
async function checkIntegrity() {
  console.log('開始檢查資料完整性...');
  
  const client = await pool.connect();
  
  try {
    // 檢查所有預期的資料表
    const tableCheckResults = {};
    let hasStructureIssues = false;
    
    for (const [tableName, expectedColumns] of Object.entries(expectedTables)) {
      console.log(`檢查資料表: ${tableName}`);
      const result = await checkTableStructure(client, tableName, expectedColumns);
      tableCheckResults[tableName] = result;
      
      if (!result.exists) {
        console.error(`資料表 ${tableName} 不存在!`);
        hasStructureIssues = true;
      } else {
        if (result.missingColumns.length > 0) {
          console.error(`資料表 ${tableName} 缺少列:`, result.missingColumns.map(c => c.name).join(', '));
          hasStructureIssues = true;
        }
        
        if (result.extraColumns.length > 0) {
          console.warn(`資料表 ${tableName} 有額外列:`, result.extraColumns.map(c => c.name).join(', '));
        }
      }
    }
    
    // 檢查薪資記錄完整性
    if (tableCheckResults.salary_records.exists) {
      console.log('檢查薪資記錄完整性...');
      const integrityResult = await checkSalaryRecordsIntegrity(client);
      
      if (integrityResult.recordsWithoutNames.length > 0) {
        console.error(`發現 ${integrityResult.recordsWithoutNames.length} 條沒有員工姓名的記錄`);
        
        // 嘗試修復
        if (shouldFix) {
          console.log('嘗試修復薪資記錄中的員工姓名...');
          const fixedCount = await fixSalaryRecordNames(client, integrityResult.recordsWithoutNames);
          console.log(`已修復 ${fixedCount}/${integrityResult.recordsWithoutNames.length} 條記錄的員工姓名`);
        } else {
          console.log('添加 --fix 參數以自動修復');
        }
      } else {
        console.log('所有薪資記錄都有完整的員工姓名');
      }
      
      if (integrityResult.inconsistentCalculations.length > 0) {
        console.error(`發現 ${integrityResult.inconsistentCalculations.length} 條計算不一致的記錄`);
        
        // 嘗試修復
        if (shouldFix) {
          console.log('嘗試修復薪資記錄中的計算不一致...');
          const fixedCount = await fixSalaryCalculations(client, integrityResult.inconsistentCalculations);
          console.log(`已修復 ${fixedCount}/${integrityResult.inconsistentCalculations.length} 條記錄的計算`);
        } else {
          console.log('添加 --fix 參數以自動修復');
        }
      } else {
        console.log('所有薪資記錄的計算都是一致的');
      }
    }
    
    // 總結
    console.log('\n檢查完成!');
    
    if (hasStructureIssues) {
      console.error('發現資料表結構問題，請檢查並修復');
    } else if (
      tableCheckResults.salary_records.exists && 
      (
        integrityResult.recordsWithoutNames.length > 0 ||
        integrityResult.inconsistentCalculations.length > 0
      )
    ) {
      if (shouldFix) {
        console.log('已嘗試修復所有發現的問題');
      } else {
        console.warn('發現數據問題，使用 --fix 參數可以嘗試自動修復');
      }
    } else {
      console.log('沒有發現任何問題，資料完整性良好!');
    }
  } catch (error) {
    console.error('檢查過程中發生錯誤:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

// 執行主函數
checkIntegrity();