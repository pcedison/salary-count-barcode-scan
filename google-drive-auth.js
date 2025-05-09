/**
 * Google Drive 授權工具
 * 
 * 此工具用於完成 Google Drive API 的授權流程
 * 1. 確保已經創建 config/google-credentials.json 文件
 * 2. 運行此工具: node google-drive-auth.js
 * 3. 按照提示授權應用程序訪問您的 Google Drive
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import { google } from 'googleapis';

// 獲取當前目錄
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 配置路徑
const CONFIG_DIR = path.join(__dirname, 'config');
const CREDENTIALS_PATH = path.join(CONFIG_DIR, 'google-credentials.json');
const TOKEN_PATH = path.join(CONFIG_DIR, 'google-token.json');

// 確保配置目錄存在
if (!fs.existsSync(CONFIG_DIR)) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

// 需要的授權範圍
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

/**
 * 讀取用戶輸入
 * @param {string} question 問題
 * @returns {Promise<string>} 用戶輸入
 */
function readUserInput(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * 獲取並存儲新的令牌
 * @param {google.auth.OAuth2} oAuth2Client OAuth2 客戶端
 * @returns {Promise<void>}
 */
async function getNewToken(oAuth2Client) {
  // 生成授權 URL
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });

  console.log('請在瀏覽器中打開以下 URL 進行授權:');
  console.log(authUrl);

  // 讀取用戶輸入的授權碼
  const code = await readUserInput('授權完成後，請輸入授權碼: ');

  try {
    // 換取令牌
    const { tokens } = await oAuth2Client.getToken(code);
    
    // 存儲令牌
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
    console.log(`令牌已保存到: ${TOKEN_PATH}`);
    
    // 設置憑證
    oAuth2Client.setCredentials(tokens);
    
    // 測試 Drive API
    const drive = google.drive({ version: 'v3', auth: oAuth2Client });
    const response = await drive.files.list({
      pageSize: 10,
      fields: 'files(id, name)',
    });
    
    // 顯示測試結果
    const files = response.data.files;
    if (files.length) {
      console.log('授權成功! 以下是您的 Google Drive 中的文件：');
      files.forEach((file) => {
        console.log(`${file.name} (${file.id})`);
      });
    } else {
      console.log('授權成功! 您的 Google Drive 中沒有找到文件。');
    }
    
    console.log('\n授權完成，現在您可以使用 Google Drive 備份功能了。');
  } catch (error) {
    console.error('獲取令牌時出錯:', error);
    console.log('請確保授權碼正確，然後重試。');
  }
}

/**
 * 初始化 OAuth2 客戶端並進行授權
 */
async function authorize() {
  try {
    // 檢查憑證是否存在
    if (!fs.existsSync(CREDENTIALS_PATH)) {
      console.error(`找不到 Google Drive API 憑證: ${CREDENTIALS_PATH}`);
      console.log('\n請按照以下步驟獲取憑證:');
      console.log('1. 訪問 https://console.cloud.google.com/');
      console.log('2. 創建一個新項目或選擇現有項目');
      console.log('3. 啟用 Google Drive API');
      console.log('4. 創建 OAuth 客戶端 ID（選擇"桌面應用程式"類型）');
      console.log('5. 下載 JSON 格式的憑證');
      console.log(`6. 將憑證文件保存為: ${CREDENTIALS_PATH}`);
      console.log('\n完成上述步驟後，重新運行此腳本。');
      return;
    }

    // 讀取憑證
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
    
    // 創建 OAuth2 客戶端
    const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]
    );

    // 檢查令牌是否存在
    if (fs.existsSync(TOKEN_PATH)) {
      // 如果令牌存在，則需要用戶確認是否重新授權
      const answer = await readUserInput('已存在授權令牌，是否重新授權？(y/n): ');
      
      if (answer.toLowerCase() !== 'y') {
        // 使用現有令牌
        const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
        oAuth2Client.setCredentials(token);
        console.log('使用現有令牌，授權已完成。');
        return;
      }
    }

    // 獲取新令牌
    await getNewToken(oAuth2Client);
  } catch (error) {
    console.error('授權過程中出錯:', error);
  }
}

// 啟動授權流程
authorize().catch(console.error);