/**
 * 錯誤邊界組件
 * 
 * 捕獲子組件中的錯誤並顯示友好的錯誤訊息
 * 提供重試機制讓用戶可以在錯誤發生後恢復
 */

import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0
    };
  }

  static getDerivedStateFromError(error) {
    // 更新狀態以顯示回退UI
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // 記錄錯誤信息
    console.error('組件錯誤:', error, errorInfo);
    this.setState({ errorInfo });
    
    // 上報錯誤（可選）
    // this.reportError(error, errorInfo);
  }
  
  handleRetry = () => {
    // 重置錯誤狀態
    this.setState(prevState => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: prevState.retryCount + 1
    }));
    
    // 如果提供了重試回調，則執行
    if (this.props.onRetry) {
      this.props.onRetry();
    }
    
    // 刷新數據
    if (this.props.refetch) {
      this.props.refetch();
    }
  };
  
  renderErrorMessage() {
    const { error } = this.state;
    const { fallback } = this.props;
    
    // 如果提供了自定義回退UI，則使用它
    if (fallback) {
      return fallback({ error, retry: this.handleRetry });
    }
    
    // 默認錯誤顯示
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>資料讀入失敗</AlertTitle>
        <AlertDescription>
          無法取得資料，請檢查網路連線後重試。
          {error && process.env.NODE_ENV === 'development' && (
            <details className="mt-2 text-xs">
              <summary>錯誤詳情（僅開發人員可見）</summary>
              <div className="mt-1 whitespace-pre-wrap">
                {error.toString()}
              </div>
            </details>
          )}
        </AlertDescription>
        <Button onClick={this.handleRetry} className="mt-2" size="sm" variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" />
          重試
        </Button>
      </Alert>
    );
  }

  render() {
    if (this.state.hasError) {
      return this.renderErrorMessage();
    }

    // 正常渲染子組件
    return this.props.children;
  }
}

export default ErrorBoundary;