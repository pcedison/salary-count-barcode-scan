/**
 * 測試0.5小時遞增邏輯
 * 驗證加班時數只有0或5的小數部分
 */

function timeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

// 新版計算方法（必須符合0.5小時遞增規則）
function calculateOvertimeWithHalfHourIncrement(clockIn, clockOut) {
  let inTime = timeToMinutes(clockIn);
  const outTime = timeToMinutes(clockOut);
  
  // 1. 早到處理：如果早於8:00上班，從8:00開始記薪
  const WORK_START = timeToMinutes('08:00');
  if (inTime < WORK_START) {
    inTime = WORK_START;
  }
  
  const STANDARD_END = timeToMinutes('16:00');
  
  let ot1 = 0;
  let ot2 = 0;
  const bufferMinutes = 10;
  
  // 2. 16:00後才開始計算加班
  if (outTime > STANDARD_END + bufferMinutes) {
    const totalOvertimeMinutes = outTime - STANDARD_END;
    
    // 3. 階梯式計算OT1：10→40→70→100分鐘
    if (totalOvertimeMinutes <= (120 + bufferMinutes)) { // 不超過18:00
      // 全部算OT1 (1.34倍)
      if (totalOvertimeMinutes > (100 + bufferMinutes)) {
        ot1 = 2.0; // 超過100分鐘 -> 2.0小時
      } else if (totalOvertimeMinutes > (70 + bufferMinutes)) {
        ot1 = 1.5; // 超過70分鐘 -> 1.5小時
      } else if (totalOvertimeMinutes > (40 + bufferMinutes)) {
        ot1 = 1.0; // 超過40分鐘 -> 1.0小時
      } else if (totalOvertimeMinutes > (10 + bufferMinutes)) {
        ot1 = 0.5; // 超過10分鐘 -> 0.5小時
      }
    } else {
      // 4. 超過18:00：前2小時算OT1，18:00後按0.5小時遞增計算OT2
      ot1 = 2.0; // 16:00-18:00固定2小時OT1
      const ot2Minutes = totalOvertimeMinutes - 120; // 18:00後的分鐘數
      
      // 重要：18:00後的時數必須按0.5小時遞增
      // 超過緩衝時間後，每30分鐘算0.5小時
      if (ot2Minutes > bufferMinutes) {
        const actualOT2Minutes = ot2Minutes - bufferMinutes;
        ot2 = Math.ceil(actualOT2Minutes / 30) * 0.5; // 每30分鐘或不足30分鐘都算0.5小時
      }
    }
  }
  
  return { ot1, ot2, total: ot1 + ot2 };
}

// 檢查數字是否符合0.5小時遞增規則
function checkHalfHourIncrement(hours) {
  const decimal = hours - Math.floor(hours);
  return decimal === 0 || Math.abs(decimal - 0.5) < 0.001;
}

console.log('=== 0.5小時遞增邏輯測試 ===\n');

const testCases = [
  { name: '測試1', clockIn: '07:40', clockOut: '18:01', desc: '18:00後1分鐘' },
  { name: '測試2', clockIn: '07:40', clockOut: '18:15', desc: '18:00後15分鐘' },
  { name: '測試3', clockIn: '07:40', clockOut: '18:30', desc: '18:00後30分鐘' },
  { name: '測試4', clockIn: '07:40', clockOut: '18:45', desc: '18:00後45分鐘' },
  { name: '測試5', clockIn: '07:40', clockOut: '19:00', desc: '19:00整點' },
  { name: '測試6', clockIn: '07:40', clockOut: '19:08', desc: '6/11實際案例' },
  { name: '測試7', clockIn: '07:40', clockOut: '19:15', desc: '19:15' },
  { name: '測試8', clockIn: '07:40', clockOut: '19:30', desc: '19:30' },
  { name: '測試9', clockIn: '07:40', clockOut: '20:00', desc: '20:00整點' },
  { name: '測試10', clockIn: '07:40', clockOut: '20:30', desc: '20:30' }
];

let allPassed = true;

testCases.forEach(testCase => {
  const result = calculateOvertimeWithHalfHourIncrement(testCase.clockIn, testCase.clockOut);
  
  const ot1Valid = checkHalfHourIncrement(result.ot1);
  const ot2Valid = checkHalfHourIncrement(result.ot2);
  const totalValid = checkHalfHourIncrement(result.total);
  
  console.log(`${testCase.name} (${testCase.desc}):`);
  console.log(`  時間: ${testCase.clockIn}-${testCase.clockOut}`);
  console.log(`  OT1: ${result.ot1.toFixed(1)}h ${ot1Valid ? '✓' : '✗'}`);
  console.log(`  OT2: ${result.ot2.toFixed(1)}h ${ot2Valid ? '✓' : '✗'}`);
  console.log(`  總計: ${result.total.toFixed(1)}h ${totalValid ? '✓' : '✗'}`);
  
  if (!ot1Valid || !ot2Valid || !totalValid) {
    console.log(`  ❌ 不符合0.5小時遞增規則`);
    allPassed = false;
  } else {
    console.log(`  ✅ 符合規則`);
  }
  console.log('');
});

console.log('=== 總結 ===');
if (allPassed) {
  console.log('✅ 所有測試通過！加班時數只有0或5的小數部分。');
} else {
  console.log('❌ 某些測試未通過，需要調整計算邏輯。');
}

// 特別檢查6/11案例
console.log('\n=== 6/11案例特別檢查 ===');
const case6_11 = calculateOvertimeWithHalfHourIncrement('07:40', '19:08');
console.log(`6/11 (07:40-19:08): OT1=${case6_11.ot1}h, OT2=${case6_11.ot2}h, 總計=${case6_11.total}h`);

// 檢查每個小時值的小數部分
const checkDecimal = (value, name) => {
  const decimal = (value * 10) % 10;
  if (decimal === 0 || decimal === 5) {
    console.log(`✅ ${name}: ${value}h (小數部分: ${decimal/10})`);
  } else {
    console.log(`❌ ${name}: ${value}h (小數部分: ${decimal/10}) - 應該只有0或5`);
  }
};

checkDecimal(case6_11.ot1, 'OT1');
checkDecimal(case6_11.ot2, 'OT2');
checkDecimal(case6_11.total, '總計');