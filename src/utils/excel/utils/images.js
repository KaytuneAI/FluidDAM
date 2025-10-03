/**
 * 图片处理相关工具函数
 */

import { getCellPixelBoundsPrecise } from './geometry.js';

/**
 * 提取图片
 * @param {Object} worksheet - Excel工作表
 * @returns {Promise<Array>} 图片数组
 */
export async function extractImages(worksheet) {
  const images = [];
  const processedImages = new Set(); // 避免重复处理同一张图片

  try {
    // 尝试多种方式获取图片
    let worksheetImages = [];
    
    // 方法1: 使用getImages方法
    if (typeof worksheet.getImages === 'function') {
      try {
        worksheetImages = await worksheet.getImages();
      } catch (error) {
        console.warn('使用getImages方法获取图片失败:', error);
      }
    }
    
    // 方法2: 从worksheet.model.images获取
    if (worksheetImages.length === 0) {
      if (worksheet.model && worksheet.model.images) {
        worksheetImages = worksheet.model.images;
      }
    }
    
    // 方法3: 从worksheet.drawings获取
    if (worksheetImages.length === 0) {
      if (worksheet.drawings) {
        worksheetImages = worksheet.drawings;
      }
    }
    
    // 方法4: 从worksheet._drawings获取
    if (worksheetImages.length === 0) {
      if (worksheet._drawings) {
        worksheetImages = worksheet._drawings;
      }
    }
    
    // 方法5: 从worksheet.model.drawings获取
    if (worksheetImages.length === 0) {
      if (worksheet.model && worksheet.model.drawings) {
        worksheetImages = worksheet.model.drawings;
      }
    }
    
    // 方法6: 从工作簿获取
    if (worksheetImages.length === 0) {
      if (worksheet._workbook) {
        // 尝试从工作簿获取所有图片
        const workbook = worksheet._workbook;
        if (workbook.images) {
          worksheetImages = Object.values(workbook.images);
        }
      }
    }

    // 处理每张图片
    for (const image of worksheetImages) {
      try {
        // 获取图片ID
        let imageId = image.imageId || image.id;
        
        // 如果没有ID，尝试从range生成
        if (!imageId && image.range) {
          const range = image.range;
          if (range.tl && range.br) {
            imageId = `img_${range.tl.row}_${range.tl.col}_${range.br.row}_${range.br.col}`;
          }
        }
        
        // 如果仍然没有ID，跳过
        if (!imageId) {
          continue;
        }
        
        // 避免重复处理
        if (processedImages.has(imageId)) {
          continue;
        }
        processedImages.add(imageId);
        
        // 获取图片数据
        let imageData;
        
        // 尝试多种方式获取图片数据
        if (typeof image.getImage === 'function') {
          imageData = await image.getImage();
        } else if (image.image) {
          imageData = image.image;
        } else if (image.data) {
          imageData = image.data;
        }
        
        if (!imageData) {
          continue;
        }
        
        // 确保imageData有必要的属性
        if (imageData.imageId !== undefined && imageData.imageId !== null) {
          // 尝试从工作簿获取图片数据
          if (imageData.worksheet && imageData.worksheet._workbook) {
            const workbook = imageData.worksheet._workbook;
            
            try {
              // 尝试使用工作簿的getImage方法
              if (typeof workbook.getImage === 'function') {
                const wbImageData = await workbook.getImage(imageData.imageId);
                if (wbImageData) {
                  imageData = { ...imageData, ...wbImageData };
                }
              }
              
              // 尝试从工作簿的images属性获取
              if (!imageData.buffer && workbook.images) {
                const wbImage = workbook.images[imageData.imageId];
                if (wbImage && wbImage.buffer) {
                  imageData.buffer = wbImage.buffer;
                }
              }
              
              // 尝试从工作簿的_media属性获取
              if (!imageData.buffer && workbook._media) {
                const mediaImage = workbook._media[imageData.imageId];
                if (mediaImage && mediaImage.buffer) {
                  imageData.buffer = mediaImage.buffer;
                }
              }
            } catch (wbError) {
              console.warn('从工作簿获取图片数据时出错:', wbError);
            }
          }
        }
        
        // 获取图片buffer
        let buffer = null;
        
        // 尝试多种方式获取buffer
        if (imageData.buffer) {
          if (imageData.buffer.buffer) {
            buffer = imageData.buffer.buffer;
          } else if (imageData.buffer instanceof ArrayBuffer) {
            buffer = imageData.buffer;
          } else if (imageData.buffer instanceof Uint8Array) {
            buffer = imageData.buffer.buffer || imageData.buffer;
          }
        }
        
        // 如果还没有buffer，尝试其他方式
        if (!buffer) {
          if (imageData.buffer) {
            buffer = imageData.buffer;
          } else if (imageData.data) {
            buffer = imageData.data;
          } else if (imageData.image && imageData.image.buffer) {
            const nestedImage = imageData.image;
            if (nestedImage.buffer) {
              buffer = nestedImage.buffer;
            }
          }
        }
        
        // 如果仍然没有buffer，尝试从imageData的所有属性中查找
        if (!buffer) {
          const allKeys = Object.keys(imageData);
          for (const key of allKeys) {
            const value = imageData[key];
            if (value instanceof ArrayBuffer || value instanceof Uint8Array) {
              buffer = value;
              break;
            }
            
            // 如果value是对象，尝试深入查找
            if (value && typeof value === 'object') {
              if (value._workbook) {
                const workbook = value._workbook;
                const workbookKeys = Object.keys(workbook);
                for (const wbKey of workbookKeys) {
                  const wbValue = workbook[wbKey];
                  if (wbValue && typeof wbValue === 'object') {
                    if (wbValue.buffer) {
                      buffer = wbValue.buffer;
                      break;
                    }
                    
                    // 如果是数组，检查第一个元素
                    if (Array.isArray(wbValue) && wbValue.length > 0) {
                      const firstItem = Array.isArray(wbValue) ? wbValue[0] : wbValue;
                      if (firstItem && firstItem.buffer) {
                        buffer = firstItem.buffer;
                        break;
                      }
                    }
                  }
                }
              }
            }
          }
        }
        
        // 如果仍然没有buffer，跳过这张图片
        if (!buffer) {
          continue;
        }
        
        // 转换为base64
        let imageUrl;
        try {
          // 处理不同类型的buffer
          let uint8Array;
          if (buffer instanceof ArrayBuffer) {
            uint8Array = new Uint8Array(buffer);
          } else if (buffer instanceof Uint8Array) {
            uint8Array = buffer;
          } else {
            uint8Array = new Uint8Array(buffer);
          }
          
          // 转换为base64
          let base64String = '';
          try {
            // 尝试一次性转换
            const binaryString = Array.from(uint8Array, byte => String.fromCharCode(byte)).join('');
            base64String = btoa(binaryString);
          } catch (btoaError) {
            // 如果一次性转换失败，尝试分块转换
            const chunkSize = 1024; // 减小块大小
            try {
              for (let i = 0; i < uint8Array.length; i += chunkSize) {
                const chunk = uint8Array.slice(i, i + chunkSize);
                const chunkString = Array.from(chunk, byte => String.fromCharCode(byte)).join('');
                base64String += btoa(chunkString);
              }
            } catch (chunkError) {
              console.warn('分块转换base64失败:', chunkError);
              continue;
            }
          }
          
          // 验证base64字符串
          if (!base64String || base64String.length === 0) {
            continue;
          }
          
          // 确保base64字符串格式正确
          const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
          if (!base64Regex.test(base64String)) {
            // 尝试修复base64字符串
            base64String = base64String.replace(/[^A-Za-z0-9+/=]/g, '');
            
            // 添加必要的填充
            if (base64String.length % 4 !== 0) {
              const padding = 4 - (base64String.length % 4);
              base64String += '='.repeat(padding);
            }
          }
          
          // 确定MIME类型
          let mimeType = imageData.type || 'image/png';
          if (!mimeType || mimeType === 'image' || mimeType === '') {
            // 根据文件头判断类型
            const header = uint8Array.slice(0, 4);
            if (header[0] === 0xFF && header[1] === 0xD8) {
              mimeType = 'image/jpeg';
            } else if (header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47) {
              mimeType = 'image/png';
            } else if (header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46) {
              mimeType = 'image/gif';
            } else {
              mimeType = 'image/png'; // 默认
            }
          }
          
          // 使用96 DPI智能压缩
          const { compressTo96DPI } = await import('../../dpiCompression.js');
          const compressedBase64 = await compressTo96DPI(base64String, mimeType, 96);
          
          // 验证压缩后的图片
          const base64Part = imageUrl.split(';base64,')[1];
          if (!base64Part || base64Part.length === 0) {
            continue;
          }
          
          // 计算最终文件大小
          const finalSizeKB = Math.round((base64Part.length * 3) / 4 / 1024);
          
          // 验证图片是否可以正常加载
          try {
            const testImg = new Image();
            await new Promise((resolve, reject) => {
              testImg.onload = resolve;
              testImg.onerror = reject;
              testImg.src = `data:${mimeType};base64,${compressedBase64}`;
            });
          } catch (imgError) {
            console.warn('图片验证失败:', imgError);
            continue;
          }
          
          // 计算图片位置和尺寸
          let x = 0, y = 0, width = 0, height = 0;
          
          if (image.range && image.range.tl && image.range.br) {
            // 使用range信息计算位置
            const anchor = image.range;
            const tl = anchor.tl;
            const br = anchor.br;
            
            // 计算单元格边界
            const tlCellBounds = getCellPixelBoundsPrecise(tl.row, tl.col, worksheet);
            const brCellBounds = getCellPixelBoundsPrecise(br.row, br.col, worksheet);
            
            // EMU到像素的转换函数
            const emuToPx = (emu) => {
              // 1 EMU = 1/914400 inch, 1 inch = 96 pixels
              const numEmu = typeof emu === 'number' ? emu : parseFloat(emu);
              return (numEmu / 914400) * 96;
            };
            
            // 计算实际位置
            const tlX = tlCellBounds.x + emuToPx(tl.nativeColOffset);
            const tlY = tlCellBounds.y + emuToPx(tl.nativeRowOffset);
            const brX = brCellBounds.x + emuToPx(br.nativeColOffset);
            const brY = brCellBounds.y + emuToPx(br.nativeRowOffset);
            
            x = tlX;
            y = tlY;
            width = brX - tlX;
            height = brY - tlY;
          } else if (image.range && image.range.tl) {
            // 使用简化的range信息
            const anchor = image.range;
            const row = anchor.tl.row;
            const col = anchor.tl.col;
            
            // 计算单元格边界
            const cellBounds = getCellPixelBoundsPrecise(row, col, worksheet);
            x = cellBounds.x;
            y = cellBounds.y;
            width = cellBounds.width;
            height = cellBounds.height;
          }
          
          // 获取原始尺寸
          let originalWidth = imageData.width || 100;
          let originalHeight = imageData.height || 100;
          
          // 如果尺寸为0，尝试从图片数据获取
          if (width === 0 || height === 0) {
            try {
              const testImg = new Image();
              await new Promise((resolve, reject) => {
                testImg.onload = () => {
                  originalWidth = testImg.naturalWidth;
                  originalHeight = testImg.naturalHeight;
                  resolve();
                };
                testImg.onerror = reject;
                testImg.src = `data:${mimeType};base64,${compressedBase64}`;
              });
              
              // 使用原始尺寸
              width = originalWidth;
              height = originalHeight;
            } catch (imgError) {
              console.warn('获取图片尺寸失败:', imgError);
              width = 100;
              height = 100;
            }
          }
          
          // 创建图片信息对象
          const imageInfo = {
            id: imageId,
            imageId: imageId,
            x: x,
            y: y,
            width: width,
            height: height,
            originalWidth: originalWidth,
            originalHeight: originalHeight,
            url: `data:${mimeType};base64,${compressedBase64}`,
            mimeType: mimeType,
            sizeKB: finalSizeKB,
            range: image.range,
            worksheet: worksheet
          };
          
          images.push(imageInfo);
        } catch (conversionError) {
          console.warn('转换图片时出错:', conversionError);
        }
      } catch (imageError) {
        console.warn('处理图片时出错:', imageError);
      }
    }
  } catch (error) {
    console.warn('提取图片时出错:', error);
  }

  return images;
}

/**
 * 压缩图片到指定大小以内
 * @param {string} base64String - 原始Base64字符串
 * @param {number} maxSizeKB - 最大文件大小（KB）
 * @param {string} mimeType - 图片MIME类型
 * @returns {Promise<string>} 压缩后的Base64字符串
 */
export async function compressImage(base64String, maxSizeKB = 100, mimeType = 'image/png') {
  try {
    // 创建图片对象
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // 等待图片加载
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = `data:${mimeType};base64,${base64String}`;
    });
    
    // 设置画布尺寸
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    
    // 绘制图片
    ctx.drawImage(img, 0, 0);
    
    // 计算当前大小
    const currentSizeKB = Math.round((base64String.length * 3) / 4 / 1024);
    
    // 如果已经小于目标大小，直接返回
    if (currentSizeKB <= maxSizeKB) {
      return base64String;
    }
    
    // 计算压缩比例
    let quality = 0.9;
    let compressedBase64 = '';
    
    // 迭代压缩直到达到目标大小
    while (quality > 0.1) {
      compressedBase64 = canvas.toDataURL(mimeType, quality).split(',')[1];
      const compressedSizeKB = Math.round((compressedBase64.length * 3) / 4 / 1024);
      
      if (compressedSizeKB <= maxSizeKB) {
        break;
      }
      
      quality -= 0.1;
    }
    
    return compressedBase64;
  } catch (error) {
    console.warn('压缩图片时出错:', error);
    return base64String; // 返回原始字符串
  }
}

/**
 * 获取图片文本覆盖层
 * @param {Array} images - 图片数组
 * @returns {Array} 文本覆盖层数组
 */
export function getImageTextOverlays(images) {
  const textOverlays = [];
  
  try {
    // 查找THE MACALLAN图片
    const macallanImage = images.find(img => 
      img.id && img.id.toLowerCase().includes('macallan')
    );
    
    if (macallanImage) {
      // 创建THE MACALLAN横幅覆盖层
      const imageX = macallanImage.x;
      const imageY = macallanImage.y;
      const imageWidth = macallanImage.width;
      const imageHeight = macallanImage.height;
      
      // 计算横幅位置（图片上方）
      const bannerY = imageY - 30;
      const bannerHeight = 25;
      
      textOverlays.push({
        text: 'THE MACALLAN',
        x: imageX,
        y: bannerY,
        width: imageWidth,
        height: bannerHeight,
        fontSize: 12,
        fontFamily: 'Arial, Helvetica, "Microsoft YaHei", "微软雅黑", "PingFang SC", "Hiragino Sans GB", "WenQuanYi Micro Hei", sans-serif',
        color: '#000000',
        backgroundColor: '#FFFFFF',
        type: 'banner'
      });
    }
  } catch (error) {
    console.warn('获取图片文本覆盖层时出错:', error);
  }
  
  return textOverlays;
}
