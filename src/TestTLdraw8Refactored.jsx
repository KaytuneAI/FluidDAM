import React, { useMemo, useRef, useState, useEffect } from "react";
import { Tldraw, createTLStore, defaultShapeUtils, getSnapshot } from "tldraw";
import "tldraw/tldraw.css";
import { getApiBaseUrl } from './utils/apiUtils.js';

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

export default function MinimalTldrawInsert() {
  const store = useMemo(() => createTLStore({ shapeUtils: [...defaultShapeUtils] }), []);
  const editorRef = useRef(null);
  const [editorReady, setEditorReady] = useState(false);
  const [selectedFrame, setSelectedFrame] = useState(null);
  const [forceRerender, setForceRerender] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  
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

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative", display: "flex" }}>
      {/* 左侧画布区域 */}
      <div style={{ flex: 1, position: "relative" }}>
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
      ) : (
        <Tldraw
          key={forceRerender} // 强制重新渲染
          store={store}
          onMount={(editor) => {
          editorRef.current = editor;
          setEditorReady(true);
          
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
          />
        </ResizableSidebar>
      )}
    </div>
  );
}
