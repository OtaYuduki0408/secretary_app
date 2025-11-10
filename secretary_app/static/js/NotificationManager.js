export class NotificationManager {
  constructor() {
    this.notifications = new Map();
    this.timers = new Map();
    this.defaultIcons = {
      // 使用更可靠的图标URL，或者使用data URL
      icon: this._getDefaultIcon(),
      badge: this._getDefaultBadge()
    };
    this._log("✅ NotificationManager 初期化完了");
  }

  /**
   * 🎨 获取默认图标（使用data URL避免404）
   */
  _getDefaultIcon() {
    // 简单的SVG图标作为data URL
    return "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMzIiIGN5PSIzMiIgcj0iMzIiIGZpbGw9IiMyMTk2RjMiLz4KPHBhdGggZD0iTTM0LjUgMjZIMzZWMzZIMzRWNDBIMjhWMzZIMjZWMjZIMjcuNUgyOC41SDM0LjVaTTMwIDI4VjM0SDM0VjI4SDMwWiIgZmlsbD0id2hpdGUiLz4KPC9zdmc+";
  }

  /**
   * 🎨 获取默认badge图标
   */
  _getDefaultBadge() {
    // 简单的SVG作为badge
    return "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iOCIgY3k9IjgiIHI9IjgiIGZpbGw9IiMyMTk2RjMiLz4KPC9zdmc+";
  }

  /**
   * 🔔 设备通知（修复版）
   */
  async sendDeviceNotification(title, message, options = {}) {
    try {
      if (!("Notification" in window)) {
        this._showFallbackAlert(title, message);
        return false;
      }

      // 检查页面可见性，如果页面可见则不需要太激进的通知
      if (document.visibilityState === 'visible') {
        this._log(`ℹ️ ページが表示中のため、通知を控えめに表示: ${title}`);
      }

      if (Notification.permission === "default") {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          this._showFallbackAlert(title, message);
          return false;
        }
      }

      if (Notification.permission === "granted") {
        const notificationOptions = {
          body: message,
          icon: options.icon || this.defaultIcons.icon,
          badge: options.badge || this.defaultIcons.badge,
          tag: options.tag || "general-notification",
          requireInteraction: options.requireInteraction || false, // 不要自动关闭
          silent: options.silent || false
        };

        const notification = new Notification(title, notificationOptions);
        
        // 添加事件处理
        notification.onclick = () => {
          window.focus();
          notification.close();
          // 可以在这里添加点击通知后的自定义行为
          if (options.onClick) {
            options.onClick();
          }
        };

        notification.onclose = () => {
          this._log(`🗑️ 通知閉じる: ${title}`);
        };

        // 4秒后自动关闭（如果用户没有交互）
        setTimeout(() => {
          if (notification) {
            notification.close();
          }
        }, 4000);

        this._log(`✅ デバイス通知送信: ${title}`);
        return true;
      } else {
        this._showFallbackAlert(title, message);
        return false;
      }
    } catch (error) {
      this._log(`❌ デバイス通知エラー: ${error.message}`);
      this._showFallbackAlert(title, message);
      return false;
    }
  }

  /**
   * 🚨 备用提醒（改进版）
   */
  _showFallbackAlert(title, message) {
    // 只在页面可见时显示alert，避免打扰
    if (document.hasFocus() || document.visibilityState === 'visible') {
      // 使用更友好的控制台输出代替alert
      console.log(`%c🔔 ${title}`, 'color: #2196F3; font-weight: bold; font-size: 14px;');
      console.log(`%c${message}`, 'color: #666; font-size: 12px;');
      
      // 或者显示一个简单的页面内通知
      this._showInPageNotification(title, message);
    } else {
      console.log(`🔔 通知: ${title} - ${message}`);
    }
  }

  /**
   * 📱 页面内通知（备用方案）
   */
  _showInPageNotification(title, message) {
    // 创建一个简单的页面内通知元素
    const notificationEl = document.createElement('div');
    notificationEl.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #2196F3;
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      max-width: 300px;
      font-family: system-ui, -apple-system, sans-serif;
      animation: slideIn 0.3s ease-out;
    `;

    notificationEl.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 4px;">${title}</div>
      <div style="font-size: 14px; opacity: 0.9;">${message}</div>
    `;

    // 添加动画样式
    if (!document.querySelector('#notification-styles')) {
      const style = document.createElement('style');
      style.id = 'notification-styles';
      style.textContent = `
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(notificationEl);

    // 3秒后自动移除
    setTimeout(() => {
      if (notificationEl.parentNode) {
        notificationEl.style.animation = 'slideIn 0.3s ease-out reverse';
        setTimeout(() => {
          if (notificationEl.parentNode) {
            notificationEl.parentNode.removeChild(notificationEl);
          }
        }, 300);
      }
    }, 3000);
  }

  /**
   * 🕒 内部定时逻辑（修复版）
   */
  _setTimer(notification) {
    const delay = notification.time - new Date();
    
    if (delay > 2147483647) { // setTimeout的最大延迟
      this._log(`⚠️ 通知時間が長すぎます (${notification.title})`);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        notification.status = 'triggered';
        this._log(`🔔 通知発動: ${notification.title}`);

        if (notification.type === "device") {
          await this.sendDeviceNotification(
            notification.title, 
            notification.message,
            { tag: notification.id }
          );
        } else if (notification.type === "email") {
          await this.sendEmailNotification(
            notification.title, 
            notification.message, 
            notification.targetEmail
          );
        }
        
        // 清理
        this.notifications.delete(notification.id);
        this.timers.delete(notification.id);
        
      } catch (error) {
        this._log(`❌ 通知実行エラー: ${error.message}`);
        notification.status = 'failed';
      }
    }, delay);

    this.timers.set(notification.id, timer);
  }
}