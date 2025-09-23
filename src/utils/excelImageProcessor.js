/**
 * Excel图片处理模块
 * 负责从Excel文件中提取、处理和适配图片
 */

import { createFrameFromImageAnchor, placeImageIntoFrame, addFrameInfoToImage } from './imageFrameUtils.js';

/**
 * Excel图片处理器类
 */
export class ExcelImageProcessor {
  constructor(scale = 1, dependencies = {}) {
    this.scale = scale;
    this.dependencies = dependencies;
  }

  /**
   * 提取图片元素
   * @param {Object} worksheet - Excel工作表
   * @returns {Array} 图片信息数组
   */
  async extractImages(worksheet) {
    const images = [];
    const processedImages = new Set(); // 避免重复处理同一张图片
    
    try {
      console.log('开始检查工作表中的图片...');
      console.log('worksheet对象:', worksheet);
      console.log('worksheet.getImages方法:', typeof worksheet.getImages);
      
      // 尝试获取工作表中的图片
      let worksheetImages = [];
      
      if (typeof worksheet.getImages === 'function') {
        worksheetImages = worksheet.getImages();
        console.log('通过getImages()获取到图片数量:', worksheetImages.length);
      } else if (worksheet.images) {
        worksheetImages = worksheet.images;
        console.log('通过worksheet.images获取到图片数量:', worksheetImages.length);
      } else if (worksheet._images) {
        worksheetImages = worksheet._images;
        console.log('通过worksheet._images获取到图片数量:', worksheetImages.length);
      } else {
        console.log('未找到图片数据，尝试其他方法...');
        // 尝试其他可能的方法
        if (worksheet.model && worksheet.model.images) {
          worksheetImages = worksheet.model.images;
          console.log('通过worksheet.model.images获取到图片数量:', worksheetImages.length);
        }
      }
      
      console.log('最终图片数组:', worksheetImages);
      
      // 尝试提取其他类型的对象（如文本框、形状等）
      try {
        console.log('尝试提取其他对象...');
        console.log('worksheet.drawings:', worksheet.drawings);
        console.log('worksheet._drawings:', worksheet._drawings);
        console.log('worksheet.model:', worksheet.model);
        
        // 检查worksheet的所有属性，寻找可能的文本框
        console.log('worksheet所有属性:', Object.keys(worksheet));
        console.log('worksheet._workbook属性:', worksheet._workbook ? Object.keys(worksheet._workbook) : '无');
        
        // 检查是否有drawings属性
        if (worksheet.drawings) {
          console.log('找到drawings:', worksheet.drawings);
          // 尝试提取drawings中的文本框
          this.extractTextFromDrawings(worksheet.drawings, images);
        }
        if (worksheet._drawings) {
          console.log('找到_drawings:', worksheet._drawings);
          // 尝试提取_drawings中的文本框
          this.extractTextFromDrawings(worksheet._drawings, images);
        }
        if (worksheet.model && worksheet.model.drawings) {
          console.log('找到model.drawings:', worksheet.model.drawings);
          // 尝试提取model.drawings中的文本框
          this.extractTextFromDrawings(worksheet.model.drawings, images);
        }
        
        // 尝试从workbook中提取文本框
        if (worksheet._workbook) {
          console.log('尝试从workbook提取文本框...');
          this.extractTextFromWorkbook(worksheet._workbook, images);
        }
        
        // 尝试从worksheet的其他属性中提取文本框
        this.extractTextFromWorksheetProperties(worksheet, images);
        
      } catch (e) {
        console.warn('提取其他对象失败:', e);
      }
      
      for (const image of worksheetImages) {
        try {
          // 创建图片的唯一标识符，避免循环引用
          let imageId = image.imageId || image.id;
          
          if (!imageId && image.range) {
            // 安全地序列化range对象，避免循环引用
            try {
              const safeRange = {
                tl: image.range.tl ? {
                  row: image.range.tl.row,
                  col: image.range.tl.col,
                  nativeRow: image.range.tl.nativeRow,
                  nativeCol: image.range.tl.nativeCol
                } : null,
                br: image.range.br ? {
                  row: image.range.br.row,
                  col: image.range.br.col,
                  nativeRow: image.range.br.nativeRow,
                  nativeCol: image.range.br.nativeCol
                } : null
              };
              imageId = JSON.stringify(safeRange);
            } catch (e) {
              console.warn('无法序列化range对象:', e);
              imageId = `image_${Math.random().toString(36).substr(2, 9)}`;
            }
          }
          
          if (!imageId) {
            imageId = `image_${Math.random().toString(36).substr(2, 9)}`;
          }
          
          // 获取图片数据
          let imageData;
          if (typeof image.getImage === 'function') {
            imageData = await image.getImage();
            console.log('通过getImage()获取图片数据:', imageData);
          } else {
            imageData = image;
          }
          
          if (!imageData) {
            console.warn('图片数据为空:', image);
            continue;
          }
          
          // 检查是否已经处理过这张图片（包含位置信息）
          const tl = image.range?.tl || {};
          const br = image.range?.br || {};
          const key = `${imageData.imageId ?? imageId}@${tl.row},${tl.col},${br.row ?? ''},${br.col ?? ''}`;
          
          if (processedImages.has(key)) {
            console.log('跳过重复的图片:', key);
            continue;
          }
          processedImages.add(key);
          
          // 获取图片buffer数据
          const buffer = await this._extractImageBuffer(imageData, worksheet);
          
          if (!buffer) {
            console.warn('无法获取图片buffer，图片数据格式:', imageData);
            continue;
          }
          
          // 将buffer转换为base64 URL
          const imageUrl = await this._convertBufferToBase64(buffer, imageData);
          
          if (!imageUrl) {
            console.warn('图片URL转换失败，跳过此图片');
            continue;
          }
          
          // 计算图片位置和尺寸
          const imageInfo = await this._calculateImagePosition(image, worksheet, imageUrl);
          
          // 添加frame信息
          const finalImageInfo = addFrameInfoToImage(imageInfo, null, images.length);
          
          images.push(finalImageInfo);
        } catch (error) {
          console.warn('处理图片失败:', error);
        }
      }
    } catch (error) {
      console.warn('提取图片失败:', error);
    }
    
    console.log('最终提取到的图片数量:', images.length);
    return images;
  }

  /**
   * 提取图片buffer数据
   * @param {Object} imageData - 图片数据对象
   * @param {Object} worksheet - 工作表对象
   * @returns {ArrayBuffer|Uint8Array|null} 图片buffer
   */
  async _extractImageBuffer(imageData, worksheet) {
    let buffer = null;
    
    // 如果有imageId，尝试从workbook获取图片数据
    if (imageData.imageId !== undefined && imageData.imageId !== null) {
      try {
        const workbook = imageData.worksheet?._workbook;
        
        if (workbook) {
          // 尝试多种方法获取图片
          let imageBuffer = null;
          
          // 方法1: getImage
          if (typeof workbook.getImage === 'function') {
            try {
              imageBuffer = await workbook.getImage(imageData.imageId);
            } catch (e) {
              console.warn('getImage方法失败:', e);
            }
          }
          
          // 方法2: 直接从workbook的images属性获取
          if (!imageBuffer && workbook.images) {
            try {
              imageBuffer = workbook.images[imageData.imageId];
            } catch (e) {
              console.warn('从workbook.images获取失败:', e);
            }
          }
          
          // 方法3: 从workbook的_media属性获取
          if (!imageBuffer && workbook._media) {
            try {
              imageBuffer = workbook._media[imageData.imageId];
            } catch (e) {
              console.warn('从workbook._media获取失败:', e);
            }
          }
          
          // 处理获取到的图片数据
          if (imageBuffer) {
            if (imageBuffer.buffer) {
              buffer = imageBuffer.buffer;
            } else if (imageBuffer.data) {
              buffer = imageBuffer.data;
            } else if (imageBuffer instanceof ArrayBuffer) {
              buffer = imageBuffer;
            } else if (imageBuffer instanceof Uint8Array) {
              buffer = imageBuffer;
            } else if (imageBuffer._data) {
              buffer = imageBuffer._data;
            }
          }
        }
      } catch (e) {
        console.warn('从workbook获取图片失败:', e);
      }
    }
    
    // 如果还没有buffer，尝试其他方法
    if (!buffer) {
      // 检查各种可能的数据格式
      if (imageData.buffer) {
        buffer = imageData.buffer;
      } else if (imageData.base64) {
        // 如果是base64格式，转换为buffer
        try {
          const base64Data = imageData.base64.replace(/^data:image\/[a-z]+;base64,/, '');
          buffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
        } catch (e) {
          console.warn('base64转换失败:', e);
        }
      } else if (imageData.data) {
        buffer = imageData.data;
      } else if (imageData instanceof ArrayBuffer) {
        buffer = imageData;
      } else if (imageData instanceof Uint8Array) {
        buffer = imageData;
      } else if (imageData._data) {
        buffer = imageData._data;
      } else if (imageData.image) {
        // 检查是否有嵌套的image属性
        const nestedImage = imageData.image;
        if (nestedImage.buffer) {
          buffer = nestedImage.buffer;
        } else if (nestedImage.data) {
          buffer = nestedImage.data;
        } else if (nestedImage instanceof ArrayBuffer) {
          buffer = nestedImage;
        } else if (nestedImage instanceof Uint8Array) {
          buffer = nestedImage;
        }
      }
    }
    
    return buffer;
  }

  /**
   * 将buffer转换为Base64 URL
   * @param {ArrayBuffer|Uint8Array} buffer - 图片buffer
   * @param {Object} imageData - 图片数据对象
   * @returns {string|null} Base64 URL
   */
  async _convertBufferToBase64(buffer, imageData) {
    try {
      // 确保buffer是正确的格式
      let uint8Array;
      if (buffer instanceof ArrayBuffer) {
        uint8Array = new Uint8Array(buffer);
      } else if (buffer instanceof Uint8Array) {
        uint8Array = buffer;
      } else {
        console.warn('buffer格式不正确:', typeof buffer, buffer);
        return null;
      }
      
      // 使用更安全的方法转换Base64
      let base64String = '';
      
      try {
        // 改进的Base64转换方法
        try {
          // 使用更安全的方法转换Base64
          const binaryString = Array.from(uint8Array, byte => String.fromCharCode(byte)).join('');
          base64String = btoa(binaryString);
        } catch (btoaError) {
          console.warn('btoa转换失败，尝试分块转换:', btoaError);
          // 分块转换作为备用方案
          const chunkSize = 1024; // 减小块大小
          base64String = '';
          for (let i = 0; i < uint8Array.length; i += chunkSize) {
            const chunk = uint8Array.slice(i, i + chunkSize);
            const chunkString = Array.from(chunk, byte => String.fromCharCode(byte)).join('');
            try {
              base64String += btoa(chunkString);
            } catch (chunkError) {
              console.warn(`分块${i}转换失败:`, chunkError);
              // 跳过有问题的块
              continue;
            }
          }
          console.log('分块转换Base64完成，长度:', base64String.length);
        }
        
        // 验证Base64字符串
        if (!base64String || base64String.length === 0) {
          throw new Error('Base64字符串为空');
        }
        
        // 验证Base64字符串格式
        const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
        if (!base64Regex.test(base64String)) {
          console.warn('Base64字符串格式不正确，尝试清理...');
          // 清理无效字符
          base64String = base64String.replace(/[^A-Za-z0-9+/=]/g, '');
        }
        
        // 检查Base64字符串是否完整（应该能被4整除）
        if (base64String.length % 4 !== 0) {
          // 补齐Base64字符串
          const padding = 4 - (base64String.length % 4);
          base64String += '='.repeat(padding);
          console.log('补齐Base64字符串，添加padding:', padding);
        }
        
        // 最终验证Base64字符串
        if (!base64Regex.test(base64String)) {
          throw new Error('Base64字符串格式仍然不正确');
        }
        
      } catch (e) {
        console.error('Base64转换失败:', e);
        throw e;
      }
      
      // 确保MIME类型格式正确
      let mimeType = imageData.type || 'image/png';
      
      // 处理各种可能的MIME类型格式
      if (!mimeType || mimeType === 'image' || mimeType === '') {
        mimeType = 'image/png';
      } else if (!mimeType.includes('/')) {
        mimeType = `image/${mimeType}`;
      } else if (!mimeType.startsWith('image/')) {
        mimeType = 'image/png';
      }
      
      // 最终验证，确保MIME类型格式正确
      if (!mimeType || mimeType === 'image' || !mimeType.includes('/')) {
        mimeType = 'image/png';
      }
      
      // 使用原始图片，不进行压缩
      const imageUrl = `data:${mimeType};base64,${base64String}`;
      
      // 验证URL格式
      if (!imageUrl.startsWith('data:image/') || !imageUrl.includes(';base64,')) {
        throw new Error('生成的URL格式不正确');
      }
      
      // 验证Base64部分
      const base64Part = imageUrl.split(';base64,')[1];
      if (!base64Part || base64Part.length === 0) {
        throw new Error('Base64部分为空');
      }
      
      // 记录原始图片信息
      const finalSizeKB = Math.round((base64Part.length * 3) / 4 / 1024);
      console.log(`原始图片大小: ${finalSizeKB}KB (未压缩)`);
      
      console.log('创建base64图片URL成功');
      console.log('URL长度:', imageUrl.length);
      console.log('Base64长度:', base64Part.length);
      console.log('URL预览:', imageUrl.substring(0, 100) + '...');
      
      return imageUrl;
      
    } catch (e) {
      console.warn('base64转换失败，跳过此图片:', e);
      console.warn('图片数据长度:', imageData.data ? imageData.data.length : '未知');
      console.warn('图片类型:', imageData.type || '未知');
      return null;
    }
  }

  /**
   * 计算图片位置和尺寸
   * @param {Object} image - 图片对象
   * @param {Object} worksheet - 工作表对象
   * @param {string} imageUrl - 图片URL
   * @returns {Object} 图片信息对象
   */
  async _calculateImagePosition(image, worksheet, imageUrl) {
    // 新逻辑：先根据Excel图片锚点生成对应的frame
    let frameRect = null;
    let x = 0, y = 0, width = 0, height = 0;
    
    if (image.range) {
      // 创建包含worksheet信息的drawing对象
      const drawingWithWorksheet = {
        range: image.range,
        worksheet: worksheet
      };
      
      // 计算行列偏移量
      const offsets = this.calculateOffsets(worksheet);
      
      // 生成frame矩形
      frameRect = createFrameFromImageAnchor(drawingWithWorksheet, offsets.rowOffsets, offsets.colOffsets, this.getCellPixelBoundsPrecise.bind(this));
      
      if (frameRect) {
        // 使用frame的位置和尺寸作为图片的容器
        x = frameRect.x;
        y = frameRect.y;
        width = frameRect.width;
        height = frameRect.height;
      } else {
        // 如果frame生成失败，回退到原来的逻辑
        console.warn('frame生成失败，使用原始锚点计算');
        
        if (image.range.tl && image.range.br) {
          const anchor = image.range;
          const tl = anchor.tl;
          const br = anchor.br;
          
          // 计算左上角位置（包含native偏移）
          const tlCellBounds = this.getCellPixelBoundsPrecise(tl.row, tl.col, worksheet);
          const brCellBounds = this.getCellPixelBoundsPrecise(br.row, br.col, worksheet);
          
          // 将native偏移从Excel单位转换为像素
          const emuToPx = (emu) => {
            if (!emu || emu === 0) return 0;
            const numEmu = typeof emu === 'number' ? emu : parseFloat(emu);
            if (isNaN(numEmu)) return 0;
            return (numEmu * 96) / 914400;
          };
          
          // 计算真实位置和尺寸
          x = tlCellBounds.x + emuToPx(tl.nativeColOffset);
          y = tlCellBounds.y + emuToPx(tl.nativeRowOffset);
          
          // 计算右下角位置
          const brX = brCellBounds.x + emuToPx(br.nativeColOffset);
          const brY = brCellBounds.y + emuToPx(br.nativeRowOffset);
          
          // 计算真实显示尺寸
          width = brX - x;
          height = brY - y;
          
          console.log(`图片锚点定位: tl(${tl.row},${tl.col}) br(${br.row},${br.col})`);
          console.log(`计算位置: (${x},${y}) 尺寸: ${width}x${height}`);
        } else if (image.range.tl) {
          // 如果没有br锚点，回退到只使用tl锚点
          const anchor = image.range;
          const row = anchor.tl.row;
          const col = anchor.tl.col;
          
          const cellBounds = this.getCellPixelBoundsPrecise(row, col, worksheet);
          x = cellBounds.x;
          y = cellBounds.y;
          
          console.log(`图片基础位置: 行${row}列${col}, 位置:(${x},${y})`);
        }
      }
    }
    
    // 获取原始图片的真实尺寸（用于资产创建）
    let originalWidth = image.width || 100;
    let originalHeight = image.height || 100;
    
    // 总是尝试从Base64数据中获取真实尺寸，因为ExcelJS的尺寸信息可能不准确
    try {
      const testImg = new Image();
      await new Promise((resolve, reject) => {
        testImg.onload = () => {
          originalWidth = testImg.width;
          originalHeight = testImg.height;
          resolve();
        };
        testImg.onerror = () => {
          console.warn('无法从Base64获取图片尺寸，使用默认值');
          resolve();
        };
        testImg.src = imageUrl;
      });
    } catch (error) {
      console.warn('分析Base64图片尺寸失败:', error);
    }
    
    // 如果没有通过锚点计算出显示尺寸，使用原始尺寸作为后备
    if (width === 0 || height === 0) {
      width = originalWidth;
      height = originalHeight;
      console.log(`使用原始图片尺寸作为后备: ${width}x${height}`);
    } else {
      // 优化锚点缩放：确保整个图片被缩放，而不是裁剪
      const anchorAspectRatio = width / height;
      const originalAspectRatio = originalWidth / originalHeight;
      
      console.log(`📐 锚点尺寸: ${width}x${height} (比例: ${anchorAspectRatio.toFixed(3)})`);
      console.log(`📐 原始尺寸: ${originalWidth}x${originalHeight}px (比例: ${originalAspectRatio.toFixed(3)})`);
      
      // 使用contain模式：保持图片完整，适配到锚点区域内
      if (Math.abs(anchorAspectRatio - originalAspectRatio) > 0.01) {
        // 比例不同，需要调整
        const scaleX = width / originalWidth;
        const scaleY = height / originalHeight;
        const scale = Math.min(scaleX, scaleY); // 使用较小的缩放比例确保图片完整
        
        const newWidth = Math.round(originalWidth * scale);
        const newHeight = Math.round(originalHeight * scale);
        
        console.log(`🔄 优化缩放: ${originalWidth}x${originalHeight} -> ${newWidth}x${newHeight} (缩放比例: ${scale.toFixed(3)})`);
        console.log(`📏 保持图片完整，避免裁剪`);
        
        width = newWidth;
        height = newHeight;
      } else {
        console.log(`✅ 比例匹配，直接使用锚点尺寸`);
      }
    }
    
    // 详细记录图片尺寸信息
    console.log(`📸 图片尺寸信息:`);
    console.log(`   Excel原始尺寸: ${originalWidth}x${originalHeight}px`);
    console.log(`   画布显示尺寸: ${width}x${height}px`);
    console.log(`   位置坐标: (${x}, ${y})`);
    console.log(`   缩放比例: ${(width/originalWidth).toFixed(3)}x (宽) / ${(height/originalHeight).toFixed(3)}x (高)`);
    
    return {
      url: imageUrl,
      x: x,
      y: y,
      width: width,        // 使用计算出的显示尺寸
      height: height,      // 使用计算出的显示尺寸
      type: 'image',
      originalWidth: originalWidth,   // 保留原始尺寸用于资产创建
      originalHeight: originalHeight, // 保留原始尺寸用于资产创建
      row: image.range?.tl?.row || 0,
      col: image.range?.tl?.col || 0
    };
  }

  /**
   * 压缩图片到指定大小以内
   * @param {string} base64String - 原始Base64字符串
   * @param {number} maxSizeKB - 最大文件大小（KB）
   * @param {string} mimeType - 图片MIME类型
   * @returns {Promise<string>} 压缩后的Base64字符串
   */
  async compressImage(base64String, maxSizeKB = 100, mimeType = 'image/png') {
    try {
      // 计算原始文件大小
      const originalSizeKB = Math.round((base64String.length * 3) / 4 / 1024);
      console.log(`原始图片大小: ${originalSizeKB}KB`);
      
      // 如果已经小于目标大小，直接返回
      if (originalSizeKB <= maxSizeKB) {
        console.log(`图片已小于${maxSizeKB}KB，无需压缩`);
        return base64String;
      }
      
      // 创建图片对象
      const img = new Image();
      const imageUrl = `data:${mimeType};base64,${base64String}`;
      
      return new Promise((resolve, reject) => {
        img.onload = () => {
          try {
            // 使用迭代压缩确保达到目标大小
            let quality = 0.8;
            let newWidth = img.width;
            let newHeight = img.height;
            let compressedBase64 = '';
            let compressedSizeKB = originalSizeKB;
            
            // 首先尝试调整尺寸
            const sizeRatio = Math.sqrt(maxSizeKB / originalSizeKB);
            newWidth = Math.round(img.width * sizeRatio);
            newHeight = Math.round(img.height * sizeRatio);
            
            console.log(`初始压缩: ${img.width}x${img.height} -> ${newWidth}x${newHeight}`);
            
            // 迭代调整质量直到达到目标大小
            while (compressedSizeKB > maxSizeKB && quality > 0.1) {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              
              canvas.width = newWidth;
              canvas.height = newHeight;
              
              // 绘制压缩后的图片
              ctx.drawImage(img, 0, 0, newWidth, newHeight);
              
              // 转换为Base64
              compressedBase64 = canvas.toDataURL(mimeType, quality).split(',')[1];
              compressedSizeKB = Math.round((compressedBase64.length * 3) / 4 / 1024);
              
              console.log(`质量 ${quality.toFixed(2)}: ${compressedSizeKB}KB`);
              
              if (compressedSizeKB > maxSizeKB) {
                quality -= 0.1;
                // 如果质量调整还不够，进一步缩小尺寸
                if (quality <= 0.1) {
                  newWidth = Math.round(newWidth * 0.8);
                  newHeight = Math.round(newHeight * 0.8);
                  quality = 0.8;
                  console.log(`进一步缩小尺寸: ${newWidth}x${newHeight}`);
                }
              }
            }
            
            console.log(`最终压缩结果: ${compressedSizeKB}KB (目标: ${maxSizeKB}KB)`);
            console.log(`压缩率: ${((1 - compressedSizeKB / originalSizeKB) * 100).toFixed(1)}%`);
            
            resolve(compressedBase64);
          } catch (error) {
            console.warn('图片压缩失败，使用原始图片:', error);
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
      console.warn('图片压缩过程出错，使用原始图片:', error);
      return base64String;
    }
  }

  /**
   * 从drawings中提取文本框
   * @param {Object} drawings - Excel drawings对象
   * @param {Array} images - 图片数组（用于添加文本框）
   */
  extractTextFromDrawings(drawings, images) {
    try {
      console.log('开始提取drawings中的文本框...');
      console.log('drawings类型:', typeof drawings);
      console.log('drawings内容:', drawings);
      
      if (Array.isArray(drawings)) {
        drawings.forEach((drawing, index) => {
          console.log(`处理drawing ${index}:`, drawing);
          this.extractTextFromSingleDrawing(drawing, images);
        });
      } else if (drawings && typeof drawings === 'object') {
        // 如果是对象，尝试遍历其属性
        Object.keys(drawings).forEach(key => {
          console.log(`处理drawing属性 ${key}:`, drawings[key]);
          this.extractTextFromSingleDrawing(drawings[key], images);
        });
      }
    } catch (e) {
      console.warn('提取drawings文本框失败:', e);
    }
  }

  /**
   * 从单个drawing中提取文本框
   * @param {Object} drawing - 单个drawing对象
   * @param {Array} images - 图片数组（用于添加文本框）
   */
  extractTextFromSingleDrawing(drawing, images) {
    try {
      if (!drawing || typeof drawing !== 'object') {
        return;
      }
      
      console.log('处理单个drawing:', drawing);
      console.log('drawing属性:', Object.keys(drawing));
      
      // 检查drawing的所有属性，寻找文字内容
      Object.keys(drawing).forEach(key => {
        const value = drawing[key];
        console.log(`drawing.${key}:`, value);
        
        // 如果值是对象，检查是否有文字属性
        if (value && typeof value === 'object') {
          if (value.text || value.content || value.value) {
            const text = value.text || value.content || value.value;
            console.log(`在drawing.${key}中找到文字:`, text);
            
            const textInfo = {
              text: text.toString(),
              x: drawing.x || value.x || 0,
              y: drawing.y || value.y || 0,
              width: drawing.width || value.width || 100,
              height: drawing.height || value.height || 50,
              type: 'text'
            };
            
            console.log('添加文本框信息:', textInfo);
            images.push(textInfo);
          }
        }
      });
      
      // 检查是否有文本框相关的属性
      if (drawing.textBox || drawing.textbox || drawing.text) {
        const textBox = drawing.textBox || drawing.textbox || drawing.text;
        console.log('找到文本框:', textBox);
        
        if (textBox && textBox.text) {
          const textInfo = {
            text: textBox.text,
            x: drawing.x || 0,
            y: drawing.y || 0,
            width: drawing.width || 100,
            height: drawing.height || 50,
            type: 'text'
          };
          
          console.log('添加文本框信息:', textInfo);
          images.push(textInfo);
        }
      }
      
      // 检查是否有形状相关的属性
      if (drawing.shape || drawing.shapes) {
        const shapes = Array.isArray(drawing.shapes) ? drawing.shapes : [drawing.shape];
        shapes.forEach(shape => {
          if (shape && shape.text) {
            const textInfo = {
              text: shape.text,
              x: shape.x || drawing.x || 0,
              y: shape.y || drawing.y || 0,
              width: shape.width || drawing.width || 100,
              height: shape.height || drawing.height || 50,
              type: 'text'
            };
            
            console.log('添加形状文字信息:', textInfo);
            images.push(textInfo);
          }
        });
      }
      
    } catch (e) {
      console.warn('处理单个drawing失败:', e);
    }
  }

  /**
   * 从workbook中提取文本框
   * @param {Object} workbook - Excel workbook对象
   * @param {Array} images - 图片数组（用于添加文本框）
   */
  extractTextFromWorkbook(workbook, images) {
    try {
      console.log('开始从workbook提取文本框...');
      console.log('workbook属性:', Object.keys(workbook));
      
      // 检查workbook的各种可能属性
      const possibleTextProperties = [
        'drawings', '_drawings', 'textBoxes', '_textBoxes',
        'shapes', '_shapes', 'objects', '_objects',
        'media', '_media', 'texts', '_texts'
      ];
      
      possibleTextProperties.forEach(prop => {
        if (workbook[prop]) {
          console.log(`找到workbook.${prop}:`, workbook[prop]);
          this.extractTextFromDrawings(workbook[prop], images);
        }
      });
      
    } catch (e) {
      console.warn('从workbook提取文本框失败:', e);
    }
  }

  /**
   * 从worksheet属性中提取文本框
   * @param {Object} worksheet - Excel worksheet对象
   * @param {Array} images - 图片数组（用于添加文本框）
   */
  extractTextFromWorksheetProperties(worksheet, images) {
    try {
      console.log('开始从worksheet属性提取文本框...');
      
      // 检查worksheet的各种可能属性
      const possibleTextProperties = [
        'textBoxes', '_textBoxes', 'shapes', '_shapes',
        'objects', '_objects', 'media', '_media',
        'texts', '_texts', 'annotations', '_annotations',
        'comments', '_comments', 'notes', '_notes'
      ];
      
      possibleTextProperties.forEach(prop => {
        if (worksheet[prop]) {
          console.log(`找到worksheet.${prop}:`, worksheet[prop]);
          this.extractTextFromDrawings(worksheet[prop], images);
        }
      });
      
      // 检查worksheet.model的各种属性
      if (worksheet.model) {
        console.log('检查worksheet.model属性...');
        possibleTextProperties.forEach(prop => {
          if (worksheet.model[prop]) {
            console.log(`找到worksheet.model.${prop}:`, worksheet.model[prop]);
            this.extractTextFromDrawings(worksheet.model[prop], images);
          }
        });
      }
      
    } catch (e) {
      console.warn('从worksheet属性提取文本框失败:', e);
    }
  }

  // 使用依赖注入的方法
  calculateOffsets(worksheet) {
    if (this.dependencies.calculateOffsets) {
      return this.dependencies.calculateOffsets(worksheet);
    }
    throw new Error('calculateOffsets方法未提供');
  }

  getCellPixelBoundsPrecise(row, col, worksheet) {
    if (this.dependencies.getCellPixelBoundsPrecise) {
      return this.dependencies.getCellPixelBoundsPrecise(row, col, worksheet);
    }
    throw new Error('getCellPixelBoundsPrecise方法未提供');
  }
}
