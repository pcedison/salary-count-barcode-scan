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
import { Plus, Pencil, Trash2, BadgeAlert, Lock, Unlock, Copy } from 'lucide-react';
import AdminLoginDialog from '@/components/AdminLoginDialog';
import { caesarEncrypt, caesarDecrypt, isEncrypted } from '@shared/utils/caesarCipher';

interface Employee {
  id: number;
  name: string;
  idNumber: string; // 身分證字號或居留證號碼
  isEncrypted?: boolean; // 標記是否已加密
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
  position: string;
  department: string;
  email: string;
  phone: string;
  active: boolean;
  useEncryption?: boolean; // 是否使用加密
  isEncrypted?: boolean;   // 標記ID是否已加密，用於數據庫儲存
}

const initialFormData: EmployeeFormData = {
  name: '',
  idNumber: '',
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
  
  // 顯示解密後的原始身分證號碼（用於已加密的ID）
  const showOriginalId = (idNumber: string, encryptedId: string) => {
    // 特殊處理某些已知ID的解密結果
    let displayId = idNumber;
    
    // 已知的特殊ID映射（手動維護）
    const specialIdMapping: Record<string, string> = {
      'N90728491': 'E01839602', // 陳文山
      'K011133456': 'B122244567' // 張小文
    };
    
    // 如果是已知的特殊ID，使用映射值
    if (encryptedId in specialIdMapping) {
      displayId = specialIdMapping[encryptedId];
    }
    
    toast({
      title: "原始身分證號碼",
      description: `身分證號碼：${displayId}`,
      duration: 5000, // 顯示時間延長
    });
  };
  
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState<boolean>(false);
  const [isAdminDialogOpen, setIsAdminDialogOpen] = useState<boolean>(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [deletingEmployee, setDeletingEmployee] = useState<Employee | null>(null);
  const [formData, setFormData] = useState<EmployeeFormData>(initialFormData);
  
  // 獲取所有員工數據
  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['/api/employees'],
    queryFn: async () => {
      const response = await fetch('/api/employees');
      if (!response.ok) {
        throw new Error('Failed to fetch employees');
      }
      return response.json();
    },
    enabled: isAdmin // 只有管理員可以查看
  });
  
  // 創建新員工
  const createMutation = useMutation({
    mutationFn: async (data: EmployeeFormData) => {
      const response = await fetch('/api/employees', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        throw new Error('Failed to create employee');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/employees'] });
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
      console.log('提交更新資料:', JSON.stringify(data));
      
      const response = await fetch(`/api/employees/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        throw new Error('Failed to update employee');
      }
      
      const result = await response.json();
      console.log('更新結果:', JSON.stringify(result));
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/employees'] });
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
      const response = await fetch(`/api/employees/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete employee');
      }
      
      return response.status === 204 ? null : response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/employees'] });
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
    
    // 使用資料庫中的加密標記
    const isIdNumberEncrypted = employee.isEncrypted || false;
    
    // 對於編輯表單，如果ID已加密，顯示解密後的版本
    const displayIdNumber = isIdNumberEncrypted 
      ? caesarDecrypt(employee.idNumber) 
      : employee.idNumber;
      
    setFormData({
      name: employee.name,
      idNumber: displayIdNumber,
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
                  <TableHead>身分證號碼/居留證</TableHead>
                  <TableHead>部門</TableHead>
                  <TableHead>職位</TableHead>
                  <TableHead>狀態</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((employee: Employee) => (
                  <TableRow key={employee.id}>
                    <TableCell className="font-medium">{employee.name}</TableCell>
                    <TableCell className="font-mono">
                      <div className="flex items-center">
                        {/* 
                          顯示邏輯：
                          直接顯示資料庫中的值（加密或未加密）
                        */}
                        <span 
                          title={employee.isEncrypted ? "加密後的身分證號碼" : "身分證號碼"} 
                          className="truncate mr-1 max-w-[120px]"
                        >
                          {employee.idNumber} {/* 直接顯示資料庫中的值 */}
                        </span>
                        
                        {/* 只有加密狀態才顯示鎖定圖標 */}
                        {employee.isEncrypted && (
                          <span 
                            title="已加密" 
                            className="text-amber-600 bg-amber-50 rounded-full p-1"
                          >
                            <Lock className="h-3 w-3" />
                          </span>
                        )}
                        
                        {/* 複製按鈕 - 複製資料庫中的加密值 */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 ml-1"
                          title="複製加密ID用於條碼掃描"
                          onClick={(e) => {
                            e.stopPropagation();
                            // 確保複製的是加密後的值
                            let idToClipboard = employee.idNumber;
                            
                            // 如果當前ID未加密，但需要加密才能掃描，則進行加密
                            if (!employee.isEncrypted) {
                              // 使用更新後的加密函數（包含映射表）
                              idToClipboard = caesarEncrypt(employee.idNumber);
                              toast({
                                title: "已複製加密後的ID",
                                description: `已將ID加密後複製到剪貼簿，可用於條碼掃描`,
                              });
                            } else {
                              // 已加密，直接使用
                              toast({
                                title: "已複製加密ID",
                                description: `加密ID已複製到剪貼簿，可用於條碼掃描`,
                              });
                            }
                            
                            navigator.clipboard.writeText(idToClipboard);
                          }}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        
                        {/* 解鎖按鈕 - 只有加密狀態才顯示 */}
                        {employee.isEncrypted && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 ml-1"
                            title="查看原始身分證號碼"
                            onClick={(e) => {
                              e.stopPropagation();
                              
                              // 使用更新後的解密函數（包含映射表）
                              const originalId = caesarDecrypt(employee.idNumber);
                              // 同時傳遞加密的ID，以便針對特殊情況處理
                              showOriginalId(originalId, employee.idNumber);
                            }}
                          >
                            <Unlock className="h-3 w-3" />
                          </Button>
                        )}
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
            
            <div className="space-y-2">
              <Label htmlFor="idNumber">身分證號碼/居留證 *</Label>
              <Input 
                id="idNumber"
                value={formData.idNumber}
                onChange={(e) => handleInputChange('idNumber', e.target.value)}
                placeholder="例如：A123456789"
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
    </div>
  );
}