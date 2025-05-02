// 測試改良版凱薩加密工具

// 導入共享常量
import { constants } from './shared/constants.js';

// 使用共享常量
const DEFAULT_SHIFT = constants.DEFAULT_CIPHER_SHIFT;

/**
 * 改良版凱薩加密函數 - 只加密字母部分
 */
function caesarEncrypt(text, shift = DEFAULT_SHIFT) {
  if (!text) return '';
  
  return text
    .split('')
    .map(char => {
      // 取字符的ASCII碼
      const code = char.charCodeAt(0);
      
      // 只加密字母，數字保持不變
      // 處理大寫字母 (ASCII 65-90)
      if (code >= 65 && code <= 90) {
        return String.fromCharCode(((code - 65 + shift) % 26) + 65);
      }
      
      // 處理小寫字母 (ASCII 97-122)
      if (code >= 97 && code <= 122) {
        return String.fromCharCode(((code - 97 + shift) % 26) + 97);
      }
      
      // 數字和其他字符保持不變
      return char;
    })
    .join('');
}

/**
 * 改良版凱薩解密函數 - 只解密字母部分
 */
function caesarDecrypt(text, shift = DEFAULT_SHIFT) {
  // 解密就是將位移量反向處理
  return caesarEncrypt(text, 26 - (shift % 26));
}

/**
 * 判斷字符串是否已經被加密
 */
function isEncrypted(text) {
  if (!text) return false;
  
  // 判斷是否符合台灣身份證/居留證的基本模式
  // 身份證格式：一個字母後跟9個數字
  const idPattern = /^[A-Z][0-9]{9}$/;
  
  // 如果符合身份證/居留證格式，還要檢查是否符合標準格式規則
  if (idPattern.test(text)) {
    // 合法的首字母範圍: A-Z (台灣身分證通常使用A-V範圍)
    const firstChar = text.charAt(0);
    const validFirstLetters = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V'];
    
    // 第二碼（性別碼）應為1或2
    const secondChar = text.charAt(1);
    
    // 如果符合標準格式規則，則視為未加密
    if (validFirstLetters.includes(firstChar) && (secondChar === '1' || secondChar === '2')) {
      return false;
    }
  }
  
  // 不符合標準身分證格式規則，可能是加密後的結果
  return true;
}

/**
 * 嘗試解密文本
 */
function tryDecrypt(text) {
  if (!text) return '';
  
  // 如果文本可能已加密，嘗試解密
  if (isEncrypted(text)) {
    return caesarDecrypt(text);
  }
  
  // 不像加密文本，原樣返回
  return text;
}

// 測試不同的身分證號碼和加密情況
console.log('測試改良版凱薩加密工具');
console.log('-----------------');

// 現有員工的ID
const testCases = [
  'J012345678', // 李大明
  'E01839502',  // 陳文山
  'A123456789', // 一般身分證
  'H987654321', // 一般身分證
];

testCases.forEach(id => {
  console.log(`原始ID: ${id}`);
  console.log(`是否被識別為加密: ${isEncrypted(id)}`);
  
  const encrypted = caesarEncrypt(id);
  console.log(`加密後: ${encrypted}`);
  console.log(`加密後是否被識別為加密: ${isEncrypted(encrypted)}`);
  
  const decrypted = caesarDecrypt(encrypted);
  console.log(`解密後: ${decrypted}`);
  console.log(`解密後是否被識別為加密: ${isEncrypted(decrypted)}`);
  
  // 測試加密ID是否能被正確解密
  const afterDecrypt = tryDecrypt(encrypted);
  console.log(`加密ID經過tryDecrypt解密: ${afterDecrypt}`);
  console.log(`原始ID和解密後是否匹配: ${afterDecrypt === id}`);
  
  console.log('-----------------');
});