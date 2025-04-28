// 測試員工ID加密結果

// 默認的偏移量
const DEFAULT_SHIFT = 7;

/**
 * 凱薩加密函數
 */
function caesarEncrypt(text, shift = DEFAULT_SHIFT) {
  if (!text) return '';
  
  return text
    .split('')
    .map(char => {
      // 取字符的ASCII碼
      const code = char.charCodeAt(0);
      
      // 處理大寫字母
      if (code >= 65 && code <= 90) {
        return String.fromCharCode(((code - 65 + shift) % 26) + 65);
      }
      
      // 處理小寫字母
      if (code >= 97 && code <= 122) {
        return String.fromCharCode(((code - 97 + shift) % 26) + 97);
      }
      
      // 處理數字
      if (code >= 48 && code <= 57) {
        return String.fromCharCode(((code - 48 + shift) % 10) + 48);
      }
      
      // 其他字符保持不變
      return char;
    })
    .join('');
}

/**
 * 凱薩解密函數
 */
function caesarDecrypt(text, shift = DEFAULT_SHIFT) {
  return caesarEncrypt(text, 26 - (shift % 26));
}

// 測試特定員工ID
const employeeIds = [
  'J012345678', // 李大明
  'E01839502',  // 陳文山
];

console.log('員工ID加密測試');
console.log('-----------------');

employeeIds.forEach(id => {
  console.log(`員工原始ID: ${id}`);
  const encrypted = caesarEncrypt(id);
  console.log(`加密後ID: ${encrypted}`);
  console.log(`解密後ID: ${caesarDecrypt(encrypted)}`);
  console.log('-----------------');
});