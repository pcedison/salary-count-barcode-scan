/**
 * 簡單的事件發布訂閱系統
 * 用於頁面間通訊，例如當一個頁面上的操作需要通知另一個頁面時
 */

type EventCallback = (...args: any[]) => void;

interface EventMap {
  [eventName: string]: EventCallback[];
}

class EventBus {
  private events: EventMap = {};

  // 訂閱事件
  on(eventName: string, callback: EventCallback) {
    if (!this.events[eventName]) {
      this.events[eventName] = [];
    }
    this.events[eventName].push(callback);

    // 返回取消訂閱函數
    return () => {
      this.off(eventName, callback);
    };
  }

  // 取消訂閱
  off(eventName: string, callback: EventCallback) {
    if (!this.events[eventName]) return;

    this.events[eventName] = this.events[eventName].filter(
      (cb) => cb !== callback
    );
  }

  // 發布事件
  emit(eventName: string, ...args: any[]) {
    const callbacks = this.events[eventName];
    if (!callbacks || callbacks.length === 0) return;

    callbacks.forEach((callback) => {
      try {
        callback(...args);
      } catch (e) {
        console.error(`Error in event callback for ${eventName}:`, e);
      }
    });
  }

  // 清除所有事件訂閱
  clear() {
    this.events = {};
  }
}

// 導出單例
export const eventBus = new EventBus();

// 導出事件名稱常量
export const EventNames = {
  ATTENDANCE_UPDATED: 'attendance_updated',
  BARCODE_SCANNED: 'barcode_scanned',
};