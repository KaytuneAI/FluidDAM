import React from "react";
import { getSnapshot } from "tldraw";
import { downloadJSON, showDownloadNotification } from '../utils/downloadUtils.js';
import { getImageData } from '../utils/apiUtils.js';

export default function SaveCanvasButton({ editor }) {
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
