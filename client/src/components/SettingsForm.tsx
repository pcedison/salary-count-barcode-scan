import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-time-picker';

interface SettingsFormProps {
  baseHourlyRate: number;
  baseMonthSalary: number;
  welfareAllowance: number;
  ot1Multiplier: number;
  ot2Multiplier: number;
  deductions: Array<{ name: string; amount: number; description: string }>;
  holidays: Array<{ id: number; date: string; description: string }>;
  newHolidayDate: string;
  newHolidayDescription: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  connectionStatus: 'connected' | 'disconnected' | 'testing' | 'migrating';
  isSupabaseActive: boolean; // 是否使用 Supabase
  isAdmin?: boolean; // 是否為管理員
  
  onBaseHourlyRateChange: (value: number) => void;
  onBaseMonthSalaryChange: (value: number) => void;
  onWelfareAllowanceChange: (value: number) => void;
  onOt1MultiplierChange: (value: number) => void;
  onOt2MultiplierChange: (value: number) => void;
  onAddDeduction: () => void;
  onUpdateDeduction: (index: number, field: string, value: string | number) => void;
  onDeleteDeduction: (index: number) => void;
  onNewHolidayDateChange: (value: string) => void;
  onNewHolidayDescriptionChange: (value: string) => void;
  onAddHoliday: () => void;
  onDeleteHoliday: (id: number) => void;
  onSupabaseUrlChange: (value: string) => void;
  onSupabaseAnonKeyChange: (value: string) => void;
  onTestConnection: () => void;
  onMigrateData: () => void;
  onToggleDatabase?: (enableSupabase: boolean) => void; // 切換數據庫類型
}

export default function SettingsForm({
  baseHourlyRate,
  baseMonthSalary,
  welfareAllowance,
  ot1Multiplier,
  ot2Multiplier,
  deductions,
  holidays,
  newHolidayDate,
  newHolidayDescription,
  supabaseUrl,
  supabaseAnonKey,
  connectionStatus,
  isSupabaseActive = false,
  isAdmin = false,
  onBaseHourlyRateChange,
  onBaseMonthSalaryChange,
  onWelfareAllowanceChange,
  onOt1MultiplierChange,
  onOt2MultiplierChange,
  onAddDeduction,
  onUpdateDeduction,
  onDeleteDeduction,
  onNewHolidayDateChange,
  onNewHolidayDescriptionChange,
  onAddHoliday,
  onDeleteHoliday,
  onSupabaseUrlChange,
  onSupabaseAnonKeyChange,
  onTestConnection,
  onMigrateData,
  onToggleDatabase
}: SettingsFormProps) {
  // Handle numeric input changes
  const handleNumericChange = (setter: (value: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value)) {
      setter(value);
    }
  };
  
  return (
    <div className="space-y-8">
      {/* Calculation Settings Section */}
      <div className="bg-white p-6 rounded-lg shadow-sm">
        <h3 className="text-lg font-medium mb-4">薪資計算設定</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label htmlFor="baseHourlyRate" className="block text-sm font-medium text-gray-700">基本時薪</label>
            <div className="flex">
              <Input 
                id="baseHourlyRate" 
                type="number" 
                value={baseHourlyRate} 
                onChange={handleNumericChange(onBaseHourlyRateChange)}
                className={`w-full px-4 py-2 border border-gray-300 rounded-l-md focus:ring-primary focus:border-primary font-['Roboto_Mono'] ${!isAdmin ? 'bg-gray-50 opacity-80' : ''}`}
                step="0.01"
                disabled={!isAdmin}
                readOnly={!isAdmin}
              />
              <span className="inline-flex items-center px-3 py-2 rounded-r-md border border-l-0 border-gray-300 bg-gray-50 text-gray-500">元/小時</span>
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="baseMonthSalary" className="block text-sm font-medium text-gray-700">基本月薪</label>
            <div className="flex">
              <Input 
                id="baseMonthSalary" 
                type="number" 
                value={baseMonthSalary} 
                onChange={handleNumericChange(onBaseMonthSalaryChange)}
                className={`w-full px-4 py-2 border border-gray-300 rounded-l-md focus:ring-primary focus:border-primary font-['Roboto_Mono'] ${!isAdmin ? 'bg-gray-50 opacity-80' : ''}`}
                disabled={!isAdmin}
                readOnly={!isAdmin}
              />
              <span className="inline-flex items-center px-3 py-2 rounded-r-md border border-l-0 border-gray-300 bg-gray-50 text-gray-500">元/月</span>
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="welfareAllowance" className="block text-sm font-medium text-gray-700">福利金</label>
            <div className="flex">
              <Input 
                id="welfareAllowance" 
                type="number" 
                value={welfareAllowance} 
                onChange={handleNumericChange(onWelfareAllowanceChange)}
                className={`w-full px-4 py-2 border border-gray-300 rounded-l-md focus:ring-primary focus:border-primary font-['Roboto_Mono'] ${!isAdmin ? 'bg-gray-50 opacity-80' : ''}`}
                disabled={!isAdmin}
                readOnly={!isAdmin}
              />
              <span className="inline-flex items-center px-3 py-2 rounded-r-md border border-l-0 border-gray-300 bg-gray-50 text-gray-500">元/月</span>
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="ot1Multiplier" className="block text-sm font-medium text-gray-700">加班倍率 (前2小時)</label>
            <div className="flex">
              <Input 
                id="ot1Multiplier" 
                type="number" 
                value={ot1Multiplier} 
                onChange={handleNumericChange(onOt1MultiplierChange)}
                className={`w-full px-4 py-2 border border-gray-300 rounded-l-md focus:ring-primary focus:border-primary font-['Roboto_Mono'] ${!isAdmin ? 'bg-gray-50 opacity-80' : ''}`}
                step="0.01"
                disabled={!isAdmin}
                readOnly={!isAdmin}
              />
              <span className="inline-flex items-center px-3 py-2 rounded-r-md border border-l-0 border-gray-300 bg-gray-50 text-gray-500">倍</span>
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="ot2Multiplier" className="block text-sm font-medium text-gray-700">加班倍率 (超過2小時)</label>
            <div className="flex">
              <Input 
                id="ot2Multiplier" 
                type="number" 
                value={ot2Multiplier} 
                onChange={handleNumericChange(onOt2MultiplierChange)}
                className={`w-full px-4 py-2 border border-gray-300 rounded-l-md focus:ring-primary focus:border-primary font-['Roboto_Mono'] ${!isAdmin ? 'bg-gray-50 opacity-80' : ''}`}
                step="0.01"
                disabled={!isAdmin}
                readOnly={!isAdmin}
              />
              <span className="inline-flex items-center px-3 py-2 rounded-r-md border border-l-0 border-gray-300 bg-gray-50 text-gray-500">倍</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Deduction Settings Section */}
      <div className="bg-white p-6 rounded-lg shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium">扣款項目設定</h3>
          {isAdmin && (
            <button 
              className="text-primary hover:text-blue-700 text-sm flex items-center"
              onClick={onAddDeduction}
            >
              <span className="material-icons text-sm mr-1">add_circle</span>
              新增項目
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">項目名稱</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">金額</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">描述</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {deductions.map((deduction, index) => (
                <tr key={index} className={index % 2 === 1 ? 'bg-gray-50' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Input 
                      value={deduction.name} 
                      onChange={(e) => onUpdateDeduction(index, 'name', e.target.value)}
                      className={`px-2 py-1 border border-gray-300 rounded-md ${!isAdmin ? 'bg-gray-50 opacity-80' : ''}`}
                      disabled={!isAdmin}
                      readOnly={!isAdmin}
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <Input 
                      type="number" 
                      value={deduction.amount} 
                      onChange={(e) => onUpdateDeduction(index, 'amount', parseFloat(e.target.value))}
                      className={`px-2 py-1 border border-gray-300 rounded-md w-24 mx-auto font-['Roboto_Mono'] ${!isAdmin ? 'bg-gray-50 opacity-80' : ''}`}
                      disabled={!isAdmin}
                      readOnly={!isAdmin}
                    />
                  </td>
                  <td className="px-6 py-4">
                    <Input 
                      value={deduction.description || ''} 
                      onChange={(e) => onUpdateDeduction(index, 'description', e.target.value)}
                      className={`px-2 py-1 border border-gray-300 rounded-md ${!isAdmin ? 'bg-gray-50 opacity-80' : ''}`}
                      disabled={!isAdmin}
                      readOnly={!isAdmin}
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    {isAdmin && (
                      <button 
                        className="text-error hover:text-red-700"
                        onClick={() => onDeleteDeduction(index)}
                      >
                        <span className="material-icons text-sm">delete</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Holiday Settings Section */}
      <div className="bg-white p-6 rounded-lg shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium">假日設定</h3>
          {isAdmin && (
            <button 
              className="text-primary hover:text-blue-700 text-sm flex items-center"
              onClick={() => {
                // This would be implemented for file upload
                alert('此功能尚未實作');
              }}
            >
              <span className="material-icons text-sm mr-1">file_upload</span>
              匯入假日
            </button>
          )}
        </div>
        {isAdmin ? (
          <div className="space-y-4 mb-6 p-4 bg-gray-50 rounded-md">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">日期</label>
                <DateTimePicker
                  mode="date"
                  value={newHolidayDate}
                  onChange={onNewHolidayDateChange}
                  placeholder="選擇日期..."
                  className="w-full"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">假日名稱/事由</label>
                <Input
                  value={newHolidayName}
                  onChange={(e) => onNewHolidayNameChange(e.target.value)}
                  placeholder="例：元旦、病假、特休"
                  className="w-full"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">假日類型</label>
                <select
                  value={newHolidayType}
                  onChange={(e) => onNewHolidayTypeChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                >
                  <option value="national_holiday">國定假日</option>
                  <option value="sick_leave">病假</option>
                  <option value="personal_leave">事假</option>
                  <option value="annual_leave">特休</option>
                  <option value="typhoon_day">颱風假</option>
                  <option value="other">其他</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">薪資計算</label>
                <select
                  value={newHolidayPaid ? "paid" : "unpaid"}
                  onChange={(e) => onNewHolidayPaidChange(e.target.value === "paid")}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                >
                  <option value="paid">有薪</option>
                  <option value="unpaid">無薪</option>
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">額外說明（選填）</label>
              <Input
                value={newHolidayDescription}
                onChange={(e) => onNewHolidayDescriptionChange(e.target.value)}
                placeholder="額外說明或備註"
                className="w-full"
              />
            </div>
            <div className="flex justify-end">
              <Button 
                onClick={onAddHoliday}
                disabled={!newHolidayDate || !newHolidayName}
                className="bg-primary hover:bg-blue-700 text-white px-6 py-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                新增假日
              </Button>
            </div>
          </div>
        ) : (
          <div className="mb-4 text-sm text-gray-500 italic">
            登入管理員後方可新增假日
          </div>
        )}
        
        {/* Holiday List */}
        <div className="space-y-3">
          {holidays.length === 0 ? (
            <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-md">
              <span className="material-icons text-3xl mb-2 block text-gray-400">event_note</span>
              尚未設定假日
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">日期</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">名稱/事由</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">類型</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">薪資</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">說明</th>
                    {isAdmin && (
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {holidays.map((holiday, index) => (
                    <tr key={holiday.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-6 py-4 whitespace-nowrap font-['Roboto_Mono'] text-sm">
                        {holiday.date}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {holiday.name || holiday.description || '假日'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          holiday.type === 'national_holiday' ? 'bg-blue-100 text-blue-800' :
                          holiday.type === 'sick_leave' ? 'bg-red-100 text-red-800' :
                          holiday.type === 'personal_leave' ? 'bg-gray-100 text-gray-800' :
                          holiday.type === 'annual_leave' ? 'bg-green-100 text-green-800' :
                          holiday.type === 'typhoon_day' ? 'bg-orange-100 text-orange-800' :
                          'bg-purple-100 text-purple-800'
                        }`}>
                          {holiday.type === 'national_holiday' ? '國定假日' :
                           holiday.type === 'sick_leave' ? '病假' :
                           holiday.type === 'personal_leave' ? '事假' :
                           holiday.type === 'annual_leave' ? '特休' :
                           holiday.type === 'typhoon_day' ? '颱風假' :
                           '其他'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          holiday.isPaid ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {holiday.isPaid ? '有薪' : '無薪'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                        {holiday.description || '-'}
                      </td>
                      {isAdmin && (
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <button 
                            className="text-error hover:text-red-700 transition-colors"
                            onClick={() => onDeleteHoliday(holiday.id)}
                            title="刪除假日"
                          >
                            <span className="material-icons text-sm">delete</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      
      {/* Database Connection - 僅對管理員可見 */}
      {isAdmin && (
        <div className="bg-white p-6 rounded-lg shadow-sm">
          <h3 className="text-lg font-medium mb-4">資料庫連線設定</h3>
          
          {/* 資料庫類型切換 */}
          <div className="mb-6 p-4 bg-gray-50 rounded-md">
            <h4 className="text-base font-medium mb-2">當前資料庫類型</h4>
            
            <div className="flex flex-col sm:flex-row gap-3">
              <div 
                className={`flex-1 p-3 rounded-md border cursor-pointer flex items-center justify-between ${
                  !isSupabaseActive ? 'border-primary bg-primary/5' : 'border-gray-200'
                }`}
                onClick={() => onToggleDatabase && onToggleDatabase(false)}
              >
                <div className="flex items-center">
                  <span className="material-icons text-base mr-2 text-blue-600">storage</span>
                  <div>
                    <div className="font-medium">PostgreSQL</div>
                    <div className="text-xs text-gray-500">本地數據庫</div>
                  </div>
                </div>
                <div className={`w-5 h-5 rounded-full border ${!isSupabaseActive ? 'bg-primary border-primary' : 'border-gray-300'}`}>
                  {!isSupabaseActive && (
                    <span className="material-icons text-white text-sm flex items-center justify-center">check</span>
                  )}
                </div>
              </div>
              
              <div 
                className={`flex-1 p-3 rounded-md border cursor-pointer flex items-center justify-between ${
                  isSupabaseActive ? 'border-primary bg-primary/5' : 'border-gray-200'
                }`}
                onClick={() => connectionStatus === 'connected' && onToggleDatabase && onToggleDatabase(true)}
              >
                <div className="flex items-center">
                  <span className="material-icons text-base mr-2 text-green-600">cloud</span>
                  <div>
                    <div className="font-medium">Supabase</div>
                    <div className="text-xs text-gray-500">雲端數據庫</div>
                  </div>
                </div>
                <div className={`w-5 h-5 rounded-full border ${isSupabaseActive ? 'bg-primary border-primary' : 'border-gray-300'}`}>
                  {isSupabaseActive && (
                    <span className="material-icons text-white text-sm flex items-center justify-center">check</span>
                  )}
                </div>
              </div>
            </div>
            
            {connectionStatus !== 'connected' && (
              <div className="mt-2 text-xs text-amber-600">
                <span className="material-icons text-xs mr-1 align-middle">info</span>
                請先設定並測試連接 Supabase 後，再嘗試切換到 Supabase 資料庫
              </div>
            )}
          </div>
          
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label htmlFor="supabaseUrl" className="block text-sm font-medium text-gray-700">Supabase URL</label>
                <Input 
                  id="supabaseUrl" 
                  value={supabaseUrl} 
                  onChange={(e) => onSupabaseUrlChange(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary font-['Roboto_Mono']"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="supabaseAnonKey" className="block text-sm font-medium text-gray-700">Supabase Anon Key</label>
                <Input 
                  id="supabaseAnonKey" 
                  type="password" 
                  value={supabaseAnonKey} 
                  onChange={(e) => onSupabaseAnonKeyChange(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary font-['Roboto_Mono']"
                />
              </div>
            </div>
            <div className="flex justify-between items-center mt-4">
              <div className="flex items-center text-sm">
                {connectionStatus === 'connected' && (
                  <>
                    <span className="material-icons text-success text-sm mr-1">check_circle</span>
                    <span className="text-success">連線狀態: 已連線</span>
                  </>
                )}
                {connectionStatus === 'disconnected' && (
                  <>
                    <span className="material-icons text-error text-sm mr-1">error</span>
                    <span className="text-error">連線狀態: 連線失敗</span>
                  </>
                )}
                {connectionStatus === 'testing' && (
                  <>
                    <span className="material-icons text-warning text-sm mr-1 animate-spin">sync</span>
                    <span className="text-warning">連線狀態: 測試中...</span>
                  </>
                )}
                {connectionStatus === 'migrating' && (
                  <>
                    <span className="material-icons text-warning text-sm mr-1 animate-spin">sync</span>
                    <span className="text-warning">數據遷移中...</span>
                  </>
                )}
              </div>
              <div className="flex space-x-2">
                <Button 
                  onClick={onTestConnection}
                  disabled={connectionStatus === 'testing' || connectionStatus === 'migrating'}
                  className="bg-primary hover:bg-blue-700 text-white px-4 py-2 rounded-md"
                >
                  測試連線
                </Button>
                {connectionStatus === 'connected' && (
                  <Button 
                    onClick={onMigrateData}
                    disabled={false} // 在 migrateData 函數內部處理狀態控制
                    className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-md"
                  >
                    遷移數據
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
