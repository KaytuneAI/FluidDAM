import React, { useRef, useState } from "react";
import { checkExistingAsset, saveImageInfo } from '../utils/assetUtils.js';
import { placeAssetIntoSelectedFrame } from '../utils/assetUtils.js';
import { syncImagesBySKU } from '../utils/skuUtils.js';

export default function InsertImageButton({ editor, selectedFrame }) {
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
    const existingAssetId = await checkExistingAsset(editor, file);
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
           width: 40,
           height: 40,
           display: "flex",
           alignItems: "center",
           justifyContent: "center"
         }}
        >
          <img src="/src/load_image.png" alt="插入图片" style={{width: 32, height: 32}} />
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
