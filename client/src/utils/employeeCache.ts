/**
 * 員工資料緩存工具
 * 用於減少對員工資料的重複請求，提高性能
 */

// 簡單的員工資料緩存
export const employeeCache = new Map<number, any>();

// 初始化員工資料緩存
export function initEmployeeCache(employees: any[]) {
  if (!Array.isArray(employees)) return;
  
  employees.forEach(emp => {
    if (emp && emp.id) {
      employeeCache.set(emp.id, {
        id: emp.id,
        name: emp.name || '未知姓名',
        department: emp.department || '未指定部門',
        idNumber: emp.idNumber || ''
      });
    }
  });
  
  console.log(`員工緩存已初始化，共 ${employeeCache.size} 名員工`);
}

// 從緩存中獲取員工資料
export function getEmployeeFromCache(id: number) {
  return employeeCache.get(id);
}

// 更新緩存中的員工資料
export function updateEmployeeCache(employee: any) {
  if (employee && employee.id) {
    employeeCache.set(employee.id, {
      id: employee.id,
      name: employee.name || '未知姓名',
      department: employee.department || '未指定部門',
      idNumber: employee.idNumber || ''
    });
    console.log(`員工緩存已更新: ${employee.name}`);
  }
}

// 清除員工緩存
export function clearEmployeeCache() {
  employeeCache.clear();
  console.log('員工緩存已清除');
}