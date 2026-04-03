import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAdmin } from '@/hooks/useAdmin';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Pencil, Trash2, BadgeAlert, Lock, Copy, CheckCircle, XCircle, QrCode } from 'lucide-react';
import { useLocation } from 'wouter';
import AdminLoginDialog from '@/components/AdminLoginDialog';
import { debugLog } from '@/lib/debug';

interface Employee {
  id: number;
  name: string;
  idNumber: string; // 身分證字號或護照號碼
  scanIdNumber?: string;
  isEncrypted?: boolean; // 標記是否已 AES 加密
  employeeType?: 'local' | 'foreign'; // 'local'=本地員工, 'foreign'=外籍員工
  position: string;
  department: string;
  email: string;
  phone: string;
  active: boolean;
  createdAt: string;
}

interface EmployeeFormData {
  name: string;
  idNumber: string;
  employeeType: 'local' | 'foreign';
  position: string;
  department: string;
  email: string;
  phone: string;
  active: boolean;
  useEncryption?: boolean; // 是否使用 AES 加密
  isEncrypted?: boolean;   // 標記ID是否已加密，用於數據庫儲存
}

const initialFormData: EmployeeFormData = {
  name: '',
  idNumber: '',
  employeeType: 'local',
  position: '',
  department: '',
  email: '',
  phone: '',
  active: true,
  useEncryption: false,
  isEncrypted: false
};

export default function EmployeesPage() {
  const { toast } = useToast();
  const { isAdmin } = useAdmin();
  const queryClient = useQueryClient();
  
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState<boolean>(false);
  const [isAdminDialogOpen, setIsAdminDialogOpen] = useState<boolean>(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [deletingEmployee, setDeletingEmployee] = useState<Employee | null>(null);
  const [formData, setFormData] = useState<EmployeeFormData>(initialFormData);
  
  // 獲取所有員工數據
  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['/api/employees/admin'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/employees/admin');
      return response.json();
    },
    enabled: isAdmin // 只有管理員可以查看
  });
  
  // 創建新員工
  const createMutation = useMutation({
    mutationFn: async (data: EmployeeFormData) => {
      const response = await apiRequest('POST', '/api/employees', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/employees'] });
      queryClient.invalidateQueries({ queryKey: ['/api/employees/admin'] });
      setIsDialogOpen(false);
      toast({
        title: "成功新增",
        description: "員工已成功新增",
      });
    },
    onError: (error: any) => {
      toast({
        title: "新增失敗",
        description: error.message || "無法新增員工，請重試",
        variant: "destructive"
      });
    }
  });
  
  // 更新員工
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number, data: EmployeeFormData }) => {
      debugLog('提交更新資料:', JSON.stringify(data));
      
      const response = await apiRequest('PUT', `/api/employees/${id}`, data);
      const result = await response.json();
      debugLog('更新結果:', JSON.stringify(result));
      return result;
    },
    onSuccess: (updatedEmployee) => {
      // 立即更新快取，不等待非同步重取，避免畫面短暫顯示舊資料
      queryClient.setQueryData(['/api/employees/admin'], (oldData: Employee[] | undefined) => {
        if (!oldData) return oldData;
        return oldData.map(emp => emp.id === updatedEmployee.id ? updatedEmployee : emp);
      });
      queryClient.invalidateQueries({ queryKey: ['/api/employees'] });
      queryClient.invalidateQueries({ queryKey: ['/api/employees/admin'] });
      setIsDialogOpen(false);
      toast({
        title: "成功更新",
        description: "員工資料已成功更新",
      });
    },
    onError: (error: any) => {
      toast({
        title: "更新失敗",
        description: error.message || "無法更新員工資料，請重試",
        variant: "destructive"
      });
    }
  });
  
  // 刪除員工
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest('DELETE', `/api/employees/${id}`);
      return response.status === 204 ? null : response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/employees'] });
      queryClient.invalidateQueries({ queryKey: ['/api/employees/admin'] });
      setIsDeleteDialogOpen(false);
      toast({
        title: "成功刪除",
        description: "員工已成功刪除",
      });
    },
    onError: (error: any) => {
      toast({
        title: "刪除失敗",
        description: error.message || "無法刪除員工，請重試",
        variant: "destructive"
      });
    }
  });
  
  // 提交表單
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // 表單驗證
    if (!formData.name || !formData.idNumber) {
      toast({
        title: "資料不完整",
        description: "姓名和身分證號碼為必填項目",
        variant: "destructive"
      });
      return;
    }
    
    // 複製表單數據，並確保傳遞正確的加密選項
    const processedData = { ...formData };
    
    // 加密選項處理 - 重要變更：不再在前端進行加密，只傳遞加密選項
    // 將加密操作完全移至後端處理
    
    // 設置 useEncryption 標記 - 這將被傳遞到後端
    processedData.useEncryption = !!processedData.useEncryption;
    
    // 由於處理邏輯變更，移除前端的 isEncrypted 設置
    // 讓後端根據 useEncryption 設置 isEncrypted
    
    if (editingEmployee) {
      // 更新現有員工
      updateMutation.mutate({ id: editingEmployee.id, data: processedData });
    } else {
      // 創建新員工
      createMutation.mutate(processedData);
    }
  };
  
  // 編輯員工
  const handleEdit = (employee: Employee) => {
    setEditingEmployee(employee);

    const isIdNumberEncrypted = employee.isEncrypted || false;

    setFormData({
      name: employee.name,
      idNumber: employee.idNumber,
      employeeType: employee.employeeType || 'local',
      position: employee.position || '',
      department: employee.department || '',
      email: employee.email || '',
      phone: employee.phone || '',
      active: employee.active,
      useEncryption: isIdNumberEncrypted,
      isEncrypted: isIdNumberEncrypted
    });
    setIsDialogOpen(true);
  };
  
  // 刪除確認
  const handleDeleteConfirm = (employee: Employee) => {
    setDeletingEmployee(employee);
    setIsDeleteDialogOpen(true);
  };
  
  // 執行刪除
  const confirmDelete = () => {
    if (deletingEmployee) {
      deleteMutation.mutate(deletingEmployee.id);
    }
  };
  
  // 建立新員工
  const handleCreateNew = () => {
    if (!isAdmin) {
      setIsAdminDialogOpen(true);
      return;
    }
    
    setEditingEmployee(null);
    setFormData(initialFormData);
    setIsDialogOpen(true);
  };
  
  // 欄位更新
  const handleInputChange = (field: keyof EmployeeFormData, value: any) => {
    // 如果切換加密選項，需要特殊處理
    if (field === 'useEncryption') {
      const useEncryption = value === true;
      
      // 當啟用加密時，設定開關即可，實際加密在提交時處理
      if (useEncryption && formData.idNumber) {
        // 啟用加密時無需立即加密，只在提交時加密，這裡只是更新開關狀態
      }
      
      // 當禁用加密時，不做特殊處理，提交時會保留原始值
      // 同時更新 isEncrypted 的值與 useEncryption 同步
      setFormData(prev => ({
        ...prev,
        useEncryption,
        isEncrypted: useEncryption
      }));
    } else {
      // 一般欄位更新
      setFormData(prev => ({
        ...prev,
        [field]: value
      }));
    }
  };
  
  // 管理員登入成功
  const handleAdminLoginSuccess = () => {
    setIsAdminDialogOpen(false);
    toast({
      title: "管理員驗證成功",
      description: "您現在可以管理員工資料",
    });
  };
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">員工管理</h1>
        <Button onClick={handleCreateNew} className="flex items-center">
          <Plus className="mr-2 h-4 w-4" />
          新增員工
        </Button>
      </div>
      
      {!isAdmin && (
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="pt-6 flex items-center">
            <BadgeAlert className="text-amber-500 mr-2 h-5 w-5" />
            <p className="text-amber-800">需要管理員權限才能查看和管理員工資料</p>
          </CardContent>
        </Card>
      )}
      
      {isAdmin && isLoading && (
        <div className="text-center py-10">載入中...</div>
      )}
      
      {isAdmin && !isLoading && employees.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">尚未添加任何員工。點擊「新增員工」按鈕開始添加。</p>
          </CardContent>
        </Card>
      )}
      
      {isAdmin && !isLoading && employees.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>姓名</TableHead>
                  <TableHead>證件號碼</TableHead>
                  <TableHead>部門</TableHead>
                  <TableHead>職位</TableHead>
                  <TableHead>狀態</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((employee: Employee) => (
                  <TableRow key={employee.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5">
                        {employee.name}
                        {employee.employeeType === 'foreign' && (
                          <span
                            title="外籍員工（護照號碼）"
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700"
                          >
                            外
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono">
                      <div className="flex items-center">
                        <span
                          title={employee.isEncrypted ? "系統以 AES 加密形式儲存" : ""}
                          className="truncate mr-1 max-w-[120px]"
                        >
                          {employee.idNumber}
                        </span>
                        <span className="text-xs text-muted-foreground mr-1">
                          {employee.employeeType === 'foreign' ? '(護照)' : '(身分證)'}
                        </span>

                        {employee.isEncrypted && (
                          <span
                            title="資料庫內為 AES 加密儲存"
                            className="text-amber-600 bg-amber-50 rounded-full p-1"
                          >
                            <Lock className="h-3 w-3" />
                          </span>
                        )}
                        
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 ml-1"
                          title="複製掃碼專用 ID"
                          onClick={(e) => {
                            e.stopPropagation();
                            const scanIdNumber = employee.scanIdNumber || employee.idNumber;

                            navigator.clipboard.writeText(scanIdNumber);
                            toast({
                              title: "已複製掃碼 ID",
                              description: "掃碼專用 ID 已複製到剪貼簿，可直接用於條碼掃描。",
                            });
                          }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>{employee.department || '-'}</TableCell>
                    <TableCell>{employee.position || '-'}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${
                        employee.active 
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {employee.active ? '在職中' : '離職'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleEdit(employee)}
                        title="編輯"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleDeleteConfirm(employee)}
                        title="刪除"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      
      {/* 新增/編輯員工對話框 */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingEmployee ? '編輯員工' : '新增員工'}</DialogTitle>
            <DialogDescription>
              {editingEmployee 
                ? '更新員工資料並保存' 
                : '輸入新員工的資料'}
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">姓名 *</Label>
              <Input 
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="例如：王小明"
                required
              />
            </div>
            
            <div className="flex gap-4 pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="employeeType"
                  value="local"
                  checked={formData.employeeType === 'local'}
                  onChange={() => handleInputChange('employeeType', 'local')}
                  className="accent-primary"
                />
                <span className="text-sm">本地員工（身分證）</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="employeeType"
                  value="foreign"
                  checked={formData.employeeType === 'foreign'}
                  onChange={() => handleInputChange('employeeType', 'foreign')}
                  className="accent-primary"
                />
                <span className="text-sm flex items-center gap-1">
                  外籍員工（護照號碼）
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700">外</span>
                </span>
              </label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="idNumber">
                {formData.employeeType === 'foreign' ? '護照號碼' : '身分證號碼'} *
              </Label>
              <Input
                id="idNumber"
                value={formData.idNumber}
                onChange={(e) => handleInputChange('idNumber', e.target.value)}
                placeholder={formData.employeeType === 'foreign' ? '例如：E01839502' : '例如：A123456789'}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="department">部門</Label>
              <Input 
                id="department"
                value={formData.department}
                onChange={(e) => handleInputChange('department', e.target.value)}
                placeholder="例如：行政部"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="position">職位</Label>
              <Input 
                id="position"
                value={formData.position}
                onChange={(e) => handleInputChange('position', e.target.value)}
                placeholder="例如：專員"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email">電子郵件</Label>
              <Input 
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder="例如：employee@example.com"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="phone">電話</Label>
              <Input 
                id="phone"
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                placeholder="例如：0912345678"
              />
            </div>
            
            <div className="flex items-center space-x-2 pt-2">
              <Checkbox 
                id="active"
                checked={formData.active}
                onCheckedChange={(checked) => 
                  handleInputChange('active', checked === true)}
              />
              <Label htmlFor="active" className="cursor-pointer">員工目前在職中</Label>
            </div>
            
            <div className="flex items-center space-x-2 pt-2">
              <Checkbox 
                id="useEncryption"
                checked={formData.useEncryption}
                onCheckedChange={(checked) => 
                  handleInputChange('useEncryption', checked === true)}
              />
              <Label htmlFor="useEncryption" className="cursor-pointer flex items-center">
                <Lock className="h-4 w-4 mr-1 text-amber-600" />
                使用加密保護身分證號碼 (用於條碼掃描)
              </Label>
            </div>
            
            <DialogFooter className="sm:justify-end">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsDialogOpen(false)}
              >
                取消
              </Button>
              <Button type="submit">
                {editingEmployee ? '更新' : '新增'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      
      {/* 刪除確認對話框 */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>確認刪除</DialogTitle>
            <DialogDescription>
              您確定要刪除員工 {deletingEmployee?.name} 嗎？
              此操作無法撤銷。
            </DialogDescription>
          </DialogHeader>
          
          <DialogFooter className="sm:justify-end">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              取消
            </Button>
            <Button 
              type="button" 
              variant="destructive"
              onClick={confirmDelete}
            >
              確認刪除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* 管理員登入對話框 */}
      <AdminLoginDialog
        isOpen={isAdminDialogOpen}
        onClose={() => setIsAdminDialogOpen(false)}
        onSuccess={handleAdminLoginSuccess}
      />

      {/* LINE 綁定審核區塊 */}
      {isAdmin && <LineBindingAdmin />}
    </div>
  );
}

// ── LINE 綁定審核元件 ─────────────────────────────────────────────────────────

interface PendingBinding {
  id: number;
  employeeId: number;
  employeeName: string;
  lineUserId: string;
  lineDisplayName?: string;
  linePictureUrl?: string;
  status: string;
  requestedAt?: string;
}

function LineBindingAdmin() {
  const { toast } = useToast();
  const { isAdmin } = useAdmin();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: bindings = [], isLoading } = useQuery<PendingBinding[]>({
    queryKey: ['/api/line/pending-bindings'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/line/pending-bindings');
      return res.json();
    },
    enabled: isAdmin,
    refetchInterval: 30000
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => apiRequest('POST', `/api/line/pending-bindings/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/line/pending-bindings'] });
      toast({ title: '已核准 LINE 綁定' });
    }
  });

  const rejectMutation = useMutation({
    mutationFn: (id: number) => apiRequest('POST', `/api/line/pending-bindings/${id}/reject`, { reason: '申請未通過審核' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/line/pending-bindings'] });
      toast({ title: '已拒絕 LINE 綁定' });
    }
  });

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="text-green-600">LINE</span> 綁定審核
            {bindings.length > 0 && (
              <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5">
                {bindings.length}
              </span>
            )}
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            className="gap-1 text-green-700 border-green-300 hover:bg-green-50"
            onClick={() => setLocation('/qrcode')}
          >
            <QrCode className="h-4 w-4" />
            打卡 QR Code
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-gray-400 text-sm text-center py-4">載入中...</p>
        ) : bindings.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">目前沒有待審核的 LINE 綁定申請</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>員工</TableHead>
                <TableHead>LINE 帳號</TableHead>
                <TableHead>申請時間</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bindings.map(b => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.employeeName}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {b.linePictureUrl && (
                        <img src={b.linePictureUrl} alt="" className="w-7 h-7 rounded-full" />
                      )}
                      <span className="text-sm">{b.lineDisplayName ?? b.lineUserId}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {b.requestedAt ? new Date(b.requestedAt).toLocaleDateString('zh-TW') : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-green-700 border-green-300 hover:bg-green-50"
                        onClick={() => approveMutation.mutate(b.id)}
                        disabled={approveMutation.isPending}
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        核准
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-red-600 border-red-300 hover:bg-red-50"
                        onClick={() => rejectMutation.mutate(b.id)}
                        disabled={rejectMutation.isPending}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        拒絕
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
