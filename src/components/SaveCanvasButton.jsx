import React from "react";
import { getSnapshot } from "tldraw";
import { downloadJSON, showDownloadNotification } from '../utils/downloadUtils.js';
import { getImageData } from '../utils/apiUtils.js';
import { compressTo96DPI } from '../utils/dpiCompression.js';

export default function SaveCanvasButton({ editor }) {
  const saveCanvas = async () => {
    if (!editor) {
      return;
    }

    try {
      
      // 获取当前画布的所有形状
      const currentShapes = editor.getCurrentPageShapes();
      const imageShapes = currentShapes.filter(shape => shape.type === 'image');
      
      // 导出画布状态（包含完整的图片数据）
      let canvasData = getSnapshot(editor.store);
      
      // 在保存时压缩图片（Edge浏览器兼容性修复）
      if (canvasData && canvasData.store && canvasData.store.assets) {
        console.log('开始压缩保存文件中的图片...');
        const assets = canvasData.store.assets;
        let compressedCount = 0;
        
        // 遍历所有资产，压缩图片类型
        for (const [assetId, asset] of Object.entries(assets)) {
          if (asset && asset.typeName === 'asset' && asset.type === 'image' && asset.props && asset.props.src) {
            try {
              const src = asset.props.src;
              // 检查是否是base64格式的图片
              if (src.startsWith('data:image/')) {
                const [mimeTypePart, base64Data] = src.split(',');
                const mimeType = mimeTypePart.match(/data:image\/([^;]+)/)?.[1] || 'png';
                const fullMimeType = `image/${mimeType}`;
                
                // 压缩图片
                try {
                  const compressedBase64 = await compressTo96DPI(base64Data, fullMimeType, 96);
                  // 更新资产中的图片数据
                  asset.props.src = `data:image/${mimeType};base64,${compressedBase64}`;
                  compressedCount++;
                  console.log(`✅ 已压缩图片资产: ${assetId}`);
                } catch (compressionError) {
                  console.warn(`⚠️ 压缩图片资产 ${assetId} 失败:`, compressionError);
                  // 压缩失败时继续使用原始图片
                }
              }
            } catch (error) {
              console.warn(`处理图片资产 ${assetId} 时出错:`, error);
            }
          }
        }
        
        if (compressedCount > 0) {
          console.log(`✅ 保存时已压缩 ${compressedCount} 张图片（Edge浏览器兼容性优化）`);
        }
      }
      
      // 获取图片信息
      const imageInfo = [];
      for (const shape of imageShapes) {
        try {
          // 直接从shape中获取图片信息
          const assetId = shape.props.assetId;
          
          // 尝试从后端API或localStorage获取文件名
          let fileName = `image_${shape.id}`;
          try {
            const database = await getImageData();
            const imageData = database.images.find(img => img.id === shape.id);
            if (imageData) {
              fileName = imageData.fileName;
            }
          } catch {
            // 使用默认名称
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
      
      
      // 使用统一的下载工具
      const fileName = `canvas_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}`;
      
      // 定义成功和失败回调
      const onDownloadSuccess = (fileName) => {
        showDownloadNotification(fileName, true);
      };
      
      const onDownloadError = (error) => {
        showDownloadNotification(fileName, false);
        console.error('下载失败:', error);
      };
      
      // 开始下载，只有Edge/Firefox等会立即显示通知
      downloadJSON(saveData, fileName, onDownloadSuccess, onDownloadError);
      
    } catch (error) {
      alert('保存失败，请重试');
    }
  };

  return (
      <button
        onClick={saveCanvas}
       title="保存画布"
       style={{
         fontSize: 12,
         padding: "2px",
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
        <img src="/icons/save_canvas.png" alt="保存画布" style={{width: 32, height: 32}} />
      </button>
  );
}
