/**
 * 測試修正後的加班計算邏輯
 * 根據最終要求驗證
 */

function timeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * 修正後的加班計算邏輯
 * 1. 早到從8:00開始記薪
 * 2. 10分鐘緩衝
 * 3. 階梯：10→40→70→100分鐘
 * 4. 18:00後全部1.67倍
 */
function calculateOvertimeCorrected(clockIn, clockOut) {
  console.log(`\n=== 計算 ${clockIn} - ${clockOut} ===`);
  
  let inTime = timeToMinutes(clockIn);
  const outTime = timeToMinutes(clockOut);
  
  console.log(`原始時間: ${clockIn} (${inTime}分) → ${clockOut} (${outTime}分)`);
  
  // 1. 早到處理：如果早於8:00上班，從8:00開始記薪
  const WORK_START = timeToMinutes('08:00'); // 480分鐘
  if (inTime < WORK_START) {
    console.log(`早到處理: ${clockIn} → 08:00 (${inTime}分 → ${WORK_START}分)`);
    inTime = WORK_START;
  }
  
  const STANDARD_END = timeToMinutes('16:00'); // 960分鐘
  const OT1_END = timeToMinutes('18:00');      // 1080分鐘
  
  let ot1 = 0;
  let ot2 = 0;
  const bufferMinutes = 10; // 10分鐘緩衝時間
  
  console.log(`標準下班: 16:00 (${STANDARD_END}分), 緩衝時間: ${bufferMinutes}分`);
  
  // 2. 16:00後才開始計算加班
  if (outTime > STANDARD_END + bufferMinutes) {
    const totalOvertimeMinutes = outTime - STANDARD_END;
    console.log(`總加班分鐘: ${outTime} - ${STANDARD_END} = ${totalOvertimeMinutes}分 (${(totalOvertimeMinutes/60).toFixed(2)}時)`);
    
    // 3. 階梯式計算OT1：10→40→70→100分鐘
    if (totalOvertimeMinutes <= (120 + bufferMinutes)) { // 不超過18:00+緩衝
      console.log(`不超過18:00+緩衝(${120 + bufferMinutes}分)，全部算OT1`);
      
      // 階梯計算
      if (totalOvertimeMinutes > (100 + bufferMinutes)) {
        ot1 = 2.0; // 超過100分鐘 -> 2.0小時
        console.log(`超過${100 + bufferMinutes}分鐘 → OT1 = 2.0小時`);
      } else if (totalOvertimeMinutes > (70 + bufferMinutes)) {
        ot1 = 1.5; // 超過70分鐘 -> 1.5小時
        console.log(`超過${70 + bufferMinutes}分鐘 → OT1 = 1.5小時`);
      } else if (totalOvertimeMinutes > (40 + bufferMinutes)) {
        ot1 = 1.0; // 超過40分鐘 -> 1.0小時
        console.log(`超過${40 + bufferMinutes}分鐘 → OT1 = 1.0小時`);
      } else if (totalOvertimeMinutes > (10 + bufferMinutes)) {
        ot1 = 0.5; // 超過10分鐘 -> 0.5小時
        console.log(`超過${10 + bufferMinutes}分鐘 → OT1 = 0.5小時`);
      } else {
        console.log(`未超過${10 + bufferMinutes}分鐘 → 無加班`);
      }
    } else {
      // 4. 超過18:00：前2小時算OT1，18:00後全部算OT2 (1.67倍)
      console.log(`超過18:00+緩衝(${120 + bufferMinutes}分)，分別計算OT1和OT2`);
      ot1 = 2.0; // 16:00-18:00固定2小時OT1
      const ot2Minutes = totalOvertimeMinutes - 120; // 18:00後的分鐘數
      ot2 = ot2Minutes / 60; // 18:00後全部按實際時間計算
      console.log(`OT1: 16:00-18:00 = 2.0小時`);
      console.log(`OT2: 18:00後 ${ot2Minutes}分鐘 = ${ot2.toFixed(2)}小時`);
    }
  } else {
    console.log(`未超過16:00+緩衝(${STANDARD_END + bufferMinutes}分)，無加班`);
  }
  
  console.log(`結果: OT1=${ot1.toFixed(1)}h, OT2=${ot2.toFixed(1)}h, 總計=${(ot1 + ot2).toFixed(1)}h`);
  
  return { ot1, ot2, total: ot1 + ot2 };
}

// 測試關鍵案例
console.log('=== 測試修正後的計算邏輯 ===');

// 測試案例1: 6/2 (07:36-18:15)
const case1 = calculateOvertimeCorrected('07:36', '18:15');

// 測試案例2: 6/11 (07:40-19:08)
const case2 = calculateOvertimeCorrected('07:40', '19:08');

console.log('\n=== 總結 ===');
console.log(`6/2 (07:36-18:15): ${case1.total.toFixed(1)}小時`);
console.log(`6/11 (07:40-19:08): ${case2.total.toFixed(1)}小時`);
console.log('');

if (Math.abs(case2.total - 3.5) < 0.1) {
  console.log('⚠️  6/11仍顯示3.5小時，可能系統還在使用舊邏輯！');
} else {
  console.log('✅ 6/11計算正確，應該是3.1小時左右');
}