// 素材管理相关工具函数
import { saveImageData } from './apiUtils.js';

// 哈希比较策略接口
class ImageHashStrategy {
  async calculateHash(imageUrl) {
    throw new Error('Must implement calculateHash method');
  }
  
  async compare(imageUrl1, imageUrl2) {
    const hash1 = await this.calculateHash(imageUrl1);
    const hash2 = await this.calculateHash(imageUrl2);
    return hash1 === hash2;
  }
}

// SHA-256哈希策略
class SHA256HashStrategy extends ImageHashStrategy {
  async calculateHash(imageUrl) {
    try {
      const response = await fetch(imageUrl);
      const arrayBuffer = await response.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      console.warn('SHA-256哈希计算失败:', error);
      throw error;
    }
  }
}

// 简单哈希策略（基于URL和尺寸）
class SimpleHashStrategy extends ImageHashStrategy {
  async calculateHash(imageUrl) {
    try {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imageUrl;
      });
      
      return `${imageUrl}_${img.naturalWidth}_${img.naturalHeight}`;
    } catch (error) {
      console.warn('简单哈希计算失败:', error);
      throw error;
    }
  }
}

// 哈希管理器
class ImageHashManager {
  constructor() {
    this.strategies = [
      new SHA256HashStrategy(),
      new SimpleHashStrategy()
    ];
    this.currentStrategy = 0;
  }
  
  async compareImages(imageUrl1, imageUrl2) {
    // 快速检查URL是否相同
    if (imageUrl1 === imageUrl2) {
      return true;
    }
    
    // 尝试当前策略
    try {
      const result = await this.strategies[this.currentStrategy].compare(imageUrl1, imageUrl2);
      return result;
    } catch (error) {
      console.warn(`当前哈希策略失败: ${error.message}`);
      
      // 尝试下一个策略
      for (let i = 1; i < this.strategies.length; i++) {
        const nextIndex = (this.currentStrategy + i) % this.strategies.length;
        try {
          const result = await this.strategies[nextIndex].compare(imageUrl1, imageUrl2);
          console.log(`切换到哈希策略: ${nextIndex}`);
          this.currentStrategy = nextIndex;
          return result;
        } catch (nextError) {
          console.warn(`策略 ${nextIndex} 也失败: ${nextError.message}`);
        }
      }
      
      // 所有策略都失败，返回false
      console.error('所有哈希策略都失败，假设图片不同');
      return false;
    }
  }
  
  // 手动切换策略
  setStrategy(index) {
    if (index >= 0 && index < this.strategies.length) {
      this.currentStrategy = index;
      console.log(`切换到哈希策略: ${index}`);
    }
  }
}

// 全局哈希管理器
const hashManager = new ImageHashManager();

// 获取当前画布的所有图片资产（跨页面）
function getAllImageAssets(editor) {
  const assets = editor.getAssets();
  const imageAssets = [];
  
  for (const [key, asset] of Object.entries(assets)) {
    if (asset?.type === 'image') {
      // 使用资产对象本身的ID，而不是键
      const actualAssetId = asset.id || key;
      imageAssets.push({ assetId: actualAssetId, asset });
    }
  }
  
  return imageAssets;
}

// 检查图片是否已存在于画布中（基于内容哈希，跨页面检测）
export async function checkExistingImageByContent(editor, imageUrl) {
  if (!editor || !imageUrl) return null;
  
  try {
    console.log('🔍 检查图片是否已存在:', imageUrl.substring(0, 50) + '...');
    
    // 获取所有图片资产（跨页面）
    const allImageAssets = getAllImageAssets(editor);
    console.log(`📊 当前画布共有 ${allImageAssets.length} 个图片资产`);
    
    // 逐个比较
    for (const { assetId, asset } of allImageAssets) {
      if (asset?.props?.src) {
        try {
          const isSame = await hashManager.compareImages(imageUrl, asset.props.src);
          if (isSame) {
            // 确保返回的assetId有正确的前缀
            const normalizedAssetId = assetId.startsWith('asset:') ? assetId : `asset:${assetId}`;
            console.log('🔄 发现重复图片，重用现有资产:', normalizedAssetId);
            return normalizedAssetId;
          }
        } catch (error) {
          console.warn('图片比较失败:', error);
          // 继续检查下一个资产
        }
      }
    }
    
    console.log('✅ 未发现重复图片，将创建新资产');
    return null;
  } catch (error) {
    console.warn('检查重复图片失败:', error);
    return null;
  }
}

// 检查图片是否已存在于素材库中（基于内容哈希，跨页面检测）
export async function checkExistingAssetByContent(editor, file) {
  if (!editor) return null;
  
  try {
    // 将文件转换为dataUrl
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    
    // 使用内容哈希检测
    return await checkExistingImageByContent(editor, dataUrl);
  } catch (error) {
    console.warn('检查重复素材失败:', error);
    return null;
  }
}

// 检查图片是否已存在于素材库中（旧方法，保持兼容性）
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
