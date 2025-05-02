// 測試特定條碼的解密結果

// 導入共享常量
import { constants } from './shared/constants.js';

// 使用共享常量
const DEFAULT_SHIFT = constants.DEFAULT_CIPHER_SHIFT;

/**
 * 改良版凱薩加密函數 - 只加密字母部分
 */
function caesarEncrypt(text, shift = DEFAULT_SHIFT) {
  if (!text) return '';
  
  // 先統一轉為大寫
  const upperText = text.toUpperCase();
  
  return upperText
    .split('')
    .map(char => {
      // 取字符的ASCII碼
      const code = char.charCodeAt(0);
      
      // 只加密字母，數字保持不變
      // 處理大寫字母 (ASCII 65-90)
      if (code >= 65 && code <= 90) {
        return String.fromCharCode(((code - 65 + shift) % 26) + 65);
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
  // 先統一轉為大寫
  const upperText = text.toUpperCase();
  // 解密就是將位移量反向處理
  return caesarEncrypt(upperText, 26 - (shift % 26));
}

// 測試條碼
const barcode = 'x90728491';
console.log(`原始條碼: ${barcode}`);
console.log(`轉大寫後: ${barcode.toUpperCase()}`);
console.log(`解密結果: ${caesarDecrypt(barcode)}`);

// 假設這可能是加密前的原始值
const originalId = 'O90728491';
console.log(`\n假設原始ID: ${originalId}`);
console.log(`加密結果: ${caesarEncrypt(originalId)}`);

// 測試所有可能的身分證首字母
const digits = '90728491';
console.log('\n測試所有可能的身分證首字母:');
for (let i = 0; i < 26; i++) {
  const letter = String.fromCharCode(65 + i);
  const potentialId = letter + digits;
  const encrypted = caesarEncrypt(potentialId);
  console.log(`${letter}${digits} -> ${encrypted}`);
  if (encrypted.toUpperCase() === barcode.toUpperCase()) {
    console.log(`找到匹配！${potentialId} 加密後為 ${encrypted}`);
  }
}