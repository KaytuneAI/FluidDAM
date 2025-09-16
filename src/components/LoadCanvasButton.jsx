import React, { useRef } from "react";
import { loadSnapshot } from "tldraw";

export default function LoadCanvasButton({ editor, setIsLoading }) {
  const fileInputRef = useRef(null);

  const loadCanvas = async (file) => {
    if (!editor) {
      return;
    }

    // 显示加载提示
    const loadingMessage = document.createElement('div');
    
    try {
      console.log('开始加载画布...');
      loadingMessage.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 20px;
        border-radius: 8px;
        z-index: 3000;
        font-size: 16px;
      `;
      loadingMessage.textContent = '正在加载画布...';
      document.body.appendChild(loadingMessage);
      
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const saveData = JSON.parse(e.target.result);
          
          // 1. 重置当前画布 - 使用更安全的方法
          try {
            // 尝试删除所有形状而不是清空store
            const currentShapes = editor.getCurrentPageShapes();
            if (currentShapes.length > 0) {
              const shapeIds = currentShapes.map(shape => shape.id);
              try {
                editor.deleteShapes(shapeIds);
              } catch (deleteError) {
                // 备用方案：逐个删除
                for (const shapeId of shapeIds) {
                  try {
                    editor.deleteShapes([shapeId]);
                  } catch (singleDeleteError) {
                    // 删除单个形状失败，静默处理
                  }
                }
              }
            }
            
            // 等待删除操作完成
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (clearError) {
            // 清空画布时出错，静默处理
          }
          
          // 2. 直接使用loadSnapshot加载完整状态
          if (saveData.canvasData) {
            try {
              // Tldraw v3: 使用loadSnapshot加载完整状态
              try {
                loadSnapshot(editor.store, saveData.canvasData);
                
                // 标记为加载状态，触发组件完全重新渲染
                setIsLoading(true);
                
                // 延迟重新渲染，确保加载完成
                setTimeout(() => {
                  setIsLoading(false);
                }, 500);
                
              } catch (error) {
                // 加载画布状态时出错，静默处理
              }
              
              // 等待加载完成
              await new Promise(resolve => setTimeout(resolve, 200));
            } catch (error) {
              // 加载画布状态时出错，静默处理
            }
          }
          
          // 3. 检查加载结果
          const loadedShapes = editor.getCurrentPageShapes();
          const imageShapes = loadedShapes.filter(shape => shape.type === 'image');
          
          // 4. 更新localStorage中的图片ID列表
          if (saveData.imageInfo) {
            const currentImageIds = saveData.imageInfo.map(img => img.shapeId);
            localStorage.setItem('currentImageIds', JSON.stringify(currentImageIds));
          }
          
          // 5. 恢复保存的页面状态
          if (saveData.currentPageId) {
            try {
              console.log('尝试恢复到页面:', saveData.currentPageId);
              
              // 检查页面是否存在
              const allPages = editor.getPages();
              const targetPage = allPages.find(page => page.id === saveData.currentPageId);
              console.log('目标页面是否存在:', !!targetPage);
              
              if (targetPage) {
                // 等待一下确保画布完全加载
                setTimeout(() => {
                  try {
                    editor.setCurrentPage(saveData.currentPageId);
                    console.log('已恢复到页面:', saveData.currentPageId);
                    
                    // 验证是否真的切换了
                    setTimeout(() => {
                      const newCurrentPage = editor.getCurrentPage();
                      console.log('切换后的当前页面:', newCurrentPage.name, newCurrentPage.id);
                      
                      // 强制刷新UI
                      try {
                        editor.updateViewportPageBounds();
                      } catch (e) {
                        // 如果方法不存在，静默处理
                      }
                      console.log('已强制刷新UI');
                    }, 50);
                  } catch (error) {
                    console.warn('恢复页面状态时出错:', error);
                    console.log('错误详情:', error.message);
                  }
                }, 200); // 增加等待时间
              } else {
                console.warn('目标页面不存在:', saveData.currentPageId);
              }
            } catch (error) {
              console.warn('恢复页面状态时出错:', error);
              console.log('错误详情:', error.message);
            }
          } else {
            console.log('保存数据中没有currentPageId');
          }
          
          // 6. 加载完成，组件将自动重新渲染
          // 移除加载提示
          document.body.removeChild(loadingMessage);
          
        } catch (error) {
          document.body.removeChild(loadingMessage);
          alert('加载失败：文件格式错误');
        }
      };
      
      reader.onerror = (error) => {
        document.body.removeChild(loadingMessage);
        alert('加载失败：无法读取文件');
      };
      
      reader.readAsText(file);
      
    } catch (error) {
      if (document.body.contains(loadingMessage)) {
        document.body.removeChild(loadingMessage);
      }
      alert('加载失败，请重试');
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      if (file.type === 'application/json' || file.name.endsWith('.json')) {
        loadCanvas(file);
      } else {
        alert('请选择有效的JSON文件');
      }
    }
    // 清空input值，允许重复选择同一文件
    event.target.value = '';
  };

  const openFileDialog = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <>
      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />
      
      {/* 加载画布按钮 */}
        <button
          onClick={openFileDialog}
         title="加载画布"
         style={{
           fontSize: 16,
           padding: "4px",
           border: "0.5px solid #dee2e6",
           borderRadius: 2,
           background: "#dee2e6",
           color: "white",
           cursor: "pointer",
           fontWeight: "bold",
           whiteSpace: "nowrap",
           width: 48,
           height: 48,
           display: "flex",
           alignItems: "center",
           justifyContent: "center"
         }}
        >
          <img src="/src/load_canvas.png" alt="加载画布" style={{width: 40, height: 40}} />
        </button>
    </>
  );
}
