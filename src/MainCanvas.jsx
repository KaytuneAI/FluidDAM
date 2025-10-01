import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { Tldraw, createTLStore, defaultShapeUtils, getSnapshot, createTLStore as createStore } from "tldraw";
import "tldraw/tldraw.css";
import { getApiBaseUrl } from './utils/apiUtils.js';
import storageManager from './utils/storageManager.js';

// 导入组件
import ResizableSidebar from './components/ResizableSidebar.jsx';
import IntegratedAssetSidebar from './components/IntegratedAssetSidebar.jsx';

// 导入样式
import { highlightStyle } from './styles/sidebarStyles.js';

// 添加高亮样式到页面
const styleElement = document.createElement('style');
styleElement.textContent = highlightStyle;
if (!document.head.querySelector('style[data-highlight]')) {
  styleElement.setAttribute('data-highlight', 'true');
  document.head.appendChild(styleElement);
}

// 添加恢复动画样式
const restoreStyleElement = document.createElement('style');
restoreStyleElement.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
if (!document.head.querySelector('style[data-restore]')) {
  restoreStyleElement.setAttribute('data-restore', 'true');
  document.head.appendChild(restoreStyleElement);
}

export default function MainCanvas() {
  const store = useMemo(() => createTLStore({ shapeUtils: [...defaultShapeUtils] }), []);
  const editorRef = useRef(null);
  const [editorReady, setEditorReady] = useState(false);
  const [selectedFrame, setSelectedFrame] = useState(null);
  const [forceRerender, setForceRerender] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [dragOver, setDragOver] = useState(false);
  // 移除保存状态指示器，不再显示任何提示
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  // 刷新恢复状态
  const [isRestoring, setIsRestoring] = useState(false);
  
  // 保存干净初始态快照
  const pristineSnapshotRef = useRef(null);
  const snapshotSavedRef = useRef(false);
  
  // 调试工具：暴露到全局，方便在控制台检查
  useEffect(() => {
    window.debugCanvas = {
      checkSavedData: async () => {
        const data = await storageManager.loadCanvas();
        if (!data) {
          console.log('没有保存的数据');
          return null;
        }
        const dataString = JSON.stringify(data);
        const info = await storageManager.getStorageInfo();
        
        console.log('保存的数据:', {
          version: data.version,
          timestamp: data.timestamp,
          timestampDate: new Date(data.timestamp),
          hasCanvasData: !!data.canvasData,
          hasCamera: !!data.camera,
          camera: data.camera,
          currentPageId: data.currentPageId,
          imageCount: data.imageInfo?.length || 0,
          dataSize: (dataString.length / 1024 / 1024).toFixed(2) + ' MB',
          storageMethod: info.currentMethod,
          maxCapacity: info.maxSize
        });
        return data;
      },
      forceSave: async () => {
        if (editorRef.current) {
          console.log('强制保存当前状态...');
          const canvasData = getSnapshot(editorRef.current.store);
          const currentPageId = editorRef.current.getCurrentPageId();
          const currentShapes = editorRef.current.getCurrentPageShapes();
          const imageShapes = currentShapes.filter(shape => shape.type === 'image');
          const camera = editorRef.current.getCamera();
          const viewport = editorRef.current.getViewportPageBounds();
          
          const saveData = {
            canvasData,
            currentPageId,
            imageInfo: imageShapes.map(shape => ({ shapeId: shape.id })),
            camera,
            viewport,
            version: '1.0',
            timestamp: Date.now(),
            autoSave: true
          };
          
          const result = await storageManager.saveCanvas(saveData);
          if (result.success) {
            console.log(`强制保存完成 (${result.method}, ${result.size}MB)，形状数量:`, currentShapes.length);
          } else {
            console.error('强制保存失败:', result.error);
          }
        }
      },
      clearSavedData: async () => {
        await storageManager.clearCanvas();
        console.log('已清除保存的数据');
      },
      getStorageInfo: async () => {
        const info = await storageManager.getStorageInfo();
        console.log('存储信息:', info);
        return info;
      }
    };
    
    console.log('🔧 调试工具已加载。在控制台运行：');
    console.log('  window.debugCanvas.checkSavedData() - 检查保存的数据');
    console.log('  window.debugCanvas.forceSave() - 强制保存当前画布');
    console.log('  window.debugCanvas.clearSavedData() - 清除保存的数据');
    console.log('  window.debugCanvas.getStorageInfo() - 查看存储信息');
  }, []);

  // 新建画布功能 - 使用快照恢复
  const handleNewCanvas = useCallback(async () => {
    if (!editorRef.current || !pristineSnapshotRef.current) return;
    
    if (confirm('确定要创建新画布吗？当前画布的内容将被清空。')) {
      try {
        console.log('开始快照恢复重置...');
        
        // 暂停自动保存监听（避免在重置过程写入垃圾快照）
        setIsAutoSaving(false);
        
        // 加载干净初始态快照
        const { loadSnapshot } = await import('tldraw');
        loadSnapshot(store, pristineSnapshotRef.current);
        
        // 清除自动保存数据
        await storageManager.clearCanvas();
        
        // 恢复自动保存监听
        setIsAutoSaving(true);
        
        console.log('快照恢复重置成功！');
      } catch (error) {
        console.error('快照恢复重置失败:', error);
        // 恢复自动保存监听
        setIsAutoSaving(true);
      }
    }
  }, [store]);

  // 重置画布功能 - 使用快照恢复
  const handleResetCanvas = useCallback(async () => {
    if (!editorRef.current || !pristineSnapshotRef.current) return;
    
    if (confirm('重置/关闭画布将清空所有内容，未保存的数据将丢失。确定继续吗？')) {
      try {
        console.log('开始快照恢复重置...');
        
        // 暂停自动保存监听（避免在重置过程写入垃圾快照）
        setIsAutoSaving(false);
        
        // 加载干净初始态快照
        const { loadSnapshot } = await import('tldraw');
        loadSnapshot(store, pristineSnapshotRef.current);
        
        // 清除自动保存数据
        await storageManager.clearCanvas();
        
        // 恢复自动保存监听
        setIsAutoSaving(true);
        
        console.log('快照恢复重置成功！');
      } catch (error) {
        console.error('快照恢复重置失败:', error);
        // 恢复自动保存监听
        setIsAutoSaving(true);
      }
    }
  }, [store]);

  // 关闭画布功能
  const handleCloseCanvas = useCallback(() => {
    if (confirm('确定要关闭画布吗？当前画布的内容将被清空。')) {
      try {
        // 清空画布
        if (editorRef.current) {
          const currentShapes = editorRef.current.getCurrentPageShapes();
          if (currentShapes.length > 0) {
            const shapeIds = currentShapes.map(shape => shape.id);
            editorRef.current.deleteShapes(shapeIds);
          }
        }
        
        // 清除所有保存的数据
        localStorage.removeItem('autoSaveCanvas');
        localStorage.removeItem('currentImageIds');
        
        // 画布关闭完成
        
        console.log('画布已关闭');
      } catch (error) {
        console.error('关闭画布失败:', error);
        // 关闭画布失败
      }
    }
  }, []);

  // 自定义菜单项 - 尝试不同的API格式
  const customOverrides = useMemo(() => ({
    actions: (editor, actions) => {
      console.log('Available actions:', Object.keys(actions));
      return {
        ...actions,
        'new-canvas': {
          id: 'new-canvas',
          label: '新建画布',
          kbd: 'Ctrl+N',
          onSelect: handleNewCanvas,
        },
        'close-canvas': {
          id: 'close-canvas', 
          label: '关闭画布',
          kbd: 'Ctrl+W',
          onSelect: handleCloseCanvas,
        },
      };
    },
  }), [handleNewCanvas, handleCloseCanvas]);
  
  // 全局隐藏frame文字的Observer
  useEffect(() => {
    const hideFrameLabels = () => {
      const labelElements = document.querySelectorAll('.tl-frame-label, .tl-frame-heading, .tl-frame-heading-hit-area');
      labelElements.forEach(el => {
        el.style.display = 'none';
        el.style.visibility = 'hidden';
        el.style.opacity = '0';
        el.style.height = '0';
        el.style.width = '0';
        el.style.overflow = 'hidden';
      });
    };
    
    // 立即执行一次
    hideFrameLabels();
    
    // 创建MutationObserver监听DOM变化
    const observer = new MutationObserver(() => {
      hideFrameLabels();
    });
    
    // 开始观察
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });
    
    // 定期检查（备用方案）
    const interval = setInterval(hideFrameLabels, 1000);
    
    return () => {
      observer.disconnect();
      clearInterval(interval);
    };
  }, []);

  // 自动保存画布状态到localStorage
  const saveCanvasState = useCallback(async () => {
    if (!editorRef.current || isAutoSaving) return;
    
    try {
      setIsAutoSaving(true);
      const { getSnapshot } = await import('tldraw');
      
      // 获取当前画布状态
      const canvasData = getSnapshot(editorRef.current.store);
      const currentPageId = editorRef.current.getCurrentPageId();
      
      // 获取当前图片ID列表
      const currentShapes = editorRef.current.getCurrentPageShapes();
      const imageShapes = currentShapes.filter(shape => shape.type === 'image');
      const currentImageIds = imageShapes.map(shape => shape.id);
      
      // 保存视图状态（缩放、位置等）
      const viewport = editorRef.current.getViewportPageBounds();
      const camera = editorRef.current.getCamera();
      
      // 构建保存数据
      const saveData = {
        canvasData,
        currentPageId,
        imageInfo: currentImageIds.map(id => ({ shapeId: id })),
        viewport: {
          x: viewport.x,
          y: viewport.y,
          width: viewport.width,
          height: viewport.height
        },
        camera: {
          x: camera.x,
          y: camera.y,
          z: camera.z
        },
        version: '1.0',
        timestamp: Date.now(),
        autoSave: true
      };
      
      console.log('自动保存画布状态:', {
        shapesCount: currentShapes.length,
        imageCount: imageShapes.length,
        camera: saveData.camera,
        shapes: currentShapes.map(s => ({ id: s.id, type: s.type }))
      });
      
      // 检查 canvasData 中的形状
      if (canvasData && canvasData.store) {
        const shapesInSnapshot = Object.keys(canvasData.store).filter(key => 
          key.startsWith('shape:') && !key.includes('pointer')
        );
        console.log('快照中的形状数量:', shapesInSnapshot.length);
      }
      
      // 使用智能存储管理器保存（支持 IndexedDB 大容量）
      const result = await storageManager.saveCanvas(saveData);
      
      if (result.success) {
        console.log(`✅ 画布状态已自动保存 (${result.method}, ${result.size}MB)`);
      } else {
        console.error(`❌ 自动保存失败: ${result.error}`);
        // 延迟输出，确保错误可见
        setTimeout(() => {
          console.error('⚠️ 自动保存失败详情:', {
            error: result.error,
            size: result.size,
            timestamp: new Date().toLocaleString()
          });
          if (parseFloat(result.size) > 10) {
            console.warn('💡 提示：数据太大，请使用"保存画布"按钮手动保存为文件');
          }
        }, 100);
      }
    } catch (error) {
      console.error('❌ 自动保存异常:', error);
      // 延迟输出，确保错误可见
      setTimeout(() => {
        console.error('⚠️ 自动保存发生严重错误:', {
          message: error.message,
          stack: error.stack,
          timestamp: new Date().toLocaleString()
        });
      }, 100);
    } finally {
      setIsAutoSaving(false);
    }
  }, [isAutoSaving]);

  // 从存储恢复画布状态（支持 IndexedDB 和 localStorage）
  const restoreCanvasState = useCallback(async () => {
    if (!editorRef.current) return false;
    
    try {
      const saveData = await storageManager.loadCanvas();
      if (!saveData) {
        console.log('没有找到保存的画布数据');
        return false;
      }
      
      // 检查数据有效性
      if (!saveData.canvasData || !saveData.version) {
        console.log('自动保存数据无效，跳过恢复');
        return false;
      }
      
      // 检查是否是最近的保存（避免恢复过旧的数据）
      const now = Date.now();
      const saveTime = saveData.timestamp || 0;
      const timeDiff = now - saveTime;
      
      // 如果保存时间超过24小时，不自动恢复
      if (timeDiff > 24 * 60 * 60 * 1000) {
        console.log('自动保存数据过旧，跳过恢复');
        return false;
      }
      
      console.log('开始恢复自动保存的画布状态...');
      console.log('保存的数据结构:', {
        hasCanvasData: !!saveData.canvasData,
        hasCurrentPageId: !!saveData.currentPageId,
        hasCamera: !!saveData.camera,
        hasViewport: !!saveData.viewport,
        timestamp: saveData.timestamp,
        isRefresh: saveData.isRefresh
      });
      
      // 详细检查 canvasData 中的形状数据
      if (saveData.canvasData && saveData.canvasData.store) {
        const shapesInData = Object.keys(saveData.canvasData.store).filter(key => 
          key.startsWith('shape:') && !key.includes('pointer')
        );
        console.log('保存的数据中包含的形状数量:', shapesInData.length);
        console.log('形状类型:', shapesInData.map(key => {
          const shape = saveData.canvasData.store[key];
          return shape.typeName === 'shape' ? shape.type : 'unknown';
        }));
      }
      
      setIsRestoring(true);
      
      const { loadSnapshot } = await import('tldraw');
      
      // 加载画布数据
      console.log('正在加载快照数据到 store...');
      loadSnapshot(editorRef.current.store, saveData.canvasData);
      console.log('快照数据加载完成');
      
      // 等待加载完成
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 验证加载是否成功
      const shapesAfterLoad = editorRef.current.getCurrentPageShapes();
      console.log('加载后的形状数量:', shapesAfterLoad.length);
      console.log('加载后的形状:', shapesAfterLoad.map(s => ({ id: s.id, type: s.type })));
      
      // 恢复页面状态
      if (saveData.currentPageId) {
        try {
          const allPages = editorRef.current.getPages();
          const targetPage = allPages.find(page => page.id === saveData.currentPageId);
          
          if (targetPage) {
            setTimeout(() => {
              editorRef.current.setCurrentPage(saveData.currentPageId);
              console.log('已恢复到页面:', saveData.currentPageId);
            }, 100);
          } else if (allPages.length > 0) {
            editorRef.current.setCurrentPage(allPages[0].id);
          }
        } catch (error) {
          console.warn('恢复页面状态失败:', error);
        }
      }
      
      // 恢复视图状态（缩放、位置等）
      if (saveData.camera) {
        try {
          console.log('准备恢复相机状态:', saveData.camera);
          setTimeout(() => {
            try {
              editorRef.current.setCamera(saveData.camera);
              console.log('已恢复视图状态:', saveData.camera);
              
              // 验证相机状态是否真的恢复了
              setTimeout(() => {
                const currentCamera = editorRef.current.getCamera();
                console.log('当前相机状态:', currentCamera);
                console.log('相机状态恢复是否成功:', 
                  Math.abs(currentCamera.x - saveData.camera.x) < 0.01 &&
                  Math.abs(currentCamera.y - saveData.camera.y) < 0.01 &&
                  Math.abs(currentCamera.z - saveData.camera.z) < 0.01
                );
              }, 100);
            } catch (cameraError) {
              console.error('设置相机状态失败:', cameraError);
            }
          }, 500); // 增加延迟，确保编辑器完全初始化
        } catch (error) {
          console.warn('恢复视图状态失败:', error);
        }
      }
      
      // 如果是刷新恢复，显示提示
      if (saveData.isRefresh) {
        console.log('检测到刷新恢复，工作内容已完全恢复');
        // 可以在这里添加一个短暂的提示
      }
      
      // 更新localStorage中的图片ID列表
      if (saveData.imageInfo) {
        const currentImageIds = saveData.imageInfo.map(img => img.shapeId);
        localStorage.setItem('currentImageIds', JSON.stringify(currentImageIds));
      }
      
      console.log('自动保存的画布状态恢复成功');
      setIsRestoring(false);
      
      return true;
    } catch (error) {
      console.error('❌ 恢复自动保存失败:', error);
      // 延迟输出详细错误，确保可见
      setTimeout(() => {
        console.error('⚠️ 恢复画布状态时发生错误:', {
          message: error.message,
          stack: error.stack,
          timestamp: new Date().toLocaleString()
        });
      }, 100);
      return false;
    } finally {
      setIsRestoring(false);
    }
  }, []);

  // 监听画布变化，自动保存
  useEffect(() => {
    if (!editorReady || !editorRef.current) return;
    
    let saveTimeout;
    
    const unsubscribe = editorRef.current.store.listen(() => {
      // 防抖：延迟5秒后保存，避免频繁保存
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        saveCanvasState();
      }, 5000);
    }, { scope: "document" });
    
    return () => {
      clearTimeout(saveTimeout);
      unsubscribe();
    };
  }, [editorReady, saveCanvasState]);

  // 页面加载时自动恢复画布状态
  useEffect(() => {
    if (!editorReady) return;
    
    const restoreAutoSave = async () => {
      // 检查是否有分享ID，如果有分享ID则不自动恢复
      const urlParams = new URLSearchParams(window.location.search);
      const shareIdFromUrl = urlParams.get('share');
      const shareIdFromWindow = window.SHARE_ID;
      
      if (shareIdFromUrl || shareIdFromWindow) {
        console.log('检测到分享ID，跳过自动恢复');
        return;
      }
      
      // 延迟一下再恢复，确保编辑器完全初始化
      setTimeout(async () => {
        console.log('开始检查自动保存数据...');
        const restored = await restoreCanvasState();
        if (!restored) {
          console.log('没有找到自动保存的数据或恢复失败');
        } else {
          console.log('自动保存数据恢复完成');
        }
      }, 1500); // 增加延迟时间，确保编辑器完全初始化
    };
    
    restoreAutoSave();
  }, [editorReady, restoreCanvasState]);

  // 页面卸载前保存状态
  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (editorRef.current) {
        try {
          console.log('页面即将关闭/刷新，立即保存画布状态...');
          
          // 强制同步保存，确保数据不丢失
          const canvasData = getSnapshot(editorRef.current.store);
          const currentPageId = editorRef.current.getCurrentPageId();
          
          const currentShapes = editorRef.current.getCurrentPageShapes();
          const imageShapes = currentShapes.filter(shape => shape.type === 'image');
          const currentImageIds = imageShapes.map(shape => shape.id);
          
          // 保存视图状态（缩放、位置等）
          const viewport = editorRef.current.getViewportPageBounds();
          const camera = editorRef.current.getCamera();
          
          console.log('保存时的状态:', {
            shapesCount: currentShapes.length,
            imageCount: imageShapes.length,
            currentPageId,
            camera,
            viewport
          });
          
          const saveData = {
            canvasData,
            currentPageId,
            imageInfo: currentImageIds.map(id => ({ shapeId: id })),
            viewport: {
              x: viewport.x,
              y: viewport.y,
              width: viewport.width,
              height: viewport.height
            },
            camera: {
              x: camera.x,
              y: camera.y,
              z: camera.z
            },
            version: '1.0',
            timestamp: Date.now(),
            autoSave: true,
            isRefresh: true // 标记为刷新保存
          };
          
          localStorage.setItem('autoSaveCanvas', JSON.stringify(saveData));
          console.log('页面关闭前已保存画布状态（包含视图信息）');
          
          // 可选：显示确认对话框（仅在用户主动关闭时）
          if (event.type === 'beforeunload') {
            // 不显示确认对话框，直接保存
            return;
          }
        } catch (error) {
          console.error('页面关闭前保存失败:', error);
        }
      }
    };
    
    // 监听多种页面关闭事件
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('unload', handleBeforeUnload);
    
    // 监听页面隐藏事件（移动端、切换标签页等）
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && editorRef.current) {
        handleBeforeUnload({ type: 'visibilitychange' });
      }
    });
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('unload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleBeforeUnload);
    };
  }, []);

  // 添加键盘快捷键支持
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+R: 重置画布
      if (e.ctrlKey && e.key === 'r') {
        e.preventDefault();
        if (confirm('重置/关闭画布将清空所有内容，未保存的数据将丢失。确定继续吗？')) {
          try {
            console.log('开始重置画布...');
            
            // 清空当前画布
            const currentShapes = editorRef.current.getCurrentPageShapes();
            console.log('当前形状数量:', currentShapes.length);
            
            if (currentShapes.length > 0) {
              const shapeIds = currentShapes.map(shape => shape.id);
              editorRef.current.deleteShapes(shapeIds);
              console.log('已删除形状:', shapeIds.length);
            }
            
            // 清除自动保存数据
            localStorage.removeItem('autoSaveCanvas');
            localStorage.removeItem('currentImageIds');
            console.log('已清除自动保存数据');
            
            // 重置视图
            editorRef.current.resetZoom();
            editorRef.current.setCamera({ x: 0, y: 0, z: 1 });
            console.log('已重置视图');
            
            console.log('画布重置成功！');
          } catch (error) {
            console.error('重置画布失败:', error);
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // 自动加载分享画布
  useEffect(() => {
    const loadSharedCanvas = async () => {
      // 检查是否有分享ID（从URL参数或window.SHARE_ID）
      const urlParams = new URLSearchParams(window.location.search);
      const shareIdFromUrl = urlParams.get('share');
      const shareIdFromWindow = window.SHARE_ID;
      const shareId = shareIdFromUrl || shareIdFromWindow;
      
      if (!shareId || !editorReady) {
        return;
      }

      try {
        console.log('检测到分享ID，开始加载分享画布:', shareId);
        
        // 显示加载提示
        setIsLoading(true);
        
        // 获取分享数据
        const apiBaseUrl = getApiBaseUrl();
        if (!apiBaseUrl) {
          throw new Error('无法获取API地址');
        }
        
        const response = await fetch(`${apiBaseUrl}/api/get-share/${shareId}`);
        
        if (!response.ok) {
          throw new Error(`HTTP错误: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
          const shareData = result.data;
          
          // 调试：打印分享数据结构
          console.log('分享数据结构:', shareData);
          console.log('画布数据:', shareData.canvasData);
          console.log('页面数据:', shareData.canvasData?.pages);
          console.log('形状数据:', shareData.canvasData?.shapes);
          console.log('当前页面ID:', shareData.currentPageId);
          
          // 加载分享的画布数据
          if (shareData.canvasData) {
            const { loadSnapshot } = await import('tldraw');
            
            // 加载完整的画布状态
            loadSnapshot(editorRef.current.store, shareData.canvasData);
            
            // 等待加载完成
            await new Promise(resolve => setTimeout(resolve, 800));
            
            // 恢复页面状态 - 使用和LoadCanvasButton相同的逻辑
            if (shareData.currentPageId) {
              try {
                console.log('尝试恢复到页面:', shareData.currentPageId);
                
                // 检查页面是否存在
                const allPages = editorRef.current.getPages();
                const targetPage = allPages.find(page => page.id === shareData.currentPageId);
                console.log('目标页面是否存在:', !!targetPage);
                
                if (targetPage) {
                  // 等待一下确保画布完全加载
                  setTimeout(() => {
                    try {
                      editorRef.current.setCurrentPage(shareData.currentPageId);
                      console.log('已恢复到页面:', shareData.currentPageId);
                      
                      // 验证是否真的切换了
                      setTimeout(() => {
                        const newCurrentPage = editorRef.current.getCurrentPage();
                        console.log('切换后的当前页面:', newCurrentPage.name, newCurrentPage.id);
                        
                        // 强制刷新UI
                        try {
                          editorRef.current.updateViewportPageBounds();
                        } catch (e) {
                          // 如果方法不存在，静默处理
                        }
                        console.log('已强制刷新UI');
                      }, 50);
                    } catch (error) {
                      console.error('设置页面失败:', error);
                    }
                  }, 100);
                } else {
                  console.warn('页面不存在，使用默认页面:', shareData.currentPageId);
                  // 如果页面不存在，使用第一个可用页面
                  if (allPages.length > 0) {
                    editorRef.current.setCurrentPage(allPages[0].id);
                  }
                }
              } catch (error) {
                console.warn('恢复页面状态失败:', error);
                // 如果设置页面失败，尝试使用默认页面
                try {
                  const pages = editorRef.current.getPages();
                  if (pages.length > 0) {
                    editorRef.current.setCurrentPage(pages[0].id);
                  }
                } catch (fallbackError) {
                  console.error('设置默认页面也失败:', fallbackError);
                }
              }
            }
            
            // 验证加载结果
            const loadedShapes = editorRef.current.getCurrentPageShapes();
            const allPages = editorRef.current.getPages();
            console.log('加载后的形状数量:', loadedShapes.length);
            console.log('当前页面ID:', editorRef.current.getCurrentPageId());
            console.log('所有页面:', allPages.map(p => ({ id: p.id, name: p.name })));
            console.log('当前页面形状:', loadedShapes.map(s => ({ id: s.id, type: s.type })));
            
            console.log('分享画布加载成功');
            
            // 清理URL参数，避免刷新时重复加载
            if (shareIdFromUrl) {
              const newUrl = window.location.pathname;
              window.history.replaceState({}, document.title, newUrl);
            }
          }
        } else {
          console.error('获取分享数据失败:', result.message);
          alert(`分享画布加载失败：${result.message}`);
        }
      } catch (error) {
        console.error('加载分享画布时出错:', error);
        alert('加载分享画布失败，请检查链接是否正确');
      } finally {
        setIsLoading(false);
      }
    };

    loadSharedCanvas();
  }, [editorReady]);

  // 处理JSON文件加载
  const handleJsonFile = async (file) => {
    console.log('处理JSON文件:', file.name);
    
    try {
      const text = await file.text();
      const saveData = JSON.parse(text);
      
      if (saveData.canvasData && saveData.version) {
        const { loadSnapshot } = await import('tldraw');
        
        // 清空当前画布
        const currentShapes = editorRef.current.getCurrentPageShapes();
        if (currentShapes.length > 0) {
          const shapeIds = currentShapes.map(shape => shape.id);
          editorRef.current.deleteShapes(shapeIds);
        }
        
        // 加载画布数据
        loadSnapshot(editorRef.current.store, saveData.canvasData);
        
        // 等待加载完成
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 恢复页面状态
        if (saveData.currentPageId) {
          try {
            const allPages = editorRef.current.getPages();
            const targetPage = allPages.find(page => page.id === saveData.currentPageId);
            
            if (targetPage) {
              setTimeout(() => {
                editorRef.current.setCurrentPage(saveData.currentPageId);
              }, 100);
            } else if (allPages.length > 0) {
              editorRef.current.setCurrentPage(allPages[0].id);
            }
          } catch (error) {
            console.warn('恢复页面状态失败:', error);
          }
        }
        
        // 更新localStorage
        if (saveData.imageInfo) {
          const currentImageIds = saveData.imageInfo.map(img => img.shapeId);
          localStorage.setItem('currentImageIds', JSON.stringify(currentImageIds));
        }
        
        console.log(`画布文件 "${file.name}" 加载成功！`);
      } else {
        alert('这不是一个有效的画布保存文件');
      }
    } catch (error) {
      console.error('加载JSON文件失败:', error);
      alert(`加载文件失败: ${error.message}`);
    }
  };

  // 处理拖拽JSON文件
  const handleDragOver = (e) => {
    console.log('拖拽进入:', e.dataTransfer.types);
    // 检查是否拖拽的是文件
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(true);
    }
  };

  const handleDragLeave = (e) => {
    console.log('拖拽离开');
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = async (e) => {
    console.log('拖拽放下:', e.dataTransfer.files);
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    console.log('文件列表:', files);
    const jsonFiles = files.filter(file => file.type === 'application/json' || file.name.endsWith('.json'));
    console.log('JSON文件:', jsonFiles);
    
    if (jsonFiles.length > 0) {
      const file = jsonFiles[0]; // 只处理第一个JSON文件
      try {
        const text = await file.text();
        const saveData = JSON.parse(text);
        
        // 检查是否是有效的画布保存文件
        if (saveData.canvasData && saveData.version) {
          // 使用和LoadCanvasButton相同的加载逻辑
          const { loadSnapshot } = await import('tldraw');
          
          // 先清空当前画布
          const currentShapes = editorRef.current.getCurrentPageShapes();
          if (currentShapes.length > 0) {
            const shapeIds = currentShapes.map(shape => shape.id);
            editorRef.current.deleteShapes(shapeIds);
          }
          
          // 加载画布数据
          loadSnapshot(editorRef.current.store, saveData.canvasData);
          
          // 等待加载完成
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // 恢复页面状态
          if (saveData.currentPageId) {
            try {
              console.log('尝试恢复到页面:', saveData.currentPageId);
              
              const allPages = editorRef.current.getPages();
              const targetPage = allPages.find(page => page.id === saveData.currentPageId);
              console.log('目标页面是否存在:', !!targetPage);
              
              if (targetPage) {
                setTimeout(() => {
                  try {
                    editorRef.current.setCurrentPage(saveData.currentPageId);
                    console.log('已恢复到页面:', saveData.currentPageId);
                    
                    setTimeout(() => {
                      const newCurrentPage = editorRef.current.getCurrentPage();
                      console.log('切换后的当前页面:', newCurrentPage.name, newCurrentPage.id);
                      
                      try {
                        editorRef.current.updateViewportPageBounds();
                      } catch (e) {
                        // 如果方法不存在，静默处理
                      }
                      console.log('已强制刷新UI');
                    }, 50);
                  } catch (error) {
                    console.error('设置页面失败:', error);
                  }
                }, 100);
              } else {
                console.warn('页面不存在，使用默认页面:', saveData.currentPageId);
                if (allPages.length > 0) {
                  editorRef.current.setCurrentPage(allPages[0].id);
                }
              }
            } catch (error) {
              console.warn('恢复页面状态失败:', error);
            }
          }
          
          // 更新localStorage中的图片ID列表
          if (saveData.imageInfo) {
            const currentImageIds = saveData.imageInfo.map(img => img.shapeId);
            localStorage.setItem('currentImageIds', JSON.stringify(currentImageIds));
          }
          
          console.log('JSON文件加载成功:', file.name);
          alert(`画布文件 "${file.name}" 加载成功！`);
        } else {
          alert('这不是一个有效的画布保存文件');
        }
      } catch (error) {
        console.error('加载JSON文件失败:', error);
        alert(`加载文件失败: ${error.message}`);
      }
    }
  };

  // 添加全局拖拽事件监听
  useEffect(() => {
    const handleGlobalDragOver = (e) => {
      console.log('全局拖拽进入:', e.target, e.dataTransfer.types);
      if (e.dataTransfer.types.includes('Files')) {
        const files = Array.from(e.dataTransfer.files);
        const jsonFiles = files.filter(file => 
          file.type === 'application/json' || 
          file.name.toLowerCase().endsWith('.json')
        );
        
        if (jsonFiles.length > 0) {
          console.log('检测到JSON文件拖拽');
          e.preventDefault();
          e.stopPropagation();
          setDragOver(true);
        }
      }
    };

    const handleGlobalDrop = (e) => {
      console.log('全局拖拽放下:', e.target, e.dataTransfer.files);
      if (e.dataTransfer.types.includes('Files')) {
        const files = Array.from(e.dataTransfer.files);
        const jsonFiles = files.filter(file => 
          file.type === 'application/json' || 
          file.name.toLowerCase().endsWith('.json')
        );
        
        if (jsonFiles.length > 0) {
          console.log('检测到JSON文件，开始处理:', jsonFiles[0].name);
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
          
          // 直接在这里处理JSON文件
          handleJsonFile(jsonFiles[0]);
        }
      }
    };

    document.addEventListener('dragover', handleGlobalDragOver, true);
    document.addEventListener('drop', handleGlobalDrop, true);

    return () => {
      document.removeEventListener('dragover', handleGlobalDragOver, true);
      document.removeEventListener('drop', handleGlobalDrop, true);
    };
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative", display: "flex" }}>
      {/* 左侧画布区域 */}
      <div 
        style={{ flex: 1, position: "relative" }}
        onDragOver={(e) => {
          console.log('画布区域拖拽进入');
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          console.log('画布区域拖拽离开');
          e.preventDefault();
          setDragOver(false);
        }}
        onDrop={async (e) => {
          console.log('画布区域拖拽放下');
          e.preventDefault();
          setDragOver(false);
          
          const files = Array.from(e.dataTransfer.files);
          console.log('拖拽的文件:', files);
          
          const jsonFiles = files.filter(file => 
            file.type === 'application/json' || 
            file.name.toLowerCase().endsWith('.json')
          );
          
          if (jsonFiles.length > 0) {
            const file = jsonFiles[0];
            console.log('处理JSON文件:', file.name);
            
            try {
              const text = await file.text();
              const saveData = JSON.parse(text);
              
              if (saveData.canvasData && saveData.version) {
                const { loadSnapshot } = await import('tldraw');
                
                // 清空当前画布
                const currentShapes = editorRef.current.getCurrentPageShapes();
                if (currentShapes.length > 0) {
                  const shapeIds = currentShapes.map(shape => shape.id);
                  editorRef.current.deleteShapes(shapeIds);
                }
                
                // 加载画布数据
                loadSnapshot(editorRef.current.store, saveData.canvasData);
                
                // 等待加载完成
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // 恢复页面状态
                if (saveData.currentPageId) {
                  try {
                    const allPages = editorRef.current.getPages();
                    const targetPage = allPages.find(page => page.id === saveData.currentPageId);
                    
                    if (targetPage) {
                      setTimeout(() => {
                        editorRef.current.setCurrentPage(saveData.currentPageId);
                      }, 100);
                    } else if (allPages.length > 0) {
                      editorRef.current.setCurrentPage(allPages[0].id);
                    }
                  } catch (error) {
                    console.warn('恢复页面状态失败:', error);
                  }
                }
                
                // 更新localStorage
                if (saveData.imageInfo) {
                  const currentImageIds = saveData.imageInfo.map(img => img.shapeId);
                  localStorage.setItem('currentImageIds', JSON.stringify(currentImageIds));
                }
                
                alert(`画布文件 "${file.name}" 加载成功！`);
              } else {
                alert('这不是一个有效的画布保存文件');
              }
            } catch (error) {
              console.error('加载JSON文件失败:', error);
              alert(`加载文件失败: ${error.message}`);
            }
          }
        }}
      >
      {isLoading ? (
        <div style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f5f5f5",
          fontSize: "18px",
          color: "#666"
        }}>
          正在重新初始化画布...
        </div>
      ) : isRestoring ? (
        <div style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f8f9fa",
          fontSize: "16px",
          color: "#28a745",
          flexDirection: "column",
          gap: "10px"
        }}>
          <div style={{
            width: "40px",
            height: "40px",
            border: "3px solid #28a745",
            borderTop: "3px solid transparent",
            borderRadius: "50%",
            animation: "spin 1s linear infinite"
          }}></div>
          <div>正在恢复您的工作内容...</div>
          <div style={{ fontSize: "14px", color: "#6c757d" }}>请稍候，您的画布即将完全恢复</div>
        </div>
      ) : (
        <Tldraw
          key={forceRerender} // 强制重新渲染
          store={store}
          onMount={(editor) => {
          editorRef.current = editor;
          setEditorReady(true);
          
          // 保存干净初始态快照（只在首次mount时保存）
          if (!snapshotSavedRef.current) {
            try {
              const snapshot = getSnapshot(store);
              pristineSnapshotRef.current = snapshot;
              snapshotSavedRef.current = true;
              console.log('已保存干净初始态快照');
            } catch (error) {
              console.error('保存初始快照失败:', error);
            }
          }
          
          // 确保没有选中任何元素
          setTimeout(() => {
            try {
              editor.setSelectedShapes([]);
            } catch (error) {
              // 静默处理错误
            }
          }, 100);
          
          // 监听选中变化
          editor.store.listen(() => {
            // 检查选中的形状，看是否有frame被选中
            try {
              const selectedShapeIds = editor.getSelectedShapeIds();
              if (selectedShapeIds.length > 0) {
                const selectedShape = editor.getShape(selectedShapeIds[0]);
                if (selectedShape && selectedShape.type === 'frame') {
                  setSelectedFrame(selectedShape);
                } else {
                  setSelectedFrame(null);
                }
              } else {
                setSelectedFrame(null);
              }
            } catch (error) {
              setSelectedFrame(null);
            }
            
            // 更新当前图片ID列表
            const currentShapes = editor.getCurrentPageShapes();
            const imageShapes = currentShapes.filter(shape => shape.type === 'image');
            const currentImageIds = imageShapes.map(shape => shape.id);
            localStorage.setItem('currentImageIds', JSON.stringify(currentImageIds));
          });

        }}
        />
      )}
      
      {/* 保存状态指示器已移除 */}

      {/* 拖拽JSON文件提示覆盖层 */}
      {dragOver && (
        <div 
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 123, 255, 0.1)',
            border: '3px dashed #007bff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            pointerEvents: 'auto'
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div style={{
            background: 'white',
            padding: '20px',
            borderRadius: '8px',
            textAlign: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
          }}>
            <h3 style={{ margin: '0 0 10px 0', color: '#007bff' }}>📄 拖拽画布文件</h3>
            <p style={{ margin: 0, color: '#666' }}>将保存的JSON文件拖拽到这里加载画布</p>
          </div>
        </div>
      )}
      
       {/* 顶部按钮已移除，功能集成到右侧素材栏中 */}
      </div>
      
      {/* 右侧集成素材栏 */}
      {editorReady && (
        <ResizableSidebar 
          width={sidebarWidth} 
          onWidthChange={setSidebarWidth}
        >
          <IntegratedAssetSidebar 
            editor={editorRef.current} 
            selectedFrame={selectedFrame}
            setIsLoading={setIsLoading}
            platform="TM"
            width={sidebarWidth}
            onReset={handleResetCanvas}
          />
        </ResizableSidebar>
      )}
    </div>
  );
}
