/**
 * 多種身份證號碼加密測試
 */

import { caesarEncrypt, caesarDecrypt, isEncrypted } from './shared/utils/improvedCaesarCipher';
import { constants } from './shared/constants';

// 測試多種身份證號碼
const testIds = [
  'E01839602',  // 已有映射的標準 ID
  'A123456789', // 標準台灣身份證格式
  'A223456789', // 女性身份證格式
  'AK12345678'  // 非標準格式
];

console.log('=== 多重身份證號碼加密/解密測試 ===');
console.log('使用特殊偏移量:', constants.DEFAULT_CIPHER_SHIFT);

// 測試每個 ID
testIds.forEach(id => {
  console.log(`\n測試 ID: ${id}`);
  
  // 檢查是否已加密
  const alreadyEncrypted = isEncrypted(id);
  console.log(`判斷為${alreadyEncrypted ? '已加密' : '未加密'}`);
  
  // 加密
  const encryptedId = caesarEncrypt(id);
  console.log(`加密後: ${encryptedId}`);
  
  // 解密
  const decryptedId = caesarDecrypt(encryptedId);
  console.log(`解密後: ${decryptedId}`);
  
  // 測試結果
  console.log(`測試結果: ${id === decryptedId ? '成功 ✓' : '失敗 ✗'}`);
});