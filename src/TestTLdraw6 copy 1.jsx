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

// SKU同步功能：根据SKU代码同步相同产品的图片到所有相关frame
function syncImagesBySKU(editor, targetFrame, assetId, scaledWidth, scaledHeight, initialX, initialY) {
  try {
    console.log('开始SKU同步功能...');
    
    // 1. 获取目标frame下方的SKU文字
    const targetSKU = getSKUFromFrame(editor, targetFrame);
    if (!targetSKU) {
      console.log('未找到目标frame的SKU，跳过同步');
      return;
    }
    
    console.log('检测到SKU:', targetSKU);
    
    // 2. 扫描画布上所有frame，找到相同SKU的frame
    const allFrames = editor.getCurrentPageShapes().filter(shape => shape.type === 'frame');
    const sameSKUFrames = [];
    
    for (const frame of allFrames) {
      const frameSKU = getSKUFromFrame(editor, frame);
      if (frameSKU === targetSKU && frame.id !== targetFrame.id) {
        sameSKUFrames.push(frame);
      }
    }
    
    console.log('找到相同SKU的frame数量:', sameSKUFrames.length);
    
    // 3. 为每个相同SKU的frame创建相同的图片
    for (const frame of sameSKUFrames) {
      try {
        // 计算frame中的图片位置（使用相同的逻辑）
        const fw = frame.props.w, fh = frame.props.h;
        const scale = Math.min(fw / (scaledWidth / 0.9), fh / (scaledHeight / 0.9)) * 0.9;
        const fitW = Math.max(1, (scaledWidth / 0.9) * scale);
        const fitH = Math.max(1, (scaledHeight / 0.9) * scale);
        
        const frameX = frame.x + (fw - fitW) / 2;
        const frameY = frame.y + (fh - fitH) * 0.25;
        
        // 创建新的图片形状（使用相同的assetId）
        const newImageShape = {
          type: "image",
          x: frameX,
          y: frameY,
          props: {
            w: fitW,
            h: fitH,
            assetId: assetId
          }
        };
        
        // 使用Tldraw v3语法创建图片
        const newShapeId = editor.createShape(newImageShape);
        
        if (newShapeId) {
          console.log('成功同步图片到frame:', frame.id, 'SKU:', targetSKU);
        }
        
      } catch (error) {
        console.warn('同步图片到frame时出错:', frame.id, error);
      }
    }
    
    console.log('SKU同步功能完成');
    
  } catch (error) {
    console.error('SKU同步功能出错:', error);
  }
}

// 获取frame下方的SKU文字
function getSKUFromFrame(editor, frame) {
  try {
    // 使用frame的坐标和尺寸计算边界
    const frameX = frame.x;
    const frameY = frame.y;
    const frameW = frame.props.w;
    const frameH = frame.props.h;
    const frameBottom = frameY + frameH;
    
    // 获取所有文字形状
    const allShapes = editor.getCurrentPageShapes();
    const textShapes = allShapes.filter(shape => shape.type === 'text');
    
    // 找到frame下方最近的文字（SKU）
    let closestText = null;
    let minDistance = Infinity;
    
    for (const textShape of textShapes) {
      const textX = textShape.x;
      const textY = textShape.y;
      const textW = textShape.props.w;
      const textH = textShape.props.h;
      const textTop = textY;
      
      // 检查文字是否在frame下方且水平位置相近
      if (textTop > frameBottom && 
          textX >= frameX - 50 && 
          textX <= frameX + frameW + 50) {
        const distance = textTop - frameBottom;
        if (distance < minDistance && distance < 100) { // 限制在100px范围内
          minDistance = distance;
          closestText = textShape;
        }
      }
    }
    
    if (closestText) {
      // 提取SKU代码（假设SKU是文字的最后部分）
      const textContent = closestText.props.richText || '';
      let textString = '';
      
      // 处理Tldraw v3的richText格式
      if (typeof textContent === 'string') {
        textString = textContent;
      } else if (Array.isArray(textContent)) {
        textString = textContent.map(item => item.text || '').join('');
      } else if (textContent && typeof textContent === 'object') {
        // 如果是对象，尝试提取text属性
        textString = textContent.text || JSON.stringify(textContent);
      } else {
        textString = String(textContent);
      }
      
      // 提取SKU（匹配类似S012、DC15、Art B等格式）
      const skuMatch = textString.match(/([A-Z]{1,3}\d{2,3}|[A-Za-z]{2,4}\s+[A-Z])/);
      return skuMatch ? skuMatch[1] : null;
    }
    
    return null;
  } catch (error) {
    console.warn('获取SKU时出错:', error);
    return null;
  }
}



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
        // 计算缩放比例，使图片完全贴合frame，然后缩小到90%留白
        const scale = Math.min(fw / baseW, fh / baseH) * 0.9
        const fitW = Math.max(1, baseW * scale)
        const fitH = Math.max(1, baseH * scale)
        // 更新缩放后的尺寸
        scaledWidth = fitW
        scaledHeight = fitH
        // 计算位置 - 水平居中，垂直偏上
        initialX = targetFrame.x + (fw - fitW) / 2
        initialY = targetFrame.y + (fh - fitH) * 0.25  // 从25%位置开始，稍微往下一点点
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
              
              // SKU同步功能：如果插入到frame中，同步相同SKU的所有frame
              if (targetFrame) {
                try {
                  syncImagesBySKU(editor, targetFrame, assetId, scaledWidth, scaledHeight, initialX, initialY);
                } catch (error) {
                  console.warn('SKU同步功能出错:', error);
                }
              }
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
              try {
                editor.deleteShapes(shapeIds);
                console.log('已删除所有现有形状');
              } catch (deleteError) {
                console.warn('批量删除形状时出错:', deleteError);
                // 备用方案：逐个删除
                for (const shapeId of shapeIds) {
                  try {
                    editor.deleteShapes([shapeId]);
                  } catch (singleDeleteError) {
                    console.warn('删除单个形状失败:', shapeId, singleDeleteError);
                  }
                }
              }
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
        </div>
      )}
    </div>
  );
}
