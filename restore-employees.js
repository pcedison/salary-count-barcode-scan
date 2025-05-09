/**
 * 員工資料恢復腳本
 * 
 * 從備份文件中恢復員工資料到數據庫
 * 用法: node restore-employees.js
 */

import fs from 'fs';
import pg from 'pg';

// 讀取備份文件
console.log('讀取備份文件...');
const backupData = JSON.parse(fs.readFileSync('./backup.json', 'utf8'));

// 創建 PostgreSQL 客戶端
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function restoreEmployees() {
  try {
    // 檢查資料
    if (!backupData.employees || !Array.isArray(backupData.employees)) {
      console.error('備份中沒有員工資料');
      return;
    }
    
    console.log(`找到 ${backupData.employees.length} 名員工資料`);
    
    // 連接到資料庫
    const client = await pool.connect();
    console.log('成功連接到資料庫');
    
    try {
      // 逐條恢復員工資料
      console.log('開始恢復員工資料...');
      let successCount = 0;
      
      for (const employee of backupData.employees) {
        // 檢查員工是否已存在
        const checkQuery = 'SELECT id FROM employees WHERE id = $1';
        const checkResult = await client.query(checkQuery, [employee.id]);
        
        if (checkResult.rows.length > 0) {
          console.log(`員工 ID ${employee.id} (${employee.name}) 已存在，進行更新`);
          
          // 更新員工資料
          const updateQuery = `
            UPDATE employees SET
              name = $2,
              position = $3,
              department = $4,
              id_number = $5,
              email = $6,
              phone = $7,
              active = $8,
              is_encrypted = $9,
              updated_at = NOW()
            WHERE id = $1
          `;
          
          await client.query(updateQuery, [
            employee.id,
            employee.name,
            employee.position,
            employee.department,
            employee.idNumber,
            employee.email || '',
            employee.phone || '',
            employee.active !== undefined ? employee.active : true,
            employee.isEncrypted !== undefined ? employee.isEncrypted : false
          ]);
          
          console.log(`已更新員工 ID: ${employee.id}, 姓名: ${employee.name}`);
          successCount++;
        } else {
          console.log(`員工 ID ${employee.id} (${employee.name}) 不存在，進行插入`);
          
          // 插入員工資料
          const insertQuery = `
            INSERT INTO employees (
              id, name, position, department, id_number, 
              email, phone, active, is_encrypted, created_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
            )
          `;
          
          await client.query(insertQuery, [
            employee.id,
            employee.name,
            employee.position,
            employee.department,
            employee.idNumber,
            employee.email || '',
            employee.phone || '',
            employee.active !== undefined ? employee.active : true,
            employee.isEncrypted !== undefined ? employee.isEncrypted : false,
            employee.createdAt || new Date().toISOString()
          ]);
          
          console.log(`已插入員工 ID: ${employee.id}, 姓名: ${employee.name}`);
          successCount++;
        }
      }
      
      console.log(`恢復完成，成功: ${successCount}/${backupData.employees.length} 名員工`);
    } finally {
      // 釋放客戶端
      client.release();
    }
  } catch (error) {
    console.error('恢復過程中發生錯誤:', error);
  } finally {
    // 關閉連接池
    pool.end();
  }
}

// 執行恢復
restoreEmployees();