/**
 * 日誌分析與自動檢查系統
 * 
 * 功能：
 * 1. 自動分析系統日誌，識別潛在問題
 * 2. 定期生成系統健康報告
 * 3. 在發現嚴重問題時發送通知
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';

// 獲取當前目錄
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 常量
const LOG_DIR = path.join(__dirname, '..', 'logs');
const REPORT_DIR = path.join(__dirname, '..', 'reports');
const DEFAULT_EMAIL = process.env.ALERT_EMAIL || '';

// 確保目錄存在
function ensureDirectoriesExist() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }
}

/**
 * 獲取過去N天的日誌文件
 * @param {number} days 天數
 * @returns {Array} 日誌文件路徑數組
 */
function getRecentLogs(days = 7) {
  ensureDirectoriesExist();
  
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  
  // 過濾出指定天數內的日誌文件
  return fs.readdirSync(LOG_DIR)
    .filter(file => file.endsWith('.log'))
    .map(file => {
      const filePath = path.join(LOG_DIR, file);
      const stats = fs.statSync(filePath);
      return { file, path: filePath, mtime: stats.mtime };
    })
    .filter(fileInfo => fileInfo.mtime >= cutoffDate)
    .map(fileInfo => fileInfo.path);
}

/**
 * 分析日誌文件
 * @param {string} logFile 日誌文件路徑
 * @returns {Object} 分析結果
 */
function analyzeLogFile(logFile) {
  const content = fs.readFileSync(logFile, 'utf8');
  const lines = content.split('\n');
  
  // 分類日誌條目
  const result = {
    errors: [],
    warnings: [],
    databaseIssues: [],
    securityEvents: [],
    performanceIssues: [],
    totalLines: lines.length
  };
  
  // 關鍵詞匹配
  const patterns = {
    error: /error|exception|fail|crashed/i,
    warning: /warning|warn|caution/i,
    database: /database|sql|query|supabase|postgres/i,
    security: /security|auth|login|password|unauthorized|權限|認證/i,
    performance: /slow|timeout|延遲|超時|performance/i
  };
  
  lines.forEach((line, index) => {
    // 跳過空行
    if (!line.trim()) return;
    
    // 捕獲時間戳（如果有）
    const timestampMatch = line.match(/\[(.*?)\]/);
    const timestamp = timestampMatch ? timestampMatch[1] : '';
    
    // 檢查各類型模式
    if (patterns.error.test(line)) {
      result.errors.push({ line: index + 1, content: line, timestamp });
    }
    
    if (patterns.warning.test(line)) {
      result.warnings.push({ line: index + 1, content: line, timestamp });
    }
    
    if (patterns.database.test(line)) {
      if (patterns.error.test(line) || patterns.warning.test(line)) {
        result.databaseIssues.push({ line: index + 1, content: line, timestamp });
      }
    }
    
    if (patterns.security.test(line)) {
      result.securityEvents.push({ line: index + 1, content: line, timestamp });
    }
    
    if (patterns.performance.test(line)) {
      result.performanceIssues.push({ line: index + 1, content: line, timestamp });
    }
  });
  
  return result;
}

/**
 * 分析多個日誌文件
 * @param {Array} logFiles 日誌文件路徑數組
 * @returns {Object} 彙總分析結果
 */
function analyzeMultipleLogs(logFiles) {
  const results = {
    errors: [],
    warnings: [],
    databaseIssues: [],
    securityEvents: [],
    performanceIssues: [],
    totalLines: 0,
    filesAnalyzed: logFiles.length,
    startTime: null,
    endTime: null
  };
  
  logFiles.forEach(logFile => {
    const fileResult = analyzeLogFile(logFile);
    
    // 合併結果
    results.errors = [...results.errors, ...fileResult.errors.map(e => ({ ...e, file: path.basename(logFile) }))];
    results.warnings = [...results.warnings, ...fileResult.warnings.map(w => ({ ...w, file: path.basename(logFile) }))];
    results.databaseIssues = [...results.databaseIssues, ...fileResult.databaseIssues.map(d => ({ ...d, file: path.basename(logFile) }))];
    results.securityEvents = [...results.securityEvents, ...fileResult.securityEvents.map(s => ({ ...s, file: path.basename(logFile) }))];
    results.performanceIssues = [...results.performanceIssues, ...fileResult.performanceIssues.map(p => ({ ...p, file: path.basename(logFile) }))];
    results.totalLines += fileResult.totalLines;
    
    // 獲取文件的修改時間
    const stats = fs.statSync(logFile);
    
    if (!results.startTime || stats.mtime < results.startTime) {
      results.startTime = stats.mtime;
    }
    
    if (!results.endTime || stats.mtime > results.endTime) {
      results.endTime = stats.mtime;
    }
  });
  
  return results;
}

/**
 * 生成日誌分析報告
 * @param {Object} results 分析結果
 * @returns {string} 報告內容
 */
function generateReport(results) {
  const now = new Date();
  let report = `# 系統日誌分析報告\n\n`;
  report += `生成時間: ${now.toISOString()}\n`;
  report += `分析期間: ${results.startTime?.toISOString() || 'N/A'} 至 ${results.endTime?.toISOString() || 'N/A'}\n`;
  report += `分析文件: ${results.filesAnalyzed} 個文件, 共 ${results.totalLines} 行\n\n`;
  
  // 健康評分
  const errorWeight = 3;
  const warningWeight = 1;
  const databaseWeight = 2;
  
  const errorScore = Math.min(100, results.errors.length * errorWeight);
  const warningScore = Math.min(50, results.warnings.length * warningWeight);
  const databaseScore = Math.min(80, results.databaseIssues.length * databaseWeight);
  const totalIssues = errorScore + warningScore + databaseScore;
  
  // 計算健康分數 (100分最佳，0分最差)
  const healthScore = Math.max(0, 100 - totalIssues);
  let healthStatus = '';
  
  if (healthScore >= 90) {
    healthStatus = '優良';
  } else if (healthScore >= 75) {
    healthStatus = '良好';
  } else if (healthScore >= 50) {
    healthStatus = '一般';
  } else if (healthScore >= 25) {
    healthStatus = '需注意';
  } else {
    healthStatus = '需立即處理';
  }
  
  report += `## 系統健康狀況\n\n`;
  report += `健康評分: ${healthScore}/100 (${healthStatus})\n\n`;
  
  // 摘要
  report += `## 摘要\n\n`;
  report += `- 錯誤: ${results.errors.length} 條\n`;
  report += `- 警告: ${results.warnings.length} 條\n`;
  report += `- 數據庫問題: ${results.databaseIssues.length} 條\n`;
  report += `- 安全事件: ${results.securityEvents.length} 條\n`;
  report += `- 性能問題: ${results.performanceIssues.length} 條\n\n`;
  
  // 詳細內容
  if (results.errors.length > 0) {
    report += `## 錯誤詳情\n\n`;
    results.errors.slice(0, 20).forEach(error => {
      report += `- [${error.file}:${error.line}] ${error.timestamp}: ${error.content.substring(0, 150)}${error.content.length > 150 ? '...' : ''}\n`;
    });
    if (results.errors.length > 20) {
      report += `... 以及另外 ${results.errors.length - 20} 條錯誤\n`;
    }
    report += '\n';
  }
  
  if (results.databaseIssues.length > 0) {
    report += `## 數據庫問題\n\n`;
    results.databaseIssues.slice(0, 20).forEach(issue => {
      report += `- [${issue.file}:${issue.line}] ${issue.timestamp}: ${issue.content.substring(0, 150)}${issue.content.length > 150 ? '...' : ''}\n`;
    });
    if (results.databaseIssues.length > 20) {
      report += `... 以及另外 ${results.databaseIssues.length - 20} 條數據庫問題\n`;
    }
    report += '\n';
  }
  
  // 建議
  report += `## 建議\n\n`;
  
  if (results.errors.length > 10) {
    report += `- ⚠️ 系統錯誤較多，建議檢查日誌中的錯誤信息並修復問題\n`;
  }
  
  if (results.databaseIssues.length > 5) {
    report += `- ⚠️ 發現多個數據庫相關問題，建議檢查數據庫連接和查詢\n`;
  }
  
  if (results.securityEvents.length > 3) {
    report += `- ⚠️ 發現多個安全事件，建議檢查系統安全設置\n`;
  }
  
  if (results.performanceIssues.length > 5) {
    report += `- ⚠️ 發現多個性能問題，建議優化系統性能\n`;
  }
  
  if (healthScore >= 90) {
    report += `- ✅ 系統運行良好，繼續保持\n`;
  }
  
  return report;
}

/**
 * 保存報告到文件
 * @param {string} report 報告內容
 * @returns {string} 報告文件路徑
 */
function saveReport(report) {
  ensureDirectoriesExist();
  
  const now = new Date();
  const reportFileName = `log-analysis-${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}.md`;
  const reportPath = path.join(REPORT_DIR, reportFileName);
  
  fs.writeFileSync(reportPath, report);
  console.log(`報告已保存到 ${reportPath}`);
  
  return reportPath;
}

/**
 * 發送報告郵件
 * @param {string} reportPath 報告文件路徑
 * @param {Object} results 分析結果
 * @param {string} email 接收郵件的地址
 * @returns {Promise<boolean>} 是否發送成功
 */
async function emailReport(reportPath, results, email = DEFAULT_EMAIL) {
  if (!email) {
    console.log('未設置郵件地址，跳過發送報告');
    return false;
  }
  
  try {
    // 創建郵件發送器
    // 注意：實際使用時應該配置真實的SMTP設置
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
    
    // 計算健康分數
    const errorWeight = 3;
    const warningWeight = 1;
    const databaseWeight = 2;
    
    const errorScore = Math.min(100, results.errors.length * errorWeight);
    const warningScore = Math.min(50, results.warnings.length * warningWeight);
    const databaseScore = Math.min(80, results.databaseIssues.length * databaseWeight);
    const totalIssues = errorScore + warningScore + databaseScore;
    const healthScore = Math.max(0, 100 - totalIssues);
    
    // 根據健康分數設置郵件主題
    let subject = '';
    if (healthScore >= 90) {
      subject = '【系統正常】每週系統日誌分析報告';
    } else if (healthScore >= 75) {
      subject = '【系統良好】每週系統日誌分析報告';
    } else if (healthScore >= 50) {
      subject = '【需關注】每週系統日誌分析報告';
    } else if (healthScore >= 25) {
      subject = '【需注意】系統出現問題，請查看日誌分析報告';
    } else {
      subject = '【緊急】系統異常，請立即處理';
    }
    
    // 設置郵件內容
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: subject,
      text: `請查看附件中的系統日誌分析報告。\n\n摘要：\n- 錯誤: ${results.errors.length} 條\n- 警告: ${results.warnings.length} 條\n- 數據庫問題: ${results.databaseIssues.length} 條\n- 安全事件: ${results.securityEvents.length} 條\n- 性能問題: ${results.performanceIssues.length} 條\n\n系統健康評分: ${healthScore}/100`,
      attachments: [
        {
          filename: path.basename(reportPath),
          path: reportPath
        }
      ]
    };
    
    // 發送郵件
    await transporter.sendMail(mailOptions);
    console.log(`報告已成功發送到 ${email}`);
    return true;
  } catch (error) {
    console.error('發送報告郵件時出錯:', error);
    return false;
  }
}

/**
 * 執行日誌分析並生成報告
 * @param {number} days 分析過去幾天的日誌
 * @param {boolean} sendEmail 是否發送郵件
 * @returns {string} 報告文件路徑
 */
export async function runLogAnalysis(days = 7, sendEmail = false) {
  try {
    console.log(`開始分析過去 ${days} 天的系統日誌...`);
    
    // 獲取日誌文件
    const logFiles = getRecentLogs(days);
    
    if (logFiles.length === 0) {
      console.log('未找到符合條件的日誌文件');
      return null;
    }
    
    console.log(`找到 ${logFiles.length} 個日誌文件`);
    
    // 分析日誌
    const results = analyzeMultipleLogs(logFiles);
    
    // 生成報告
    const report = generateReport(results);
    
    // 保存報告
    const reportPath = saveReport(report);
    
    // 發送報告
    if (sendEmail) {
      await emailReport(reportPath, results);
    }
    
    return reportPath;
  } catch (error) {
    console.error('執行日誌分析時出錯:', error);
    return null;
  }
}

/**
 * 設置定期日誌分析任務
 * @param {Object} options 選項
 * @param {number} options.intervalDays 分析間隔（天）
 * @param {boolean} options.sendEmail 是否發送郵件
 * @param {number} options.analysisPeriod 分析過去幾天的日誌
 * @returns {NodeJS.Timeout} 定時器ID
 */
export function scheduleLogAnalysis(options = {}) {
  const { 
    intervalDays = 7, 
    sendEmail = false, 
    analysisPeriod = 7 
  } = options;
  
  console.log(`設置定期日誌分析任務，每 ${intervalDays} 天執行一次`);
  
  // 立即執行一次
  runLogAnalysis(analysisPeriod, sendEmail);
  
  // 設置定期任務
  const intervalMs = intervalDays * 24 * 60 * 60 * 1000;
  return setInterval(() => {
    runLogAnalysis(analysisPeriod, sendEmail);
  }, intervalMs);
}

// 如果直接運行此腳本，執行一次分析
if (process.argv[1].endsWith('log-analyzer.js')) {
  const days = process.argv[2] ? parseInt(process.argv[2]) : 7;
  const sendEmail = process.argv.includes('--email');
  
  runLogAnalysis(days, sendEmail)
    .then(reportPath => {
      if (reportPath) {
        console.log(`日誌分析完成，報告保存在：${reportPath}`);
      } else {
        console.log('日誌分析失敗');
      }
    })
    .catch(error => {
      console.error('執行日誌分析時發生錯誤:', error);
    });
}