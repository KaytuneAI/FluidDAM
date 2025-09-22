/**
 * 字体覆盖工具 - 强制使用正式字体，防止手写体
 */

// 强制字体设置
const FORCE_FONT_FAMILY = 'Arial, Helvetica, "Microsoft YaHei", "微软雅黑", "PingFang SC", "Hiragino Sans GB", "WenQuanYi Micro Hei", sans-serif';
const FORCE_FONT_SIZE = '12px';

/**
 * 应用字体覆盖到指定元素
 * @param {Element} element - 目标元素
 */
export function applyFontOverride(element) {
  if (!element) return;
  
  // 设置字体属性
  element.style.fontFamily = FORCE_FONT_FAMILY;
  element.style.fontSize = FORCE_FONT_SIZE;
  element.style.fontStyle = 'normal';
  element.style.fontWeight = 'normal';
  element.style.textDecoration = 'none';
  element.style.fontVariant = 'normal';
  element.style.fontStretch = 'normal';
  element.style.fontKerning = 'auto';
  element.style.fontFeatureSettings = 'normal';
  
  // 递归应用到所有子元素
  const children = element.querySelectorAll('*');
  children.forEach(child => {
    child.style.fontFamily = FORCE_FONT_FAMILY;
    child.style.fontSize = FORCE_FONT_SIZE;
    child.style.fontStyle = 'normal';
    child.style.fontWeight = 'normal';
    child.style.textDecoration = 'none';
    child.style.fontVariant = 'normal';
    child.style.fontStretch = 'normal';
    child.style.fontKerning = 'auto';
    child.style.fontFeatureSettings = 'normal';
  });
}

/**
 * 全局字体覆盖 - 监听DOM变化并应用字体
 */
export function initGlobalFontOverride() {
  // 立即应用到现有元素
  applyFontOverride(document.body);
  
  // 创建MutationObserver监听DOM变化
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            applyFontOverride(node);
          }
        });
      }
      
      if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
        const target = mutation.target;
        if (target.style.fontFamily && !target.style.fontFamily.includes('Arial')) {
          target.style.fontFamily = FORCE_FONT_FAMILY;
          target.style.fontSize = FORCE_FONT_SIZE;
        }
      }
    });
  });
  
  // 开始观察
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class']
  });
  
  // 定期检查（备用方案）
  const interval = setInterval(() => {
    const allElements = document.querySelectorAll('*');
    allElements.forEach(el => {
      if (el.style.fontFamily && !el.style.fontFamily.includes('Arial')) {
        el.style.fontFamily = FORCE_FONT_FAMILY;
        el.style.fontSize = FORCE_FONT_SIZE;
      }
    });
  }, 1000);
  
  // 返回清理函数
  return () => {
    observer.disconnect();
    clearInterval(interval);
  };
}

/**
 * 针对Tldraw的特殊字体覆盖
 */
export function initTldrawFontOverride() {
  const tldrawSelectors = [
    '.tl-text',
    '.tl-rich-text',
    '.tl-text-content',
    '.tl-text-editor',
    '.tl-text-input',
    '.tl-shape',
    '[data-shape-type="text"]',
    '[class*="tl-"]'
  ];
  
  const applyToTldrawElements = () => {
    tldrawSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        applyFontOverride(el);
      });
    });
  };
  
  // 立即执行
  applyToTldrawElements();
  
  // 监听Tldraw相关变化
  const observer = new MutationObserver(() => {
    applyToTldrawElements();
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'data-shape-type']
  });
  
  return () => observer.disconnect();
}

/**
 * 初始化所有字体覆盖
 */
export function initAllFontOverrides() {
  const cleanup1 = initGlobalFontOverride();
  const cleanup2 = initTldrawFontOverride();
  
  return () => {
    cleanup1();
    cleanup2();
  };
}
