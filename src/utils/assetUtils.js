// 素材管理相关工具函数
import { saveImageData } from './apiUtils.js';

// 检查图片是否已存在于素材库中
export async function checkExistingAsset(editor, file) {
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
}

// 保存图片信息到JSON文件
export async function saveImageInfo(file, assetId, shapeId, dataUrl, width, height) {
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

    // 使用API工具保存数据（带fallback到localStorage）
    const result = await saveImageData(imageInfo);
    
    if (result.success) {
      // 更新localStorage中的图片ID列表
      const currentImageIds = JSON.parse(localStorage.getItem('currentImageIds') || '[]');
      currentImageIds.push(shapeId);
      localStorage.setItem('currentImageIds', JSON.stringify(currentImageIds));
    }
    
  } catch (error) {
    // 如果整个函数执行失败，静默处理
    console.warn('保存图片信息时出错:', error);
  }
}

// 放置资产到选中的Frame
export function placeAssetIntoSelectedFrame(editor, assetId, platform="TM") {
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

// 需要导入frameUtils中的函数
import { getFrameBounds, fitContain } from './frameUtils.js';
