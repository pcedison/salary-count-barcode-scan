/**
 * 數據庫管理儀表板組件
 * 
 * 提供數據庫連接狀態、操作歷史、同步狀態等可視化界面
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Check, X, AlertTriangle, Database, Activity, RotateCw, Shield, Calendar, Clock } from "lucide-react";

// 自定義Badge樣式
const SuccessBadge = ({ children }: { children: React.ReactNode }) => (
  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
    {children}
  </Badge>
);

type ConnectionStatus = 'connected' | 'disconnected' | 'checking';
type SyncStatus = 'idle' | 'syncing' | 'success' | 'failed';
type BackupStatus = 'idle' | 'backing-up' | 'success' | 'failed';

interface ConnectionHistoryItem {
  timestamp: number;
  status: 'connected' | 'disconnected';
  database: 'postgres' | 'supabase';
  error?: string;
}

interface AuditLogItem {
  timestamp: number;
  operation: string;
  user: string;
  details: string;
  success: boolean;
}

interface BackupItem {
  id: string;
  timestamp: number;
  size: number;
  database: 'postgres' | 'supabase';
}

const Dashboard = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [postgresStatus, setPostgresStatus] = useState<ConnectionStatus>('checking');
  const [supabaseStatus, setSupabaseStatus] = useState<ConnectionStatus>('checking');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [backupStatus, setBackupStatus] = useState<BackupStatus>('idle');
  const [lastBackupTime, setLastBackupTime] = useState<Date | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [activeDatabase, setActiveDatabase] = useState<'postgres' | 'supabase'>('postgres');
  const [connectionHistory, setConnectionHistory] = useState<ConnectionHistoryItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [backups, setBackups] = useState<BackupItem[]>([]);
  
  // 模擬獲取數據庫狀態
  useEffect(() => {
    const checkConnections = async () => {
      try {
        const response = await fetch('/api/supabase-connection');
        const data = await response.json();
        
        if (data.success) {
          if (data.connections.postgres) {
            setPostgresStatus('connected');
          } else {
            setPostgresStatus('disconnected');
          }
          
          if (data.connections.supabase.isConnected) {
            setSupabaseStatus('connected');
          } else {
            setSupabaseStatus('disconnected');
          }
          
          setActiveDatabase(data.currentStorage.toLowerCase() as 'postgres' | 'supabase');
        }
      } catch (error) {
        console.error('Error checking database connections:', error);
        setPostgresStatus('disconnected');
        setSupabaseStatus('disconnected');
      }
    };
    
    checkConnections();
    
    // 模擬更新連接歷史
    setConnectionHistory([
      {
        timestamp: Date.now() - 3600000,
        status: 'connected',
        database: 'supabase'
      },
      {
        timestamp: Date.now() - 7200000,
        status: 'disconnected',
        database: 'supabase',
        error: '連接超時'
      },
      {
        timestamp: Date.now() - 7300000,
        status: 'connected',
        database: 'postgres'
      }
    ]);
    
    // 設置最後備份/同步時間
    setLastBackupTime(new Date(Date.now() - 86400000)); // 24小時前
    setLastSyncTime(new Date(Date.now() - 3600000)); // 1小時前
  }, []);
  
  // 創建備份
  const handleCreateBackup = async () => {
    setBackupStatus('backing-up');
    
    try {
      // 在實際應用中，這裡將向後端發起請求
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setBackupStatus('success');
      setLastBackupTime(new Date());
      
      // 更新備份列表
      const newBackup = {
        id: `backup-${Date.now()}`,
        timestamp: Date.now(),
        size: Math.floor(Math.random() * 1000) + 100,
        database: activeDatabase
      };
      
      setBackups(prev => [newBackup, ...prev]);
      
      toast({
        title: "備份成功",
        description: `已成功建立資料庫備份`,
      });
    } catch (error) {
      setBackupStatus('failed');
      
      toast({
        title: "備份失敗",
        description: "無法建立資料庫備份，請檢查日誌",
        variant: "destructive"
      });
    }
  };
  
  // 同步數據庫
  const handleSyncDatabases = async () => {
    setSyncStatus('syncing');
    
    try {
      // 在實際應用中，這裡將向後端發起請求
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      setSyncStatus('success');
      setLastSyncTime(new Date());
      
      toast({
        title: "同步成功",
        description: `PostgreSQL 和 Supabase 數據已成功同步`,
      });
    } catch (error) {
      setSyncStatus('failed');
      
      toast({
        title: "同步失敗",
        description: "無法同步數據庫，請檢查日誌",
        variant: "destructive"
      });
    }
  };
  
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold tracking-tight">系統儀表板</h2>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* 數據庫狀態卡片 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">數據庫狀態</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex flex-col space-y-2">
              <div className="flex items-center justify-between">
                <span>PostgreSQL:</span>
                {postgresStatus === 'checking' ? (
                  <Badge variant="outline" className="flex items-center">
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    檢查中
                  </Badge>
                ) : postgresStatus === 'connected' ? (
                  <Badge variant="success" className="flex items-center">
                    <Check className="h-3 w-3 mr-1" />
                    已連接
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="flex items-center">
                    <X className="h-3 w-3 mr-1" />
                    未連接
                  </Badge>
                )}
              </div>
              
              <div className="flex items-center justify-between">
                <span>Supabase:</span>
                {supabaseStatus === 'checking' ? (
                  <Badge variant="outline" className="flex items-center">
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    檢查中
                  </Badge>
                ) : supabaseStatus === 'connected' ? (
                  <Badge variant="success" className="flex items-center">
                    <Check className="h-3 w-3 mr-1" />
                    已連接
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="flex items-center">
                    <X className="h-3 w-3 mr-1" />
                    未連接
                  </Badge>
                )}
              </div>
              
              <div className="flex items-center justify-between mt-2">
                <span>使用中:</span>
                <Badge variant="outline" className="capitalize">
                  {activeDatabase === 'postgres' ? 'PostgreSQL' : 'Supabase'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* 備份狀態卡片 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">備份狀態</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex flex-col space-y-2">
              <div className="text-2xl font-bold">
                {backups.length || 0}
                <span className="text-sm font-normal text-muted-foreground ml-1">個備份</span>
              </div>
              
              <div className="text-xs text-muted-foreground">
                上次備份: {lastBackupTime ? lastBackupTime.toLocaleString() : '從未'}
              </div>
              
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full"
                onClick={handleCreateBackup}
                disabled={backupStatus === 'backing-up'}
              >
                {backupStatus === 'backing-up' ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    備份中...
                  </>
                ) : (
                  <>創建備份</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
        
        {/* 同步狀態卡片 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">數據同步</CardTitle>
            <RotateCw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex flex-col space-y-2">
              <div className="flex items-center">
                {syncStatus === 'syncing' ? (
                  <Badge variant="outline" className="flex items-center">
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    同步中
                  </Badge>
                ) : syncStatus === 'success' ? (
                  <Badge variant="success" className="flex items-center">
                    <Check className="h-3 w-3 mr-1" />
                    同步成功
                  </Badge>
                ) : syncStatus === 'failed' ? (
                  <Badge variant="destructive" className="flex items-center">
                    <X className="h-3 w-3 mr-1" />
                    同步失敗
                  </Badge>
                ) : (
                  <Badge variant="outline">未同步</Badge>
                )}
              </div>
              
              <div className="text-xs text-muted-foreground">
                上次同步: {lastSyncTime ? lastSyncTime.toLocaleString() : '從未'}
              </div>
              
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full"
                onClick={handleSyncDatabases}
                disabled={syncStatus === 'syncing' || postgresStatus !== 'connected' || supabaseStatus !== 'connected'}
              >
                {syncStatus === 'syncing' ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    同步中...
                  </>
                ) : (
                  <>同步數據</>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
        
        {/* 系統活動卡片 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">系統活動</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex flex-col space-y-2">
              <div className="text-2xl font-bold">
                {auditLogs.length || 0}
                <span className="text-sm font-normal text-muted-foreground ml-1">個操作記錄</span>
              </div>
              
              <div className="flex items-center text-xs text-muted-foreground">
                <Clock className="h-3 w-3 mr-1" />
                查看詳細日誌
              </div>
              
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full"
                onClick={() => setActiveTab("logs")}
              >
                查看日誌
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">概覽</TabsTrigger>
          <TabsTrigger value="connections">連接歷史</TabsTrigger>
          <TabsTrigger value="backups">備份管理</TabsTrigger>
          <TabsTrigger value="logs">操作日誌</TabsTrigger>
        </TabsList>
        
        {/* 概覽頁 */}
        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>系統概覽</CardTitle>
              <CardDescription>
                查看系統的整體狀態和近期活動
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h3 className="font-medium mb-2">當前數據庫</h3>
                    <div className="p-4 border rounded-md">
                      <div className="flex items-center justify-between mb-2">
                        <span>使用中:</span>
                        <Badge variant="outline" className="capitalize">
                          {activeDatabase === 'postgres' ? 'PostgreSQL' : 'Supabase'}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between mb-2">
                        <span>PostgreSQL 狀態:</span>
                        {postgresStatus === 'connected' ? (
                          <span className="text-green-500 text-sm">已連接</span>
                        ) : (
                          <span className="text-red-500 text-sm">未連接</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Supabase 狀態:</span>
                        {supabaseStatus === 'connected' ? (
                          <span className="text-green-500 text-sm">已連接</span>
                        ) : (
                          <span className="text-red-500 text-sm">未連接</span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="font-medium mb-2">最近備份</h3>
                    <div className="p-4 border rounded-md">
                      {lastBackupTime ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span>時間:</span>
                            <span className="text-sm">{lastBackupTime.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>數據庫:</span>
                            <span className="text-sm capitalize">
                              {activeDatabase === 'postgres' ? 'PostgreSQL' : 'Supabase'}
                            </span>
                          </div>
                          <Button size="sm" variant="outline" className="w-full mt-2" onClick={handleCreateBackup}>
                            建立新備份
                          </Button>
                        </div>
                      ) : (
                        <div className="text-center py-2">
                          <p className="text-sm text-muted-foreground mb-2">尚未建立備份</p>
                          <Button size="sm" variant="outline" className="w-full" onClick={handleCreateBackup}>
                            建立第一個備份
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                <div>
                  <h3 className="font-medium mb-2">最近連接記錄</h3>
                  <div className="border rounded-md overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            時間
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            數據庫
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            狀態
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {connectionHistory.slice(0, 3).map((item, index) => (
                          <tr key={index}>
                            <td className="px-4 py-2 whitespace-nowrap text-sm">
                              {new Date(item.timestamp).toLocaleString()}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-sm capitalize">
                              {item.database === 'postgres' ? 'PostgreSQL' : 'Supabase'}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-sm">
                              {item.status === 'connected' ? (
                                <span className="text-green-500">已連接</span>
                              ) : (
                                <span className="text-red-500">
                                  未連接 {item.error && `(${item.error})`}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* 連接歷史頁 */}
        <TabsContent value="connections" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>數據庫連接歷史</CardTitle>
              <CardDescription>
                查看數據庫連接的歷史記錄和狀態變化
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-md overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        時間
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        數據庫
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        狀態
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        詳情
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {connectionHistory.map((item, index) => (
                      <tr key={index}>
                        <td className="px-4 py-2 whitespace-nowrap text-sm">
                          {new Date(item.timestamp).toLocaleString()}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm capitalize">
                          {item.database === 'postgres' ? 'PostgreSQL' : 'Supabase'}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm">
                          {item.status === 'connected' ? (
                            <Badge variant="success" className="flex items-center">
                              <Check className="h-3 w-3 mr-1" />
                              已連接
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="flex items-center">
                              <X className="h-3 w-3 mr-1" />
                              未連接
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm">
                          {item.error}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* 備份管理頁 */}
        <TabsContent value="backups" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>備份管理</CardTitle>
              <CardDescription>
                管理數據庫備份和恢復點
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-medium">備份列表</h3>
                <Button size="sm" onClick={handleCreateBackup} disabled={backupStatus === 'backing-up'}>
                  {backupStatus === 'backing-up' ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      備份中...
                    </>
                  ) : (
                    <>創建新備份</>
                  )}
                </Button>
              </div>
              
              {backups.length === 0 ? (
                <div className="text-center py-8 border rounded-md">
                  <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">尚未建立備份</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    備份可以幫助您在數據庫出現問題時快速恢復
                  </p>
                  <Button size="sm" variant="outline" onClick={handleCreateBackup}>
                    建立第一個備份
                  </Button>
                </div>
              ) : (
                <div className="border rounded-md overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          ID
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          時間
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          大小
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          數據庫
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          操作
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {backups.map((backup, index) => (
                        <tr key={index}>
                          <td className="px-4 py-2 whitespace-nowrap text-sm">
                            {backup.id.substring(0, 8)}...
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-sm">
                            {new Date(backup.timestamp).toLocaleString()}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-sm">
                            {backup.size} KB
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-sm capitalize">
                            {backup.database === 'postgres' ? 'PostgreSQL' : 'Supabase'}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap text-sm">
                            <div className="flex space-x-2">
                              <Button variant="ghost" size="sm">
                                恢復
                              </Button>
                              <Button variant="ghost" size="sm" className="text-red-500">
                                刪除
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* 操作日誌頁 */}
        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>操作日誌</CardTitle>
              <CardDescription>
                查看系統操作和數據庫變更的詳細日誌
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-medium">最近操作</h3>
                <div className="flex space-x-2">
                  <select className="px-2 py-1 border rounded-md text-sm">
                    <option value="all">所有操作</option>
                    <option value="db_config">數據庫配置</option>
                    <option value="system_config">系統設置</option>
                    <option value="backup">備份操作</option>
                  </select>
                  
                  <input
                    type="date"
                    className="px-2 py-1 border rounded-md text-sm"
                    defaultValue={new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>
              
              <ScrollArea className="h-[400px] border rounded-md">
                <div className="p-4 space-y-4">
                  {/* 模擬日誌項目 */}
                  <div className="border-b pb-4">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium">數據庫切換</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(Date.now() - 1800000).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs">管理員</span>
                      <Badge variant="success" className="text-xs">
                        成功
                      </Badge>
                    </div>
                    <p className="text-sm mt-1">
                      系統已切換到 Supabase 數據庫
                    </p>
                  </div>
                  
                  <div className="border-b pb-4">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium">數據庫同步</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(Date.now() - 3600000).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs">系統</span>
                      <Badge variant="success" className="text-xs">
                        成功
                      </Badge>
                    </div>
                    <p className="text-sm mt-1">
                      PostgreSQL 和 Supabase 數據同步完成，共同步 5 個表格
                    </p>
                  </div>
                  
                  <div className="border-b pb-4">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium">創建備份</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(Date.now() - 86400000).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs">管理員</span>
                      <Badge variant="success" className="text-xs">
                        成功
                      </Badge>
                    </div>
                    <p className="text-sm mt-1">
                      已創建 PostgreSQL 數據庫備份，大小：1234 KB
                    </p>
                  </div>
                  
                  <div className="border-b pb-4">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium">管理員登入</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(Date.now() - 90000000).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs">系統</span>
                      <Badge variant="success" className="text-xs">
                        成功
                      </Badge>
                    </div>
                    <p className="text-sm mt-1">
                      管理員成功登入系統，IP: 192.168.1.100
                    </p>
                  </div>
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Dashboard;