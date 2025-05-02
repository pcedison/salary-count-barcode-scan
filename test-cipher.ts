/**
 * 加密工具測試文件
 */

// 導入加密工具
import { caesarEncrypt, caesarDecrypt } from './shared/utils/improvedCaesarCipher';
import { constants } from './shared/constants';

// 測試 ID
const testId = 'E01839602';
console.log(`原始 ID: ${testId}`);

// 加密測試
const encryptedId = caesarEncrypt(testId);
console.log(`加密後: ${encryptedId}`);

// 解密測試
const decryptedId = caesarDecrypt(encryptedId);
console.log(`解密後: ${decryptedId}`);

// 驗證結果
console.log(`測試結果: ${testId === decryptedId ? '成功 ✓' : '失敗 ✗'}`);