/**
 * 96 DPI智能压缩工具
 * 只限制DPI为96，不限制文件大小，保持原始长宽比和像素尺寸
 */

/**
 * 检测图片的实际DPI
 * @param {Image} img - 图片对象
 * @param {number} displayWidth - 显示宽度（像素）
 * @param {number} displayHeight - 显示高度（像素）
 * @returns {number} 实际DPI
 */
export function detectImageDPI(img, displayWidth = null, displayHeight = null) {
  try {
    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;
    
    // 如果没有提供显示尺寸，使用图片的自然尺寸
    const actualDisplayWidth = displayWidth || naturalWidth;
    const actualDisplayHeight = displayHeight || naturalHeight;
    
    // 计算DPI：假设标准屏幕DPI为96
    // DPI = (像素尺寸 / 显示尺寸) * 96
    const dpiX = (naturalWidth / actualDisplayWidth) * 96;
    const dpiY = (naturalHeight / actualDisplayHeight) * 96;
    
    // 返回平均DPI
    return Math.round((dpiX + dpiY) / 2);
  } catch (error) {
    console.warn('检测图片DPI失败:', error);
    return 96; // 默认返回96 DPI
  }
}

/**
 * 96 DPI智能压缩
 * 只限制DPI为96，不限制文件大小，保持原始长宽比和像素尺寸
 * @param {string} base64String - 原始Base64字符串
 * @param {string} mimeType - 图片MIME类型
 * @param {number} targetDPI - 目标DPI（默认96）
 * @returns {Promise<string>} 压缩后的Base64字符串
 */
export async function compressTo96DPI(base64String, mimeType = 'image/png', targetDPI = 96) {
  try {
    console.log('🎯 开始96 DPI智能压缩...');
    
    // 创建图片对象
    const img = new Image();
    const imageUrl = `data:${mimeType};base64,${base64String}`;
    
    return new Promise((resolve, reject) => {
      img.onload = async () => {
        try {
          const naturalWidth = img.naturalWidth;
          const naturalHeight = img.naturalHeight;
          
          console.log(`📏 原始尺寸: ${naturalWidth}x${naturalHeight}`);
          
          // 检测当前DPI
          const currentDPI = detectImageDPI(img);
          console.log(`🔍 检测到DPI: ${currentDPI}`);
          
          // 如果DPI已经≤96，无需压缩
          if (currentDPI <= targetDPI) {
            console.log(`✅ DPI已符合标准 (${currentDPI} ≤ ${targetDPI})，无需压缩`);
            resolve(base64String);
            return;
          }
          
          // 计算96 DPI的压缩比例
          const compressionRatio = targetDPI / currentDPI;
          console.log(`📐 压缩比例: ${compressionRatio.toFixed(3)}`);
          
          // 计算压缩后的尺寸（保持长宽比）
          const newWidth = Math.round(naturalWidth * compressionRatio);
          const newHeight = Math.round(naturalHeight * compressionRatio);
          
          console.log(`📏 压缩后尺寸: ${newWidth}x${newHeight}`);
          
          // 创建画布进行压缩
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          canvas.width = newWidth;
          canvas.height = newHeight;
          
          // 设置高质量渲染
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          
          // 绘制压缩后的图片
          ctx.drawImage(img, 0, 0, newWidth, newHeight);
          
          // 转换为Base64，使用高质量设置
          const compressedBase64 = canvas.toDataURL(mimeType, 0.9).split(',')[1];
          
          // 计算压缩效果
          const originalSizeKB = Math.round((base64String.length * 3) / 4 / 1024);
          const compressedSizeKB = Math.round((compressedBase64.length * 3) / 4 / 1024);
          const compressionPercent = ((1 - compressedSizeKB / originalSizeKB) * 100).toFixed(1);
          
          console.log(`📊 压缩效果:`);
          console.log(`   原始大小: ${originalSizeKB}KB`);
          console.log(`   压缩后: ${compressedSizeKB}KB`);
          console.log(`   压缩率: ${compressionPercent}%`);
          console.log(`   新DPI: ${Math.round((newWidth / naturalWidth) * currentDPI)}`);
          
          resolve(compressedBase64);
        } catch (error) {
          console.warn('96 DPI压缩失败，使用原始图片:', error);
          resolve(base64String);
        }
      };
      
      img.onerror = () => {
        console.warn('图片加载失败，使用原始Base64');
        resolve(base64String);
      };
      
      img.src = imageUrl;
    });
  } catch (error) {
    console.warn('96 DPI压缩过程出错，使用原始图片:', error);
    return base64String;
  }
}

/**
 * 批量96 DPI压缩
 * @param {Array} images - 图片数组，每个元素包含base64String和mimeType
 * @param {number} targetDPI - 目标DPI（默认96）
 * @returns {Promise<Array>} 压缩后的图片数组
 */
export async function batchCompressTo96DPI(images, targetDPI = 96) {
  console.log(`🔄 开始批量96 DPI压缩，目标DPI: ${targetDPI}`);
  
  const compressedImages = [];
  
  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    console.log(`📸 处理图片 ${i + 1}/${images.length}`);
    
    try {
      const compressedBase64 = await compressTo96DPI(
        image.base64String, 
        image.mimeType, 
        targetDPI
      );
      
      compressedImages.push({
        ...image,
        base64String: compressedBase64,
        compressed: compressedBase64 !== image.base64String
      });
    } catch (error) {
      console.warn(`图片 ${i + 1} 压缩失败:`, error);
      compressedImages.push({
        ...image,
        compressed: false
      });
    }
  }
  
  const compressedCount = compressedImages.filter(img => img.compressed).length;
  console.log(`✅ 批量压缩完成: ${compressedCount}/${images.length} 张图片被压缩`);
  
  return compressedImages;
}

/**
 * 验证96 DPI压缩效果
 * @param {string} base64String - 压缩后的Base64字符串
 * @param {string} mimeType - 图片MIME类型
 * @returns {Promise<Object>} 验证结果
 */
export async function validate96DPICompression(base64String, mimeType = 'image/png') {
  try {
    const img = new Image();
    const imageUrl = `data:${mimeType};base64,${base64String}`;
    
    return new Promise((resolve) => {
      img.onload = () => {
        const currentDPI = detectImageDPI(img);
        const sizeKB = Math.round((base64String.length * 3) / 4 / 1024);
        
        resolve({
          dpi: currentDPI,
          sizeKB: sizeKB,
          width: img.naturalWidth,
          height: img.naturalHeight,
          meetsStandard: currentDPI <= 96
        });
      };
      
      img.onerror = () => {
        resolve({
          dpi: 0,
          sizeKB: 0,
          width: 0,
          height: 0,
          meetsStandard: false,
          error: '图片加载失败'
        });
      };
      
      img.src = imageUrl;
    });
  } catch (error) {
    return {
      dpi: 0,
      sizeKB: 0,
      width: 0,
      height: 0,
      meetsStandard: false,
      error: error.message
    };
  }
}

