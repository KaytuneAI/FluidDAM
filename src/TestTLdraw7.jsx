import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { Tldraw, createTLStore, defaultShapeUtils, toRichText, loadSnapshot, getSnapshot } from "tldraw";
import { initAllFontOverrides } from "./utils/fontOverride";

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
    // 1. 获取目标frame下方的SKU文字
    const targetSKU = getSKUFromFrame(editor, targetFrame);
    if (!targetSKU) {
      return;
    }
    
    // 2. 扫描画布上所有frame，找到相同SKU的frame
    const allFrames = editor.getCurrentPageShapes().filter(shape => shape.type === 'frame');
    const sameSKUFrames = [];
    
    for (const frame of allFrames) {
      const frameSKU = getSKUFromFrame(editor, frame);
      if (frameSKU === targetSKU && frame.id !== targetFrame.id) {
        sameSKUFrames.push(frame);
      }
    }
    
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
        
        // 图片同步成功
      } catch (error) {
        // 同步图片时出错，静默处理
      }
    }
    
  } catch (error) {
    // SKU同步功能出错，静默处理
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
        // 更新localStorage中的图片ID列表
        const currentImageIds = JSON.parse(localStorage.getItem('currentImageIds') || '[]');
        currentImageIds.push(shapeId);
        localStorage.setItem('currentImageIds', JSON.stringify(currentImageIds));
      } else {
        // 如果API失败，回退到localStorage
        const savedData = localStorage.getItem('imagesDatabase') || '{"images":[],"lastUpdated":"","totalImages":0}';
        const database = JSON.parse(savedData);
        database.images.push(imageInfo);
        database.lastUpdated = new Date().toISOString();
        database.totalImages = database.images.length;
        localStorage.setItem('imagesDatabase', JSON.stringify(database));
      }
      
    } catch (error) {
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
      } catch (localStorageError) {
        // localStorage保存失败，静默处理
      }
    }
  };

  // 检查图片是否已存在于素材库中
  const checkExistingAsset = async (file) => {
    if (!editor) return null;
    
    try {
      // 将文件转换为dataUrl进行比较
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      
      // 获取当前所有素材
      const assets = editor.getAssets();
      
      // 比较每个素材的src是否与当前文件相同
      for (const [assetId, asset] of Object.entries(assets)) {
        if (asset?.type === 'image' && asset?.props?.src === dataUrl) {
          // 返回素材的实际ID，而不是数组索引
          const actualAssetId = asset.id || assetId;
          return actualAssetId;
        }
      }
      
      // 如果上面没找到，尝试从store中查找
      const store = editor.store;
      const assetRecords = store.allRecords().filter(record => record.typeName === 'asset');
      for (const record of assetRecords) {
        if (record.type === 'image' && record.props?.src === dataUrl) {
          // 直接返回原始的record.id
          return record.id;
        }
      }
      
      return null;
    } catch (error) {
      return null;
    }
  };


  const insertImage = async (file) => {
    if (!editor) {
      return;
    }

    if (!file) {
      return;
    }

    // 检查是否有选中的frame - 只使用用户明确选择的frame
    let targetFrame = selectedFrame;

    // 先检查是否已存在相同的素材
    const existingAssetId = await checkExistingAsset(file);
    if (existingAssetId) {
      // 直接使用现有的放置函数，与右侧素材栏按钮使用相同的方式
      placeAssetIntoSelectedFrame(editor, existingAssetId, "TM");
      return;
    }
    
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
          
          // 根据官方文档，不需要手动创建资产
          // Tldraw会在创建图片形状时自动处理资产
          console.log('准备创建图片形状，让Tldraw自动处理资产');

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
        // fit-to-frame失败，使用默认位置
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

          // 根据官方文档，使用正确的方式创建图片
          try {
            console.log('开始创建资产，dataUrl长度:', dataUrl.length);
            console.log('editor可用方法:', Object.keys(editor).filter(k => k.includes('Asset') || k.includes('asset') || k.includes('create')));
            
            // 检查editor是否有createAsset方法
            if (typeof editor.createAsset !== 'function') {
              console.log('editor.createAsset 不存在，尝试其他方法');
              
              // 尝试使用store.put创建资产
              const assetId = `asset:${(globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2))}`;
              
              editor.store.put([
                {
                  id: assetId,
                  type: "image",
                  typeName: "asset",
                  meta: {},
                  props: {
                    w: naturalW,
                    h: naturalH,
                    src: dataUrl,
                    name: file.name,
                    mimeType: getMimeTypeFromFile(file),
                    isAnimated: false
                  }
                }
              ]);
              
              console.log('使用store.put创建资产成功:', assetId);
              
              // 创建图片形状
              const shapeId = editor.createShape({
            type: "image",
            x: initialX,
            y: initialY,
            props: {
              w: scaledWidth,
              h: scaledHeight,
              assetId: assetId
            }
              });
              
              console.log('图片形状创建成功:', shapeId);
              return;
            }
            
            // 使用editor.createAsset创建资产
            const asset = editor.createAsset({
              type: 'image',
              props: {
                w: naturalW,
                h: naturalH,
                src: dataUrl,
                name: file.name,
                mimeType: getMimeTypeFromFile(file)
              }
            });
            
            console.log('资产创建成功:', asset);
            
            // 验证资产是否真的被创建
            setTimeout(() => {
              const snap = getSnapshot(editor.store);
              const allAssets = Object.values(snap.assets || {});
              const createdAsset = allAssets.find(a => a.id === asset.id);
              console.log('验证资产创建:', createdAsset ? '成功' : '失败', createdAsset);
              console.log('当前所有资产数量:', allAssets.length);
            }, 100);
            
            // 然后创建图片形状，使用asset.id
            const shapeId = editor.createShape({
            type: "image",
            x: initialX,
            y: initialY,
            props: {
              w: scaledWidth,
              h: scaledHeight,
                assetId: asset.id
            }
            });
          
            console.log('图片形状创建成功:', shapeId);
            
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
                  // 更新图片位置时出错，静默处理
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
                  // 更新图片尺寸时出错，静默处理
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
                // 选择形状时出错，静默处理
              }
              
              // 保存图片信息到JSON文件 - 确保shapeId是字符串且格式正确
              let shapeIdString = typeof shapeId === 'string' ? shapeId : shapeId?.id || shapeId?.toString() || 'unknown';
              if (!shapeIdString.startsWith('shape:')) {
                shapeIdString = 'shape:' + shapeIdString;
              }
              saveImageInfo(file, asset.id, shapeIdString, dataUrl, naturalW, naturalH);
              
              // SKU同步功能：如果插入到frame中，同步相同SKU的所有frame
              if (targetFrame) {
                try {
                  syncImagesBySKU(editor, targetFrame, asset.id, scaledWidth, scaledHeight, initialX, initialY);
                } catch (error) {
                  // SKU同步功能出错，静默处理
                }
              }
            }
          } catch (shapeError) {
            console.error('创建图片时发生错误:', shapeError);
          }
        };
        
        img.onerror = (error) => {
          // 图片加载失败，静默处理
        };
        
        img.src = dataUrl;
      };
      
      reader.onerror = () => {
        // 文件读取失败，静默处理
      };
      
      // 开始读取文件
      reader.readAsDataURL(file);
      
    } catch (error) {
      // 插入图片时出错，静默处理
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
         title="插入图片"
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
          <img src="/src/load_image.png" alt="插入图片" style={{width: 40, height: 40}} />
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
      return;
    }

    try {
      
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
            // 无法从API获取文件名，使用默认名称
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
          
        } catch (error) {
          // 处理图片信息失败，静默处理
        }
      }
      
      // 导出画布状态（包含完整的图片数据）
      const canvasData = getSnapshot(editor.store);
      
      // 获取当前页面ID
      const currentPageId = editor.getCurrentPageId();
      console.log('保存时的当前页面ID:', currentPageId);
      
      // 创建保存文件的内容
      const saveData = {
        version: '1.0',
        savedAt: new Date().toISOString(),
        canvasData: canvasData,
        currentPageId: currentPageId, // 保存当前页面ID
        imageInfo: imageInfo,
        totalImages: imageInfo.length
      };
      
      
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
      
    } catch (error) {
      alert('保存失败，请重试');
    }
  };

  return (
      <button
        onClick={saveCanvas}
       title="保存画布"
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
        <img src="/src/save_canvas.png" alt="保存画布" style={{width: 40, height: 40}} />
      </button>
  );
}



function LoadCanvasButton({ editor, setIsLoading }) {
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

  // 字体覆盖 - 强制使用正式字体
  useEffect(() => {
    const cleanup = initAllFontOverrides();
    return cleanup;
  }, []);

  // 动态注入CSS确保字体覆盖
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      /* 强制覆盖所有字体 */
      *, *::before, *::after {
        font-family: Arial, Helvetica, "Microsoft YaHei", "微软雅黑", "PingFang SC", "Hiragino Sans GB", "WenQuanYi Micro Hei", sans-serif !important;
        font-style: normal !important;
        font-weight: normal !important;
        font-size: 12px !important;
      }
      
      /* 特别针对Tldraw */
      .tl-text, .tl-text *, .tl-rich-text, .tl-rich-text *, .tl-text-content, .tl-text-content *,
      .tl-text-editor, .tl-text-editor *, .tl-text-input, .tl-text-input *,
      .tl-shape, .tl-shape *, [data-shape-type] *, [class*="tl-"] * {
        font-family: Arial, Helvetica, "Microsoft YaHei", "微软雅黑", "PingFang SC", "Hiragino Sans GB", "WenQuanYi Micro Hei", sans-serif !important;
        font-style: normal !important;
        font-weight: normal !important;
        font-size: 12px !important;
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);




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


/* ========================= MVP Asset Sidebar & Linking (v7) =========================
   This block adds:
   - <AssetSidebarMVP />: shows current-canvas image assets as thumbnails with a button to place into the selected frame
   - placeAssetIntoSelectedFrame(editor, assetId, platform): insert image + SKU Text + DisplayText under it, grouped
   - useLinkedTextsListener(): updates linked texts when an image's assetId changes
   Usage:
   - Mount <AssetSidebarMVP /> somewhere next to your <Tldraw store={store} />
     e.g. <div className="right-panel"><AssetSidebarMVP platform={platform} /></div>
   - Keep a "platform" state in parent: 'TM' | 'JD'
   Notes:
   - Requires TLDraw v3 (editor/store APIs). Some API names may need minor adjustments depending on your exact version.
   - All operations are wrapped with editor.batch() for proper undo/redo.
====================================================================================== */

import { useEditor } from "@tldraw/editor";

// 添加高亮样式
const highlightStyle = document.createElement('style');
highlightStyle.textContent = `
  .asset-highlight::before {
    content: '';
    position: absolute;
    top: -6px;
    left: -6px;
    right: -6px;
    bottom: -6px;
    border: 3px solid #ff0000;
    border-radius: 6px;
    pointer-events: none;
    z-index: 1000;
    animation: pulse 1s ease-in-out infinite alternate;
  }
  
  @keyframes pulse {
    0% { opacity: 0.6; transform: scale(1); }
    100% { opacity: 1; transform: scale(1.05); }
  }
`;
document.head.appendChild(highlightStyle);

// ---- Resizable Sidebar Component ----
function ResizableSidebar({ children, width, onWidthChange }) {
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startWidth, setStartWidth] = useState(0);

  const handleMouseDown = (e) => {
    setIsDragging(true);
    setStartX(e.clientX);
    setStartWidth(width);
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      
      const deltaX = startX - e.clientX; // 向左拖拽增加宽度
      const newWidth = Math.max(200, Math.min(600, startWidth + deltaX));
      onWidthChange(newWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, startX, startWidth, onWidthChange]);

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ width: width, height: '100%', position: 'relative' }}>
        {children}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: 4,
            height: '100%',
            background: isDragging ? '#007bff' : '#e5e7eb',
            cursor: 'col-resize',
            zIndex: 10,
            transition: isDragging ? 'none' : 'background 0.2s'
          }}
          onMouseDown={handleMouseDown}
        />
      </div>
    </div>
  );
}

// ---- Minimal styles for the sidebar ----
const sidebarStyles = {
  container: {
    height: "100%",
    overflow: "auto",
    fontFamily: "Arial, Helvetica, Microsoft YaHei, 微软雅黑, PingFang SC, Hiragino Sans GB, WenQuanYi Micro Hei, sans-serif"
  },
  header: { padding: "10px 12px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center"},
  list: { padding: 12, display: "grid", gridTemplateColumns: "1fr", gap: 8 },
  card: (used) => ({
    border: used ? "2px solid #3b82f6" : "1px solid #e5e7eb",
    borderRadius: 10,
    padding: 8,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    alignItems: "flex-start",
    background: used ? "#f0f7ff" : "#fff"
  }),
  thumbWrap: { width: "100%", minHeight: 40, maxHeight: 120, overflow: "hidden", borderRadius: 2, background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center" },
  thumb: { width: "100%", height: "auto", objectFit: "contain" },
  name: { fontSize: 12, color: "#111827", textAlign: "left", wordBreak: "break-word" },
  btn: { display: "inline-block", fontSize: 12, padding: "6px 10px", borderRadius: 2, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" },
  plat: { display: "inline-flex", gap: 6 }
};

// ---- Hook: update linked texts when an image's assetId changes ----
function useLinkedTextsListener(platform = "TM") {
  const editor = useEditor();
  useEffect(() => {
    const off = editor.store.listen((rec, prev) => {
      if (!rec || rec.typeName !== "shape") return;
      if (rec.type !== "image") return;
      const prevAssetId = prev?.props?.assetId;
      const currAssetId = rec?.props?.assetId;
      if (!currAssetId || prevAssetId === currAssetId) return;
      const linked = rec?.props?.linkedTexts;
      if (!Array.isArray(linked) || linked.length === 0) return;
      const asset = editor.getAsset(currAssetId);
      if (!asset) return;
      const sku = asset?.meta?.sku ?? "";
      const displayText = asset?.meta?.displayText?.[platform] ?? "";
      editor.batch(() => {
        linked.forEach((tid) => {
          const t = editor.getShape(tid);
          if (!t) return;
          const role = t?.props?.role;
          if (role === "sku") {
            editor.updateShape({ id: t.id, type: "text", props: { ...t.props, text: sku } });
          } else if (role === "display") {
            const ds = t?.props?.dataSource;
            if (ds === "override") return;
            editor.updateShape({ id: t.id, type: "text", props: { ...t.props, text: displayText, dataSource: "index" } });
          }
        });
      });
    }, { scope: "document" });
    return () => off();
  }, [editor, platform]);
}

// ---- Helper: 健壮的获取Frame边界方法 ----
function getFrameBounds(editor, frame) {
  try {
    // 依次尝试不同的方法
    if (typeof editor.getShapePageBounds === 'function') {
      return editor.getShapePageBounds(frame.id);
    }
    if (typeof editor.getPageBounds === 'function') {
      return editor.getPageBounds(frame.id);
    }
    if (typeof editor.getBounds === 'function') {
      return editor.getBounds(frame.id);
    }
  } catch (error) {
    // 如果所有方法都失败，回退到手动计算
  }
  
  // 回退方案：使用shape自带的属性计算边界
  return {
    minX: frame.x,
    minY: frame.y,
    maxX: frame.x + frame.props.w,
    maxY: frame.y + frame.props.h,
    width: frame.props.w,
    height: frame.props.h
  };
}

// ---- Helper: center-fit into frame (contain) ----
function fitContain(imgW, imgH, frameW, frameH, padding=0) {
  // 参考插入图片的逻辑：90%缩放 + 垂直偏上定位
  const scale = Math.min(frameW / imgW, frameH / imgH) * 0.9;
  const w = Math.max(1, Math.round(imgW * scale));
  const h = Math.max(1, Math.round(imgH * scale));
  const ox = Math.round((frameW - w) / 2);  // 水平居中
  const oy = Math.round((frameH - h) * 0.25);  // 垂直偏上（从25%位置开始）
  return { w, h, ox, oy };
}

// ---- Helper: place asset into selected frame (image + texts + group) ----
function placeAssetIntoSelectedFrame(editor, assetId, platform="TM") {
  try {
    const selIds = editor.getSelectedShapeIds ? editor.getSelectedShapeIds() : [];
    let targetFrame = null;
    if (selIds && selIds.length) {
      for (const id of selIds) {
        const s = editor.getShape(id);
        if (s && s.type === "frame") { targetFrame = s; break; }
      }
    }
    if (!targetFrame) {
      alert("请先选中一个 Frame 再放置素材");
      return;
    }

    // 获取素材信息 - 使用多种方法尝试
    let asset = null;
    
    // 方法1: 尝试 editor.getAsset
    if (typeof editor.getAsset === 'function') {
      asset = editor.getAsset(assetId);
    }
    
    // 方法2: 如果方法1失败，从所有素材中查找
    if (!asset) {
      const allAssets = editor.getAssets();
      // 尝试多种ID格式
      asset = allAssets[assetId] || 
              allAssets[assetId.replace('asset:', '')] || 
              Object.values(allAssets).find(a => a?.id === assetId || a?.id === assetId.replace('asset:', ''));
    }
    
    // 方法3: 如果还是找不到，从store中获取
    if (!asset) {
      const store = editor.store;
      const assetRecord = store.get(assetId) || store.get(assetId.replace('asset:', ''));
      if (assetRecord && assetRecord.typeName === 'asset') {
        asset = assetRecord;
      }
    }
    
    if (!asset) { 
      return; 
    }

    const frameBounds = getFrameBounds(editor, targetFrame);
    if (!frameBounds) { return; }

    const imgW = asset?.props?.w ?? 512;
    const imgH = asset?.props?.h ?? 512;

    const { w, h, ox, oy } = fitContain(imgW, imgH, frameBounds.width, frameBounds.height, 0);
    const x = frameBounds.minX + ox;
    const y = frameBounds.minY + oy;

    const sku = asset?.meta?.sku ?? "";
    const displayText = asset?.meta?.displayText?.[platform] ?? "";

    const fontSize = 14;
    const lineGap = 6;

    // 根据官方文档，只创建图片形状，暂时不创建文本
    // 确保assetId有正确的前缀
    const normalizedAssetId = assetId.startsWith('asset:') ? assetId : `asset:${assetId}`;
    editor.createShape({ type: "image", x, y, props: { w, h, assetId: normalizedAssetId } });
  } catch (e) {
    // 静默处理错误
  }
}

// 删除了被破坏的函数定义和孤立的代码

// ---- Hook: compute which assets are currently used on canvas (by image shapes) ----
function useUsedAssetIds() {
  const editor = useEditor();
  const [ids, setIds] = useState(new Set());
  useEffect(() => {
    const recompute = () => {
      const imgs = editor.getCurrentPageShapes().filter(s => s.type === "image");
      const setA = new Set(imgs.map(s => s?.props?.assetId).filter(Boolean));
      setIds(setA);
    };
    recompute();
    const off = editor.store.listen((_rec, _prev) => { recompute(); }, { scope: "document" });
    return () => off();
  }, [editor]);
  return ids;
}

// ---- 集成素材栏组件 (包含操作按钮和素材预览) ----
function IntegratedAssetSidebar({ editor, selectedFrame, setIsLoading, platform = "TM", width }) {
  const [usedAssetIds, setUsedAssetIds] = useState(new Set());
  const [assets, setAssets] = useState([]);
  const [forceUpdate, setForceUpdate] = useState(0);

  // 更新已使用的资产ID
  const updateUsedAssetIds = useCallback(() => {
    if (!editor) return;
    try {
      const imgs = editor.getCurrentPageShapes().filter(s => s.type === "image");
      const setA = new Set(imgs.map(s => s?.props?.assetId).filter(Boolean));
      setUsedAssetIds(setA);
    } catch (error) {
      // 静默处理错误
    }
  }, [editor]);

  // 高亮画布中的素材
  const highlightAssetOnCanvas = useCallback((assetId) => {
    if (!editor) return;
    
    try {
      // 查找画布中所有使用该素材的图片形状
      const shapes = editor.getCurrentPageShapes();
      const targetShapes = shapes.filter(shape => 
        shape.type === "image" && shape.props.assetId === assetId
      );
      
      if (targetShapes.length > 0) {
        // 先清除之前的高亮效果
        document.querySelectorAll('.asset-highlight').forEach(el => {
          el.classList.remove('asset-highlight');
        });
        
        // 使用临时高亮效果，不移动视图，不改变选中状态
        targetShapes.forEach(shape => {
          // 尝试多种选择器来找到元素
          const selectors = [
            `[data-shape-id="${shape.id}"]`,
            `[data-tl-shape-id="${shape.id}"]`,
            `[data-id="${shape.id}"]`,
            `#shape-${shape.id}`
          ];
          
          let element = null;
          for (const selector of selectors) {
            element = document.querySelector(selector);
            if (element) break;
          }
          
          if (element) {
            // 添加高亮类名
            element.classList.add('asset-highlight');
            
            // 3秒后移除高亮效果
            setTimeout(() => {
              if (element) {
                element.classList.remove('asset-highlight');
              }
            }, 3000);
          }
        });
        
        // 已高亮显示素材
      }
    } catch (error) {
      // 静默处理错误
    }
  }, [editor]);

  // 更新资产列表 - 从当前页面的image形状反查资产
  const updateAssets = useCallback(() => {
    if (!editor) return;
    try {
      // 1. 获取当前页面的所有image形状
      const currentShapes = editor.getCurrentPageShapes();
      const imageShapes = currentShapes.filter(shape => shape.type === 'image');
      
      // 2. 从image形状中提取assetId，然后获取对应的资产
      const assets = [];
      const seenAssetIds = new Set();
      
      for (const imageShape of imageShapes) {
        const assetId = imageShape.props?.assetId;
        if (assetId && !seenAssetIds.has(assetId)) {
          try {
            const asset = editor.getAsset(assetId);
            if (asset && asset.type === 'image') {
              assets.push(asset);
              seenAssetIds.add(assetId);
            }
          } catch (error) {
            // 资产不存在，跳过
          }
        }
      }
      
      console.log('更新资产列表:', assets.length, '个图片资产');
      console.log('从', imageShapes.length, '个图片形状中提取');
      setAssets(assets);
    } catch (error) {
      console.error('更新资产列表时出错:', error);
    }
  }, [editor]);

  // 监听编辑器变化
  useEffect(() => {
    if (!editor) return;

    const updateAll = () => {
      updateUsedAssetIds();
      updateAssets();
    };

    // 初始更新
    updateAll();

    // 监听变化 - 监听形状和资产的变化
    const unsubscribe = editor.store.listen((record, prevRecord) => {
      // 监听形状变化（特别是图片形状）
      if (record && record.typeName === 'shape') {
        if (record.type === 'image') {
          console.log('检测到图片形状变化:', record.id);
          updateAll();
        }
      }
      // 监听资产变化
      if (record && record.typeName === 'asset') {
        console.log('检测到资产变化:', record.typeName, record.type, record.id);
        updateAll();
      }
    }, { scope: "document" });

    // 添加定期检查作为备用方案
    const interval = setInterval(updateAll, 2000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [editor, updateUsedAssetIds, updateAssets]);

  // 放置资产到选中的Frame
  const onPlace = useCallback((assetId) => {
    if (!editor) return;
    placeAssetIntoSelectedFrame(editor, assetId, platform);
  }, [editor, platform]);

  return (
    <div style={{
      ...sidebarStyles.container,
      width: width,
      borderLeft: `2px solid #007bff`
    }}>
      {/* 顶部操作按钮区域 */}
      <div style={{
        padding: "12px",
        borderBottom: "1px solid #e5e7eb",
        display: "flex",
        flexDirection: "column",
        gap: 8
      }}>
        <div style={{fontWeight: 600, fontSize: 14}}>素材管理</div>
        <div style={{display: 'flex', gap: 6}}>
          <InsertImageButton editor={editor} selectedFrame={selectedFrame} />
          <LoadCanvasButton editor={editor} setIsLoading={setIsLoading} />
          <SaveCanvasButton editor={editor} />
        </div>
      </div>


      {/* 素材预览区域 */}
      <div style={sidebarStyles.list}>
        {assets.map((a) => {
          const name = a?.props?.name || a?.props?.src?.split("/").slice(-1)[0] || a.id;
          const isUsed = usedAssetIds.has(a.id);
          return (
            <div key={a.id} style={sidebarStyles.card(isUsed)}>
              <div style={sidebarStyles.thumbWrap}>
                <img 
                  src={a?.props?.src} 
                  alt={name} 
                  style={{
                    ...sidebarStyles.thumb,
                    cursor: 'pointer'
                  }}
                  onClick={() => highlightAssetOnCanvas(a.id)}
                  title="点击高亮画布中的相同素材"
                />
              </div>
              <div>
                <div title={name} style={sidebarStyles.name}>{name}</div>
                <button style={sidebarStyles.btn} onClick={() => onPlace(a.id)}>放置到选中 Frame</button>
              </div>
            </div>
          );
        })}
        {assets.length === 0 && (
          <div style={{ color: "#6b7280", fontSize: 12, padding: "12px" }}>拖入图片或粘贴即可出现数字资产</div>
        )}
      </div>
    </div>
  );
}

// ---- 保留原版本用于其他地方 ----
function AssetSidebarContent({ editor, platform = "TM" }) {
  const [usedAssetIds, setUsedAssetIds] = useState(new Set());
  const [assets, setAssets] = useState([]);
  const [forceUpdate, setForceUpdate] = useState(0);

  // 更新已使用的资产ID
  const updateUsedAssetIds = useCallback(() => {
    if (!editor) return;
    try {
      const imgs = editor.getCurrentPageShapes().filter(s => s.type === "image");
      const setA = new Set(imgs.map(s => s?.props?.assetId).filter(Boolean));
      setUsedAssetIds(setA);
    } catch (error) {
      // 静默处理错误
    }
  }, [editor]);

  // 更新资产列表 - 从当前页面的image形状反查资产
  const updateAssets = useCallback(() => {
    if (!editor) return;
    try {
      // 1. 获取当前页面的所有image形状
      const currentShapes = editor.getCurrentPageShapes();
      const imageShapes = currentShapes.filter(shape => shape.type === 'image');
      
      // 2. 从image形状中提取assetId，然后获取对应的资产
      const assets = [];
      const seenAssetIds = new Set();
      
      for (const imageShape of imageShapes) {
        const assetId = imageShape.props?.assetId;
        if (assetId && !seenAssetIds.has(assetId)) {
          try {
            const asset = editor.getAsset(assetId);
            if (asset && asset.type === 'image') {
              assets.push(asset);
              seenAssetIds.add(assetId);
            }
          } catch (error) {
            // 资产不存在，跳过
          }
        }
      }
      
      console.log('更新资产列表:', assets.length, '个图片资产');
      console.log('从', imageShapes.length, '个图片形状中提取');
      setAssets(assets);
    } catch (error) {
      console.error('更新资产列表时出错:', error);
    }
  }, [editor]);

  // 监听编辑器变化
  useEffect(() => {
    if (!editor) return;

    const updateAll = () => {
      updateUsedAssetIds();
      updateAssets();
    };

    // 初始更新
    updateAll();

    // 监听变化 - 监听形状和资产的变化
    const unsubscribe = editor.store.listen((record, prevRecord) => {
      // 监听形状变化（特别是图片形状）
      if (record && record.typeName === 'shape') {
        if (record.type === 'image') {
          console.log('检测到图片形状变化:', record.id);
          updateAll();
        }
      }
      // 监听资产变化
      if (record && record.typeName === 'asset') {
        console.log('检测到资产变化:', record.typeName, record.type, record.id);
        updateAll();
      }
    }, { scope: "document" });

    // 添加定期检查作为备用方案
    const interval = setInterval(updateAll, 2000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [editor, updateUsedAssetIds, updateAssets]);

  // 放置资产到选中的Frame
  const onPlace = useCallback((assetId) => {
    if (!editor) return;
    placeAssetIntoSelectedFrame(editor, assetId, platform);
  }, [editor, platform]);

  return (
    <>
      <div style={sidebarStyles.header}>
        <div style={{fontWeight: 600}}>素材库（当前画布）</div>
        <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
          <button 
            onClick={() => {
              updateUsedAssetIds();
              updateAssets();
            }}
            style={{
              fontSize: 10,
              padding: '2px 6px',
              border: '1px solid #d1d5db',
              borderRadius: 4,
              background: '#fff',
              cursor: 'pointer'
            }}
            title="刷新素材列表"
          >
            刷新
          </button>
          <div style={sidebarStyles.plat}>
            <span style={{ fontSize: 12, color: "#6b7280" }}>平台:</span>
            <strong>{platform}</strong>
          </div>
        </div>
      </div>
      <div style={sidebarStyles.list}>
        {assets.map((a) => {
          const name = a?.props?.name || a?.props?.src?.split("/").slice(-1)[0] || a.id;
          const isUsed = usedAssetIds.has(a.id);
          return (
            <div key={a.id} style={sidebarStyles.card(isUsed)}>
              <div style={sidebarStyles.thumbWrap}>
                <img src={a?.props?.src} alt={name} style={sidebarStyles.thumb} />
              </div>
              <div>
                <div title={name} style={sidebarStyles.name}>{name}</div>
                <button style={sidebarStyles.btn} onClick={() => onPlace(a.id)}>放置到选中 Frame</button>
              </div>
            </div>
          );
        })}
        {assets.length === 0 && (
          <div style={{ color: "#6b7280", fontSize: 12 }}>本画布暂无图片素材，拖入图片或粘贴即可出现。</div>
        )}
      </div>
    </>
  );
}

// ---- Sidebar MVP (保留原版本用于其他地方) ----
export function AssetSidebarMVP({ platform="TM" }) {
  const editor = useEditor();
  useLinkedTextsListener(platform);
  const used = useUsedAssetIds();
  const assets = useMemo(() => {
    const snap = getSnapshot(editor.store);
    const all = Object.values(snap.assets || {});
    return all.filter(a => a?.type === "image");
  }, [editor]);
  const onPlace = useCallback((assetId) => { placeAssetIntoSelectedFrame(editor, assetId, platform); }, [editor, platform]);
  return (
    <div style={sidebarStyles.container}>
      <div style={sidebarStyles.header}>
        <div style={{fontWeight: 600}}>素材库（当前画布）</div>
        <div style={sidebarStyles.plat}>
          <span style={{ fontSize: 12, color: "#6b7280" }}>平台:</span>
          <strong>{platform}</strong>
        </div>
      </div>
      <div style={sidebarStyles.list}>
        {assets.map((a) => {
          const name = a?.props?.name || a?.props?.src?.split("/").slice(-1)[0] || a.id;
          const isUsed = used.has(a.id);
          return (
            <div key={a.id} style={sidebarStyles.card(isUsed)}>
              <div style={sidebarStyles.thumbWrap}>
                <img src={a?.props?.src} alt={name} style={sidebarStyles.thumb} />
              </div>
              <div>
                <div title={name} style={sidebarStyles.name}>{name}</div>
                <button style={sidebarStyles.btn} onClick={() => onPlace(a.id)}>放置到选中 Frame</button>
              </div>
            </div>
          );
        })}
        {assets.length === 0 && (
          <div style={{ color: "#6b7280", fontSize: 12 }}>本画布暂无图片素材，拖入图片或粘贴即可出现。</div>
        )}
      </div>
    </div>
  );
}

/* ========================= End of MVP block (v7) ========================= */

