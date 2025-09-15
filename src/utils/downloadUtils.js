// 跨浏览器文件下载工具函数

/**
 * 检测浏览器类型
 */
export function detectBrowser() {
  const userAgent = navigator.userAgent;
  
  if (userAgent.includes('Edg/')) {
    return 'edge';
  } else if (userAgent.includes('Chrome/') && !userAgent.includes('Edg/')) {
    return 'chrome';
  } else if (userAgent.includes('Firefox/')) {
    return 'firefox';
  } else if (userAgent.includes('Safari/') && !userAgent.includes('Chrome/')) {
    return 'safari';
  } else if (userAgent.includes('MSIE') || userAgent.includes('Trident/')) {
    return 'ie';
  } else {
    return 'unknown';
  }
}

/**
 * 跨浏览器文件下载
 * @param {Blob} blob - 要下载的文件blob
 * @param {string} fileName - 文件名
 * @param {Function} onSuccess - 下载成功回调
 * @param {Function} onError - 下载失败回调
 */
export function downloadFile(blob, fileName, onSuccess = null, onError = null) {
  try {
    const browser = detectBrowser();
    
    // 旧版IE浏览器
    if (browser === 'ie' && window.navigator.msSaveBlob) {
      window.navigator.msSaveBlob(blob, fileName);
      if (onSuccess) onSuccess(fileName);
      return true;
    }
    
    // 现代浏览器
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.style.display = 'none';
    
    // 添加到DOM
    document.body.appendChild(a);
    
    // 设置成功回调
    const handleSuccess = () => {
      if (onSuccess) onSuccess(fileName);
    };
    
    // 设置错误回调
    const handleError = (error) => {
      if (onError) onError(error);
    };
    
    if (browser === 'edge' || browser === 'firefox') {
      // Edge和Firefox - 直接触发下载，立即成功
      const event = new MouseEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true
      });
      a.dispatchEvent(event);
      
      // Edge和Firefox通常直接下载，延迟一点时间后调用成功回调
      setTimeout(handleSuccess, 200);
    } else if (browser === 'chrome' || browser === 'safari') {
      // Chrome和Safari - 会弹出保存对话框，需要等待用户操作
      a.click();
      
      // 对于Chrome和Safari，我们不自动显示通知
      // 让用户通过浏览器的保存对话框完成操作
      // 这样可以避免重复提示
    } else {
      // 其他浏览器
      a.click();
      setTimeout(handleSuccess, 200);
    }
    
    // 清理
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
    
    return true;
  } catch (error) {
    console.error('文件下载失败:', error);
    if (onError) onError(error);
    return false;
  }
}

/**
 * 下载JSON数据
 * @param {Object} data - JSON数据对象
 * @param {string} fileName - 文件名（不包含扩展名）
 * @param {Function} onSuccess - 下载成功回调
 * @param {Function} onError - 下载失败回调
 */
export function downloadJSON(data, fileName, onSuccess = null, onError = null) {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const fullFileName = fileName.endsWith('.json') ? fileName : `${fileName}.json`;
  
  return downloadFile(blob, fullFileName, onSuccess, onError);
}

/**
 * 下载文本文件
 * @param {string} text - 文本内容
 * @param {string} fileName - 文件名
 * @param {string} mimeType - MIME类型
 */
export function downloadText(text, fileName, mimeType = 'text/plain') {
  const blob = new Blob([text], { type: mimeType });
  return downloadFile(blob, fileName);
}

/**
 * 显示下载提示
 * @param {string} fileName - 文件名
 * @param {boolean} success - 是否成功
 */
export function showDownloadNotification(fileName, success = true) {
  if (success) {
    console.log(`文件已保存: ${fileName}`);
    
    // 可以在这里添加更友好的用户提示
    // 比如显示一个toast通知
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4CAF50;
      color: white;
      padding: 12px 20px;
      border-radius: 4px;
      z-index: 10000;
      font-family: Arial, sans-serif;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    `;
    notification.textContent = `文件已保存: ${fileName}`;
    document.body.appendChild(notification);
    
    // 3秒后自动移除
    setTimeout(() => {
      if (document.body.contains(notification)) {
        document.body.removeChild(notification);
      }
    }, 3000);
  } else {
    console.error(`文件保存失败: ${fileName}`);
  }
}
