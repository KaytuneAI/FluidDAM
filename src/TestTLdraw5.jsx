import React, { useMemo, useRef, useState, useEffect } from "react";
import { Tldraw, createTLStore, defaultShapeUtils, toRichText, loadSnapshot } from "tldraw";

// Helper: choose the **smallest containing frame** under pointer/viewport center
function __fix_findTargetFrame(editor) {
  // 1) If user explicitly selected a frame, honor that selection
  try {
    const selected = editor.getSelectedShapes?.() || []
    const selectedFrame = selected.find((s) => s.type === 'frame')
    if (selectedFrame) return selectedFrame
  } catch {}

  // 2) Otherwise, use pointer page point (or viewport center)
  let focus
  try {
    const vb = editor.getViewportPageBounds?.()
    const center = vb ? { x: (vb.minX + vb.maxX) / 2, y: (vb.minY + vb.maxY) / 2 } : { x: 0, y: 0 }
    const inp = editor.inputs
    focus = (inp && inp.currentPagePoint) ? inp.currentPagePoint : center
  } catch {
    focus = { x: 0, y: 0 }
  }

  // Collect frames on current page
  const frames = editor.getCurrentPageShapes?.().filter((s) => s.type === 'frame') || []
  if (!frames.length) return null

  // 2a) Prefer frames that CONTAIN the focus point; among them choose the smallest by area
  const containing = frames.filter((f) => {
    try { return editor.isPointInShape(f, focus, { hitInside: true }) } catch { return false }
  })
  if (containing.length) {
    return containing.sort((a, b) => (a.props.w * a.props.h) - (b.props.w * b.props.h))[0]
  }

  // 3) Fallback: nearest-by-center
  let best = null, bestD = Infinity
  for (const f of frames) {
    const b = editor.getShapeBounds(f)
    const cx = (b.minX + b.maxX) / 2
    const cy = (b.minY + b.maxY) / 2
    const dx = cx - focus.x, dy = cy - focus.y
    const d = dx*dx + dy*dy
    if (d < bestD) { best = f; bestD = d }
  }
  return best

}

import "tldraw/tldraw.css";

function InsertImageButton({ editor, selectedFrame }) {
  const fileInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [lastAlertedFile, setLastAlertedFile] = useState(null);

  // 处理拖拽文件夹
  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    
    const items = e.dataTransfer.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry();
          if (entry && entry.isFile) {
            entry.file((file) => {
              if (file.type.startsWith('image/')) {
                // 直接插入图片
                insertImage(file);
              }
            });
          }
        }
      }
    }
  };



  // 保存图片信息到JSON文件
  const saveImageInfo = async (file, assetId, shapeId, dataUrl, width, height) => {
    try {
      const imageInfo = {
        id: shapeId,
        assetId: assetId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        dataUrl: dataUrl.substring(0, 100) + '...', // 只保存前100个字符作为预览
        width: width,
        height: height,
        insertedAt: new Date().toISOString(),
        tags: []
      };

      // 使用后端API保存数据
      const response = await fetch('http://localhost:3001/api/save-image-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(imageInfo)
      });

      const result = await response.json();
      
      if (result.success) {
        console.log('图片信息已保存到服务器:', imageInfo.fileName);
        console.log('总图片数量:', result.totalImages);
        
        // 更新localStorage中的图片ID列表
        const currentImageIds = JSON.parse(localStorage.getItem('currentImageIds') || '[]');
        currentImageIds.push(shapeId);
        localStorage.setItem('currentImageIds', JSON.stringify(currentImageIds));
      } else {
        console.error('保存失败:', result.message);
        // 如果API失败，回退到localStorage
        const savedData = localStorage.getItem('imagesDatabase') || '{"images":[],"lastUpdated":"","totalImages":0}';
        const database = JSON.parse(savedData);
        database.images.push(imageInfo);
        database.lastUpdated = new Date().toISOString();
        database.totalImages = database.images.length;
        localStorage.setItem('imagesDatabase', JSON.stringify(database));
        console.log('已保存到localStorage作为备份');
      }
      
    } catch (error) {
      console.error('保存图片信息时出错:', error);
      // 如果API不可用，回退到localStorage
      try {
        const imageInfo = {
          fileName: file.name,
          fileSize: file.size,
          assetId: assetId,
          shapeId: shapeId,
          dataUrl: dataUrl,
          width: width,
          height: height,
          insertedAt: new Date().toISOString(),
          tags: []
        };
        
        const savedData = localStorage.getItem('imagesDatabase') || '{"images":[],"lastUpdated":"","totalImages":0}';
        const database = JSON.parse(savedData);
        database.images.push(imageInfo);
        database.lastUpdated = new Date().toISOString();
        database.totalImages = database.images.length;
        localStorage.setItem('imagesDatabase', JSON.stringify(database));
        console.log('API不可用，已保存到localStorage作为备份');
      } catch (localStorageError) {
        console.error('localStorage保存也失败:', localStorageError);
      }
    }
  };

  const insertImage = (file) => {
    if (!editor) {
      console.log('编辑器未初始化');
      return;
    }

    if (!file) {
      console.log('没有选择文件');
      return;
    }

    // 检查是否有选中的frame - 只使用用户明确选择的frame
    let targetFrame = selectedFrame;

    

    
    try {
      const getMimeTypeFromFile = (file) => {
        return file.type || 'image/jpeg';
      };

      // 不再清空现有形状，允许插入多张图片

      // 将文件转换为 data URL
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        
        // 预加载图片，使用原始尺寸创建 asset/shape
        const img = new Image();
        
        img.onload = () => {
          const naturalW = img.naturalWidth || 300;
          const naturalH = img.naturalHeight || 300;

          const assetId = `asset:${(globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2))}`;
          
          // 重新启用缩放功能
          let scaledWidth = naturalW, scaledHeight = naturalH; // 默认使用原始尺寸
          
          try {
            // Tldraw v3: 创建图片资产
            editor.createAssets([
              {
                id: assetId,
                type: "image",
                typeName: "asset",
                meta: {},
                props: {
                  w: naturalW,  // 使用原始尺寸，让Tldraw处理缩放
                  h: naturalH,
                  src: dataUrl,
                  name: file.name,
                  mimeType: getMimeTypeFromFile(file),
                  isAnimated: false
                }
              }
            ]);
          } catch (assetError) {
            console.error('创建资产时发生错误:', assetError);
            return;
          }

          // 计算初始位置 - 直接放在frame中
          let initialX = 0, initialY = 0;
          
          if (targetFrame) {
      // FIX: fit-to-frame (tldraw v3)
      // 等比缩放图片，使其完全贴合所选 Frame，并在 Frame 内居中
      try {
        const fw = targetFrame.props.w, fh = targetFrame.props.h
        // 使用图片的原始尺寸作为基准
        const baseW = naturalW
        const baseH = naturalH
        // 计算缩放比例，使图片完全贴合frame
        const scale = Math.min(fw / baseW, fh / baseH)
        const fitW = Math.max(1, baseW * scale)
        const fitH = Math.max(1, baseH * scale)
        // 更新缩放后的尺寸
        scaledWidth = fitW
        scaledHeight = fitH
        // 计算居中位置
        initialX = targetFrame.x + (fw - fitW) / 2
        initialY = targetFrame.y + (fh - fitH) / 2
      } catch (e) {
        console.warn('fit-to-frame failed:', e)
      }



            const frameX = targetFrame.x;
            const frameY = targetFrame.y;
            const frameWidth = targetFrame.props.w;
            const frameHeight = targetFrame.props.h;
            
          } else {
            // 如果没有选中frame，设置宽度为400，高度按比例计算
            const targetWidth = 400;
            const aspectRatio = naturalH / naturalW;
            scaledWidth = targetWidth;
            scaledHeight = Math.round(targetWidth * aspectRatio);
            
            const viewport = editor.getViewportScreenBounds();
            const screenCenter = { x: viewport.width / 2, y: viewport.height / 2 };
            const pageCenter = editor.screenToPage(screenCenter);
            
            initialX = pageCenter.x - (scaledWidth / 2);
            initialY = pageCenter.y - (scaledHeight / 2);
          }

          // Tldraw v3: 创建图片形状
          const imageShape = {
            type: "image",
            x: initialX,
            y: initialY,
            props: {
              w: scaledWidth,
              h: scaledHeight,
              assetId: assetId
            }
          };
          

          try {
            // Tldraw v3: 创建图片形状
            const shapeId = editor.createShape(imageShape);
            
            if (shapeId) {
              const createdShape = editor.getShape(shapeId);
              
              // Tldraw v3: 如果需要重新定位，使用updateShapes
              if (initialX !== 0 || initialY !== 0) {
                try {
                  editor.updateShapes([{
                    id: shapeId,
                    type: 'image',
                    x: initialX,
                    y: initialY
                  }]);
                } catch (error) {
                  console.warn('更新图片位置时出错:', error);
                }
              }
              
              // Tldraw v3: 如果需要重新设置尺寸，使用updateShapes
              if (scaledWidth !== naturalW || scaledHeight !== naturalH) {
                try {
                  editor.updateShapes([{
                    id: shapeId,
                    type: 'image',
                    props: {
                      w: scaledWidth,
                      h: scaledHeight
                    }
                  }]);
                } catch (error) {
                  console.warn('更新图片尺寸时出错:', error);
                }
              }
              
              // Tldraw v3: 选择形状 - 确保shapeId格式正确
              try {
                const selectId = typeof shapeId === 'string' ? shapeId : shapeId?.id || shapeId?.toString() || 'unknown';
                if (!selectId.startsWith('shape:')) {
                  const formattedId = 'shape:' + selectId;
                  editor.select(formattedId);
                } else {
                  editor.select(selectId);
                }
              } catch (error) {
                console.warn('选择形状时出错:', error);
              }
              
              // 保存图片信息到JSON文件 - 确保shapeId是字符串且格式正确
              let shapeIdString = typeof shapeId === 'string' ? shapeId : shapeId?.id || shapeId?.toString() || 'unknown';
              if (!shapeIdString.startsWith('shape:')) {
                shapeIdString = 'shape:' + shapeIdString;
              }
              saveImageInfo(file, assetId, shapeIdString, dataUrl, naturalW, naturalH);
            } else {
              console.error('createShape返回了空值');
            }
          } catch (shapeError) {
            console.error('创建形状时发生错误:', shapeError);
          }
        };
        
        img.onerror = (error) => {
          console.error('图片加载失败:', file.name, error);
        };
        
        img.src = dataUrl;
      };
      
      reader.onerror = () => {
        console.error('文件读取失败');
      };
      
      // 开始读取文件
      reader.readAsDataURL(file);
      
    } catch (error) {
      console.error('插入图片时出错:', error);
    }
  };

  const handleFileSelect = (event) => {
    const files = event.target.files;
    if (files.length > 0) {
      // 直接插入图片
      const file = files[0];
      insertImage(file);
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
        accept="image/*"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />
      

      
      {/* 插入图片按钮 */}
      <button
        onClick={openFileDialog}
        title="插入本地图片"
        style={{
          fontSize: 14,
          padding: "8px 16px",
          border: "1px solid #007bff",
          borderRadius: 6,
          background: "#007bff",
          color: "white",
          cursor: "pointer",
          fontWeight: "bold"
        }}
      >
        插入图片
      </button>





      {/* 拖拽区域 */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: dragOver ? 'rgba(0,123,255,0.1)' : 'transparent',
          border: dragOver ? '2px dashed #007bff' : 'none',
          display: dragOver ? 'flex' : 'none',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1500,
          pointerEvents: dragOver ? 'auto' : 'none'
        }}
      >
        <div style={{
          background: 'white',
          padding: '20px',
          borderRadius: '8px',
          textAlign: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
        }}>
          <h3>拖拽图片文件到这里</h3>
          <p>支持从文件夹中拖拽图片文件</p>
        </div>
      </div>




    </>
  );
}

function SaveCanvasButton({ editor }) {
  const saveCanvas = async () => {
    if (!editor) {
      console.log('编辑器未初始化');
      return;
    }

    try {
      console.log('开始保存画布...');
      
      // 获取当前画布的所有形状
      const currentShapes = editor.getCurrentPageShapes();
      const imageShapes = currentShapes.filter(shape => shape.type === 'image');
      
      // 获取图片信息
      const imageInfo = [];
      for (const shape of imageShapes) {
        try {
          // 直接从shape中获取图片信息
          const assetId = shape.props.assetId;
          
          // 尝试从后端API获取文件名
          let fileName = `image_${shape.id}`;
          try {
            const response = await fetch('http://localhost:3001/api/get-image-data');
            const database = await response.json();
            
            const imageData = database.images.find(img => img.id === shape.id);
            if (imageData) {
              fileName = imageData.fileName;
            }
          } catch {
            console.warn('无法从API获取文件名，使用默认名称');
          }
          
          imageInfo.push({
            shapeId: shape.id,
            assetId: assetId,
            fileName: fileName,
            fileType: 'image/jpeg', // 默认类型
            width: shape.props.w,
            height: shape.props.h,
            x: shape.x,
            y: shape.y,
            rotation: shape.rotation || 0,
            scale: shape.props.scale || { x: 1, y: 1 }
          });
          
          console.log('保存图片信息:', fileName, shape.id);
        } catch (error) {
          console.error('处理图片信息失败:', error);
        }
      }
      
      // 导出画布状态（包含完整的图片数据）
      const canvasData = editor.store.getSnapshot();
      
      // 创建保存文件的内容
      const saveData = {
        version: '1.0',
        savedAt: new Date().toISOString(),
        canvasData: canvasData,
        imageInfo: imageInfo,
        totalImages: imageInfo.length
      };
      
      console.log('准备保存的数据结构:', {
        version: saveData.version,
        savedAt: saveData.savedAt,
        canvasDataKeys: canvasData ? Object.keys(canvasData) : 'null',
        imageInfoCount: imageInfo.length,
        totalImages: saveData.totalImages
      });
      
      // 创建并下载文件
      const blob = new Blob([JSON.stringify(saveData, null, 2)], { 
        type: 'application/json' 
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `canvas_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      console.log('画布保存成功！');
      console.log('保存的图片数量:', imageInfo.length);
      
    } catch (error) {
      console.error('保存画布时出错:', error);
      alert('保存失败，请重试');
    }
  };

  return (
    <button
      onClick={saveCanvas}
      title="保存画布"
      style={{
        fontSize: 14,
        padding: "8px 16px",
        border: "1px solid #28a745",
        borderRadius: 6,
        background: "#28a745",
        color: "white",
        cursor: "pointer",
        fontWeight: "bold"
      }}
    >
      保存画布
    </button>
  );
}

function LoadCanvasButton({ editor, setIsLoading }) {
  const fileInputRef = useRef(null);

  const loadCanvas = async (file) => {
    if (!editor) {
      console.log('编辑器未初始化');
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
          console.log('开始解析文件内容...');
          console.log('文件内容长度:', e.target.result.length);
          console.log('文件内容前100个字符:', e.target.result.substring(0, 100));
          
          const saveData = JSON.parse(e.target.result);
          console.log('加载的保存数据:', saveData);
          
          // 1. 重置当前画布 - 使用更安全的方法
          try {
            console.log('尝试清空画布...');
            
            // 尝试删除所有形状而不是清空store
            const currentShapes = editor.getCurrentPageShapes();
            if (currentShapes.length > 0) {
              const shapeIds = currentShapes.map(shape => shape.id);
              editor.deleteShapes(shapeIds);
              console.log('已删除所有现有形状');
            }
            
            // 等待删除操作完成
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (clearError) {
            console.warn('清空画布时出错:', clearError);
          }
          
          // 2. 直接使用loadSnapshot加载完整状态
          if (saveData.canvasData) {
            try {
              console.log('尝试加载画布状态...');
              console.log('canvasData结构:', Object.keys(saveData.canvasData));
              
              // Tldraw v3: 使用loadSnapshot加载完整状态
              try {
                console.log('使用 loadSnapshot');
                loadSnapshot(editor.store, saveData.canvasData);
                console.log('画布状态已加载');
                
                // 标记为加载状态，触发组件完全重新渲染
                setIsLoading(true);
                
                // 延迟重新渲染，确保加载完成
                setTimeout(() => {
                  setIsLoading(false);
                  setForceRerender(prev => prev + 1);
                  console.log('已触发组件完全重新渲染');
                }, 500);
                
              } catch (error) {
                console.warn('加载画布状态时出错:', error);
              }
              
              // 等待加载完成
              await new Promise(resolve => setTimeout(resolve, 200));
            } catch (error) {
              console.warn('加载画布状态时出错:', error);
              console.log('错误详情:', error.message);
            }
          } else {
            console.warn('保存数据中没有canvasData');
          }
          
                    // 3. 检查加载结果
          console.log('检查加载结果...');
          const loadedShapes = editor.getCurrentPageShapes();
          console.log('加载后的形状数量:', loadedShapes.length);
          
          const imageShapes = loadedShapes.filter(shape => shape.type === 'image');
          console.log('加载后的图片形状数量:', imageShapes.length);
          
          if (imageShapes.length === 0 && saveData.imageInfo && saveData.imageInfo.length > 0) {
            console.log('图片没有加载成功，尝试手动重新创建...');
            // 这里可以添加手动重新创建图片的逻辑
          }
          
          // 4. 更新localStorage中的图片ID列表
          if (saveData.imageInfo) {
            const currentImageIds = saveData.imageInfo.map(img => img.shapeId);
            localStorage.setItem('currentImageIds', JSON.stringify(currentImageIds));
            console.log('localStorage已更新，图片ID数量:', currentImageIds.length);
          }
          
          // 5. 加载完成，组件将自动重新渲染
          console.log('画布加载完成，组件将重新渲染');
          
          // 移除加载提示
          document.body.removeChild(loadingMessage);
          
          console.log('画布加载完成！');
          
        } catch (error) {
          console.error('解析保存文件时出错:', error);
          document.body.removeChild(loadingMessage);
          alert('加载失败：文件格式错误');
        }
      };
      
      reader.onerror = (error) => {
        console.error('读取文件失败:', error);
        document.body.removeChild(loadingMessage);
        alert('加载失败：无法读取文件');
      };
      
      reader.readAsText(file);
      
    } catch (error) {
      console.error('加载画布时出错:', error);
      if (document.body.contains(loadingMessage)) {
        document.body.removeChild(loadingMessage);
      }
      alert('加载失败，请重试');
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      console.log('选择的文件:', file.name);
      console.log('文件类型:', file.type);
      console.log('文件大小:', file.size);
      
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
        title="加载保存的画布"
        style={{
          fontSize: 14,
          padding: "8px 16px",
          border: "1px solid #ffc107",
          borderRadius: 6,
          background: "#ffc107",
          color: "white",
          cursor: "pointer",
          fontWeight: "bold"
        }}
      >
        加载画布
      </button>
    </>
  );
}

function CreateFrameButton({ editor, selectedFrame }) {
  const createFrame = () => {
    if (!editor) return;

    try {
      // 表格参数
      const cellWidth = 300; // 增大50%: 200 * 1.5 = 300
      const headerHeight = 60; // 增大50%: 40 * 1.5 = 60
      const rowHeight = 180; // 增大50%: 120 * 1.5 = 180
      const cols = 8; // Timeline, 测试/活动/上新, 词包, 第一帧, 第二帧, 第三帧, 第四帧, 第五帧
      const rows = 4; // 4行数据

      // 画布中心坐标
      const vp = editor.getViewportScreenBounds();
      const screenCenter = { x: vp.x + vp.width / 2, y: vp.y + vp.height / 2 };
      const pageCenter = editor.screenToPage(screenCenter);

      // 计算表格起始位置（居中）
      const totalWidth = cols * cellWidth;
      const totalHeight = headerHeight + rows * rowHeight;
      const startX = pageCenter.x - totalWidth / 2;
      const startY = pageCenter.y - totalHeight / 2;

      // 主框架已移除，直接创建表格内容

      // 列标题
      const columnTitles = ['Timeline', '测试/活动/上新', '词包', '第一帧', '第二帧', '第三帧', '第四帧', '第五帧'];
      
      // 创建列标题
      columnTitles.forEach((title, colIndex) => {
        const titleId = `shape:${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
        const titleX = startX + colIndex * cellWidth + 15;
        const titleY = startY + 15;
        
        editor.createShape({
          id: titleId,
          type: 'text',
          x: titleX,
          y: titleY,
          props: {
            richText: toRichText(title),
            w: cellWidth - 30,
            size: 's',
            color: 'black'
          }
        });
      });

      // 行数据
      const rowData = [
        {
          timeline: '8.30-9.7',
          activity: '日常机制',
          wordpack: '纯品牌词包+年份词包',
          frames: ['经典雪莉桶18年', '年度新品', '醇厚丰富', '时光淬炼', '限量珍藏']
        },
        {
          timeline: '9.8-9.15',
          activity: '新品发布',
          wordpack: '新品词包+活动词包',
          frames: ['新品发布', '限时优惠', '品质保证', '独特风味', '收藏价值']
        },
        {
          timeline: '9.16-9.23',
          activity: '品牌推广',
          wordpack: '品牌词包+推广词包',
          frames: ['品牌故事', '工艺传承', '品质生活', '高端享受', '品味人生']
        },
        {
          timeline: '9.24-9.30',
          activity: '节日营销',
          wordpack: '节日词包+礼品词包',
          frames: ['节日礼品', '送礼首选', '高端礼品', '品质之选', '尊贵体验']
        }
      ];

      // 创建表格内容
      rowData.forEach((row, rowIndex) => {
        const rowY = startY + headerHeight + rowIndex * rowHeight;
        
        // Timeline
        const timelineId = `shape:${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
        editor.createShape({
          id: timelineId,
          type: 'text',
          x: startX + 15,
          y: rowY + 15,
          props: {
            richText: toRichText(row.timeline),
            w: cellWidth - 30,
            size: 's',
            color: 'blue'
          }
        });

        // 活动
        const activityId = `shape:${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
                 editor.createShape({
           id: activityId,
           type: 'text',
           x: startX + cellWidth + 15,
           y: rowY + 15,
           props: {
             richText: toRichText(row.activity),
             w: cellWidth - 30,
             size: 's',
             color: 'green'
           }
         });

                 // 词包
         const wordpackId = `shape:${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
         editor.createShape({
           id: wordpackId,
           type: 'text',
           x: startX + 2 * cellWidth + 15,
           y: rowY + 15,
           props: {
             richText: toRichText(row.wordpack),
             w: cellWidth - 30,
             size: 's',
             color: 'violet'
           }
         });

        // 创建5个帧
        row.frames.forEach((frameText, frameIndex) => {
          const frameId = `shape:${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
          const frameX = startX + (3 + frameIndex) * cellWidth + 15;
          const frameY = rowY + 15;
          
                     // 创建帧框架（使用frame类型，符合Tldraw v3语法）
           const frameFrameId = `shape:${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
           editor.createShape({
             id: frameFrameId,
             type: 'frame',
             x: frameX,
             y: frameY,
             props: {
               w: cellWidth - 15,
               h: rowHeight - 15,
               name: ''
             }
           });

           // 创建frame后，设置颜色为绿色
           setTimeout(() => {
             try {
               editor.updateShapes([{
                 id: frameFrameId,
                 type: 'frame',
                 props: {
                   color: 'green', // 恢复绿色边框
                   name: ''
                 }
               }]);
               
               
                            } catch (error) {
                 console.warn('设置小frame颜色时出错:', error);
               }
               
               // 强制隐藏frame文字 - JavaScript方式
               setTimeout(() => {
                 const frameElement = document.querySelector(`[data-shape-id="${frameFrameId}"]`);
                 if (frameElement) {
                   // 查找并隐藏所有包含"frame"文字的元素
                   const labelElements = frameElement.querySelectorAll('.tl-frame-label, .tl-frame-heading, .tl-frame-heading-hit-area');
                   labelElements.forEach(el => {
                     el.style.display = 'none';
                     el.style.visibility = 'hidden';
                     el.style.opacity = '0';
                     el.style.height = '0';
                     el.style.width = '0';
                     el.style.overflow = 'hidden';
                   });
                 }
               }, 100);
               
             }, 50);

          // 帧内文本（底部居中，小字体）
          editor.createShape({
            id: frameId,
            type: 'text',
            x: frameX + 60,
            y: frameY + rowHeight - 50, // 底部位置（调整边距）
            props: {
              richText: toRichText(frameText),
              w: cellWidth - 45,
              size: 's', // 已经是小字体
              color: 'black'
            }
          });
        });
      });

      // 主框架已移除，不再需要选中
          } catch (e) {
        console.error('创建表格失败：', e);
      }
  };

  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      <button
        onClick={createFrame}
        title="创建包含文字和图片的框架"
        style={{
          fontSize: 14,
          padding: "8px 16px",
          border: "1px solid #28a745",
          borderRadius: 6,
          background: "#28a745",
          color: "white",
          cursor: "pointer",
          fontWeight: "bold"
        }}
      >
        创建内容框架
      </button>
    </div>
  );
}

export default function MinimalTldrawInsert() {
  const store = useMemo(() => createTLStore({ shapeUtils: [...defaultShapeUtils] }), []);
  const editorRef = useRef(null);
  const [editorReady, setEditorReady] = useState(false);
  const [selectedFrame, setSelectedFrame] = useState(null);
  const [forceRerender, setForceRerender] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  
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




  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
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
              console.error('检查选中形状时出错:', error);
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
      
      {/* 按钮放在画布中间上方 - 只有editor准备好时才显示 */}
      {editorReady && (
        <div style={{
          position: 'absolute',
          top: 10,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'white',
          border: '1px solid #ddd',
          borderRadius: 8,
          padding: '8px',
          boxShadow: '0 1px 4px rgba(0,0,0,.1)',
          pointerEvents: 'auto',
          flexWrap: 'wrap',
          maxWidth: '90vw'
        }}>
          <InsertImageButton editor={editorRef.current} selectedFrame={selectedFrame} />
          <SaveCanvasButton editor={editorRef.current} />
          <LoadCanvasButton editor={editorRef.current} setIsLoading={setIsLoading} />
          <CreateFrameButton editor={editorRef.current} selectedFrame={selectedFrame} />
        </div>
      )}
    </div>
  );
}
