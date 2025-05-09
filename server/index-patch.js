/**
 * 服務器啟動流程補丁
 * 
 * 功能：
 * 1. 將此文件的內容整合到 server/index.js 中
 * 2. 確保系統啟動時自動加載設定管理器
 * 3. 增強系統穩定性和資料一致性
 */

// 需要添加以下導入:
import { initializeSettings } from './settings-manager.js';

// 在啟動服務器之前，添加以下代碼:
console.log('正在初始化系統設定...');
await initializeSettings();

// 然後可以啟動服務器:
// app.listen(port, '0.0.0.0', () => { ... });