// 凱薩加密工具測試

// 默認的偏移量
const DEFAULT_SHIFT = 7;

/**
 * 凱薩加密函數
 * @param text 要加密的原始文本
 * @param shift 位移量，默認為7
 * @returns 加密後的文本
 */
function caesarEncrypt(text, shift = DEFAULT_SHIFT) {
  if (!text) return '';
  
  return text
    .split('')
    .map(char => {
      // 取字符的ASCII碼
      const code = char.charCodeAt(0);
      
      // 處理大寫字母 (ASCII 65-90)
      if (code >= 65 && code <= 90) {
        return String.fromCharCode(((code - 65 + shift) % 26) + 65);
      }
      
      // 處理小寫字母 (ASCII 97-122)
      if (code >= 97 && code <= 122) {
        return String.fromCharCode(((code - 97 + shift) % 26) + 97);
      }
      
      // 處理數字 (ASCII 48-57)
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
 * @param text 加密後的文本
 * @param shift 位移量，默認為7
 * @returns 解密後的原始文本
 */
function caesarDecrypt(text, shift = DEFAULT_SHIFT) {
  // 解密就是將位移量反向處理
  return caesarEncrypt(text, 26 - (shift % 26));
}

/**
 * 判斷字符串是否已經被加密
 * 這個簡單的判斷方法只是試圖判斷是否為身份證號碼/居留證格式
 * @param text 要檢查的文本
 * @returns 如果像是已加密文本則返回true，否則返回false
 */
function isEncrypted(text) {
  if (!text) return false;
  
  // 判斷是否符合台灣身份證/居留證的基本模式
  // 身份證格式：一個字母後跟9個數字
  const idPattern = /^[A-Z][0-9]{9}$/;
  
  // 如果符合身份證/居留證格式，執行更細緻的檢查
  if (idPattern.test(text)) {
    // 合法的第一個字母: A-Z (但實際上台灣身分證通常只用A-V)
    const firstChar = text.charAt(0);
    const validFirstLetters = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V'];
    
    // 如果首字母不在合法範圍內，那可能是加密的結果
    if (!validFirstLetters.includes(firstChar)) {
      return true; // 可能是加密後的結果
    }
    
    // 檢查身分證第二碼是否為1或2（性別碼）
    const secondChar = text.charAt(1);
    if (secondChar !== '1' && secondChar !== '2') {
      return true; // 可能是加密後的結果
    }
    
    return false; // 看起來符合原始身分證格式，視為未加密
  }
  
  return true; // 不符合標準身分證格式，可能是加密的
}

/**
 * 嘗試解密文本
 * @param text 可能是加密的文本
 * @returns 嘗試解密後的文本，如果不像是加密文本則原樣返回
 */
function tryDecrypt(text) {
  if (!text) return '';
  
  // 為了確保不會漏掉任何可能性，總是嘗試解密，並檢查結果
  const decrypted = caesarDecrypt(text);
  
  // 如果解密後變成了一個看起來像身分證的格式，那麼解密可能成功了
  const idPattern = /^[A-Z][0-9]{9}$/;
  if (idPattern.test(decrypted)) {
    // 檢查首字母是否在合法範圍內
    const firstChar = decrypted.charAt(0);
    const validFirstLetters = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V'];
    
    // 檢查性別碼是否為1或2
    const secondChar = decrypted.charAt(1);
    
    if (validFirstLetters.includes(firstChar) && (secondChar === '1' || secondChar === '2')) {
      return decrypted; // 解密成功，返回解密後的結果
    }
  }
  
  // 如果我們認為原始文本不是加密的，則返回原始文本
  if (!isEncrypted(text)) {
    return text; 
  }
  
  // 其他情況，嘗試返回解密結果（哪怕解密可能不完全正確）
  return decrypted;
}

// 測試不同的身分證號碼和加密情況
console.log('測試凱薩加密工具');
console.log('-----------------');

const testCases = [
  'A123456789',  // 標準身分證
  'H123456987',  // 標準身分證
  'G987654321',  // 標準身分證
  'Z123456789',  // 不常見字母開頭
  'Q123456789',  // 標準身分證
  'X123456789',  // 不常見字母開頭
  'Y123456789',  // 不常見字母開頭
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
  
  const tryDecrypted = tryDecrypt(encrypted);
  console.log(`試解密: ${tryDecrypted}`);
  console.log('-----------------');
});