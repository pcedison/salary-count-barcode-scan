import { QueryClient, QueryFunction } from "@tanstack/react-query";

// 最大重試次數
const MAX_RETRIES = 3;
// 重試延遲基數（毫秒）
const RETRY_DELAY_BASE = 300;

/**
 * 檢查響應是否成功，如果不成功則抛出錯誤
 */
async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

/**
 * 構造完整的URL
 */
function buildFullUrl(path: string): string {
  // 確保路徑始終以/開頭
  const url = path.startsWith('/') ? path : `/${path}`;
  
  // 使用window.location.origin作為基礎URL
  const apiBase = window.location.origin;
  return `${apiBase}${url}`;
}

/**
 * 具有自動重試功能的API請求
 */
export async function apiRequest(
  method: string,
  path: string,
  data?: unknown | undefined,
  retryCount = 0,
): Promise<Response> {
  const fullUrl = buildFullUrl(path);
  
  console.log(`API Request: ${method} ${fullUrl}`);
  
  try {
    const res = await fetch(fullUrl, {
      method,
      headers: data ? { "Content-Type": "application/json" } : {},
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });

    await throwIfResNotOk(res);
    return res;
  } catch (error) {
    console.error(`API Request Error: ${method} ${fullUrl}`, error);
    
    // 檢查是否可以重試
    if (retryCount < MAX_RETRIES && !navigator.onLine) {
      const delayMs = RETRY_DELAY_BASE * Math.pow(2, retryCount);
      console.log(`Retrying in ${delayMs}ms (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
      
      // 延遲後重試
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return apiRequest(method, path, data, retryCount + 1);
    }
    
    throw error;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";

/**
 * 具有自動重試功能的查詢函數
 */
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const path = queryKey[0] as string;
    const fullUrl = buildFullUrl(path);
    
    console.log(`Query: GET ${fullUrl}`);
    
    let retryCount = 0;
    
    while (retryCount <= MAX_RETRIES) {
      try {
        const res = await fetch(fullUrl, {
          credentials: "include",
        });

        // 處理未授權的情況
        if (unauthorizedBehavior === "returnNull" && res.status === 401) {
          return null;
        }

        // 檢查響應是否成功
        await throwIfResNotOk(res);
        return await res.json();
      } catch (error) {
        // 如果達到最大重試次數或瀏覽器在線狀態正常，則停止重試
        if (retryCount >= MAX_RETRIES || navigator.onLine) {
          console.error(`Query Error: GET ${fullUrl}`, error);
          throw error;
        }
        
        // 計算延遲並等待
        const delayMs = RETRY_DELAY_BASE * Math.pow(2, retryCount);
        console.log(`Retrying query in ${delayMs}ms (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        
        // 增加重試計數
        retryCount++;
      }
    }
    
    // 這個代碼不應該被執行到，但TypeScript需要一個返回值
    throw new Error("Failed after maximum retries");
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
