/**
 * 系統設定 API 路由
 * 
 * 功能：
 * 1. 提供設定管理的 API 端點
 * 2. 處理設定的讀取和更新請求
 * 3. 確保設定更新時的持久化
 */

import express from 'express';
import { 
  getSettings, 
  getDeductions, 
  setDeductions, 
  setAdminPin, 
  verifyAdminPin,
  getSalarySettings,
  updateSalarySettings
} from './settings-manager.js';

export function registerSettingsRoutes(app) {
  // 獲取所有設定
  app.get('/api/settings', async (req, res) => {
    try {
      const salarySettings = await getSalarySettings();
      
      if (!salarySettings) {
        return res.status(500).json({ 
          success: false, 
          message: '無法獲取設定' 
        });
      }
      
      // 返回前端需要的格式
      res.json({
        id: 1,
        baseHourlyRate: salarySettings.baseHourlyRate,
        ot1Multiplier: salarySettings.ot1Multiplier,
        ot2Multiplier: salarySettings.ot2Multiplier,
        regularHours: 8
      });
    } catch (error) {
      console.error('獲取設定時出錯:', error);
      res.status(500).json({ 
        success: false, 
        message: '獲取設定時發生錯誤' 
      });
    }
  });
  
  // 獲取扣款項目
  app.get('/api/deductions', async (req, res) => {
    try {
      const deductions = await getDeductions();
      
      if (!deductions) {
        return res.status(500).json({ 
          success: false, 
          message: '無法獲取扣款項目' 
        });
      }
      
      res.json(deductions);
    } catch (error) {
      console.error('獲取扣款項目時出錯:', error);
      res.status(500).json({ 
        success: false, 
        message: '獲取扣款項目時發生錯誤' 
      });
    }
  });
  
  // 更新扣款項目
  app.post('/api/deductions', async (req, res) => {
    try {
      const { deductions } = req.body;
      
      if (!deductions || !Array.isArray(deductions)) {
        return res.status(400).json({ 
          success: false, 
          message: '無效的扣款項目數據' 
        });
      }
      
      const success = await setDeductions(deductions);
      
      if (success) {
        res.json({ 
          success: true, 
          message: '扣款項目更新成功' 
        });
      } else {
        res.status(500).json({ 
          success: false, 
          message: '更新扣款項目失敗' 
        });
      }
    } catch (error) {
      console.error('更新扣款項目時出錯:', error);
      res.status(500).json({ 
        success: false, 
        message: '更新扣款項目時發生錯誤' 
      });
    }
  });
  
  // 驗證管理員密碼
  app.post('/api/admin/verify', async (req, res) => {
    try {
      const { pin } = req.body;
      
      if (!pin) {
        return res.status(400).json({ 
          success: false, 
          message: '未提供密碼' 
        });
      }
      
      const isValid = await verifyAdminPin(pin);
      
      res.json({ 
        success: true, 
        isValid 
      });
    } catch (error) {
      console.error('驗證管理員密碼時出錯:', error);
      res.status(500).json({ 
        success: false, 
        message: '驗證管理員密碼時發生錯誤' 
      });
    }
  });
  
  // 更新管理員密碼
  app.post('/api/admin/password', async (req, res) => {
    try {
      const { currentPin, newPin } = req.body;
      
      if (!currentPin || !newPin) {
        return res.status(400).json({ 
          success: false, 
          message: '未提供當前密碼或新密碼' 
        });
      }
      
      // 驗證當前密碼
      const isValid = await verifyAdminPin(currentPin);
      
      if (!isValid) {
        return res.status(401).json({ 
          success: false, 
          message: '當前密碼不正確' 
        });
      }
      
      // 更新密碼
      const success = await setAdminPin(newPin);
      
      if (success) {
        res.json({ 
          success: true, 
          message: '管理員密碼更新成功' 
        });
      } else {
        res.status(500).json({ 
          success: false, 
          message: '更新管理員密碼失敗' 
        });
      }
    } catch (error) {
      console.error('更新管理員密碼時出錯:', error);
      res.status(500).json({ 
        success: false, 
        message: '更新管理員密碼時發生錯誤' 
      });
    }
  });
  
  // 更新薪資設定
  app.post('/api/settings', async (req, res) => {
    try {
      // 先驗證管理員權限
      const { adminPin } = req.body;
      
      if (!adminPin) {
        return res.status(401).json({ 
          success: false, 
          message: '未提供管理員密碼' 
        });
      }
      
      const isValid = await verifyAdminPin(adminPin);
      
      if (!isValid) {
        return res.status(401).json({ 
          success: false, 
          message: '管理員密碼不正確' 
        });
      }
      
      // 提取設定數據
      const { 
        baseHourlyRate, 
        ot1Multiplier, 
        ot2Multiplier, 
        baseMonthSalary, 
        welfareAllowance 
      } = req.body;
      
      // 更新設定
      const success = await updateSalarySettings({
        baseHourlyRate,
        ot1Multiplier,
        ot2Multiplier,
        baseMonthSalary: baseMonthSalary || 0,
        welfareAllowance: welfareAllowance || 0
      });
      
      if (success) {
        res.json({ 
          success: true, 
          message: '設定更新成功' 
        });
      } else {
        res.status(500).json({ 
          success: false, 
          message: '更新設定失敗' 
        });
      }
    } catch (error) {
      console.error('更新設定時出錯:', error);
      res.status(500).json({ 
        success: false, 
        message: '更新設定時發生錯誤' 
      });
    }
  });
  
  // 設定備份與恢復
  app.post('/api/settings/backup', async (req, res) => {
    try {
      // 驗證管理員權限
      const { adminPin } = req.body;
      
      if (!adminPin) {
        return res.status(401).json({ 
          success: false, 
          message: '未提供管理員密碼' 
        });
      }
      
      const isValid = await verifyAdminPin(adminPin);
      
      if (!isValid) {
        return res.status(401).json({ 
          success: false, 
          message: '管理員密碼不正確' 
        });
      }
      
      // 執行設定備份
      const { exec } = require('child_process');
      
      exec('node settings-sync.js backup', (error, stdout, stderr) => {
        if (error) {
          console.error(`備份設定時出錯: ${error.message}`);
          return res.status(500).json({ 
            success: false, 
            message: '備份設定時發生錯誤' 
          });
        }
        
        if (stderr) {
          console.error(`備份設定時出錯: ${stderr}`);
          return res.status(500).json({ 
            success: false, 
            message: '備份設定時發生錯誤' 
          });
        }
        
        res.json({ 
          success: true, 
          message: '設定備份成功',
          output: stdout
        });
      });
    } catch (error) {
      console.error('備份設定時出錯:', error);
      res.status(500).json({ 
        success: false, 
        message: '備份設定時發生錯誤' 
      });
    }
  });
  
  app.post('/api/settings/restore', async (req, res) => {
    try {
      // 驗證管理員權限
      const { adminPin } = req.body;
      
      if (!adminPin) {
        return res.status(401).json({ 
          success: false, 
          message: '未提供管理員密碼' 
        });
      }
      
      const isValid = await verifyAdminPin(adminPin);
      
      if (!isValid) {
        return res.status(401).json({ 
          success: false, 
          message: '管理員密碼不正確' 
        });
      }
      
      // 執行設定還原
      const { exec } = require('child_process');
      
      exec('node settings-sync.js restore', (error, stdout, stderr) => {
        if (error) {
          console.error(`還原設定時出錯: ${error.message}`);
          return res.status(500).json({ 
            success: false, 
            message: '還原設定時發生錯誤' 
          });
        }
        
        if (stderr) {
          console.error(`還原設定時出錯: ${stderr}`);
          return res.status(500).json({ 
            success: false, 
            message: '還原設定時發生錯誤' 
          });
        }
        
        res.json({ 
          success: true, 
          message: '設定還原成功',
          output: stdout
        });
      });
    } catch (error) {
      console.error('還原設定時出錯:', error);
      res.status(500).json({ 
        success: false, 
        message: '還原設定時發生錯誤' 
      });
    }
  });
}

export default registerSettingsRoutes;