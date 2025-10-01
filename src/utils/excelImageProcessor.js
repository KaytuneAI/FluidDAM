/**
 * Excel图片处理模块
 * 负责从Excel文件中提取、处理和适配图片
 */

// 已删除frame处理工具导入，直接在类中实现位置计算

/**
 * Excel图片处理器类
 */
export class ExcelImageProcessor {
  constructor(scale = 1, dependencies = {}, options = {}) {
    this.scale = scale;
    this.dependencies = dependencies;
    // 图片适配模式：'anchor' 优先使用锚点尺寸，'cell' 强制适配单元格高度
    this.fitMode = options.fitMode || 'anchor'; // 默认改为anchor模式
    // 最小显示阈值（像素）
    this.minDisplaySize = options.minDisplaySize || 20;
    // 最小尺寸配置
    this.minSize = options.minSize || { w: 34, h: 34 };
  }

  /**
   * 尺寸选择函数 - 根据策略选择最终尺寸
   */
  pickTargetSize(displaySizePx, rawSizePx, cellHeightPx, options = {}) {
    const minW = options?.minSize?.w ?? this.minSize.w;
    const minH = options?.minSize?.h ?? this.minSize.h;

    if (options?.fitMode === 'anchor' && displaySizePx) {
      return {
        w: Math.max(displaySizePx.w, minW),
        h: Math.max(displaySizePx.h, minH),
        source: 'anchor',
      };
    }
    
    // fallback: 维持现有 cell 高度适配逻辑
    const scale = cellHeightPx / rawSizePx.h;
    return {
      w: Math.max(Math.round(rawSizePx.w * scale), minW),
      h: Math.max(Math.round(rawSizePx.h * scale), minH),
      source: 'cell',
    };
  }

  /**
   * 提取图片元素
   * @param {Object} worksheet - Excel工作表
   * @returns {Array} 图片信息数组
   */
  async extractImages(worksheet) {
    const images = [];
    const processedImages = new Set(); // 避免重复处理同一张图片
    
    // 统计信息
    const stats = {
      total: 0,
      br_anchor: 0,
      ext_size: 0,
      original_scaled: 0,
      default: 0,
      failed: 0
    };
    
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
          stats.total++;
          
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
          
          if (imageInfo) {
            // 直接使用图片信息，不添加frame信息
            images.push(imageInfo);
            
            // 统计尺寸来源
            if (imageInfo.sizeSource) {
              stats[imageInfo.sizeSource] = (stats[imageInfo.sizeSource] || 0) + 1;
            }
          } else {
            stats.failed++;
          }
        } catch (error) {
          console.warn('处理图片失败:', error);
          stats.failed++;
        }
      }
    } catch (error) {
      console.warn('提取图片失败:', error);
    }
    
    // 按照brief要求的统计格式
    console.log('\n📊 图片处理统计:');
    console.log(`   总图片数: ${stats.total}`);
    console.log(`   useTo: ${stats.br_anchor} (有右下角锚点)`);
    console.log(`   useExt: ${stats.ext_size} (有扩展尺寸)`);
    console.log(`   useDefault: ${stats.default} (使用默认尺寸)`);
    console.log(`   useOriginal: ${stats.original_scaled} (原始尺寸缩放)`);
    console.log(`   处理失败: ${stats.failed}`);
    console.log(`   成功处理: ${images.length}张图片\n`);
    
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
    // 直接计算图片位置和尺寸，不使用frame概念
    let x = 0, y = 0, width = 0, height = 0;
    let sizeSource = 'unknown'; // 添加sizeSource变量定义
    
    if (image.range) {
      const range = image.range;
      const tl = range.tl;
      // 分别处理 br 和 ext 两种不同的格式

      if (tl) {
        // 计算左上角位置
        const tlCellBounds = this.getCellPixelBoundsPrecise(tl.row, tl.col, worksheet);
        
        // EMU到像素的转换函数
        const emuToPx = (emu) => {
          if (!emu || emu === 0) return 0;
          const numEmu = typeof emu === 'number' ? emu : parseFloat(emu);
          if (isNaN(numEmu)) return 0;
          // 1英寸 = 914400 EMU, 1英寸 = 96像素
          return (numEmu * 96) / 914400;
        };

        // 计算图片的左上角位置（包含native偏移）
        x = tlCellBounds.x + emuToPx(tl.nativeColOffset);
        y = tlCellBounds.y + emuToPx(tl.nativeRowOffset);

        // 改进的尺寸获取优先级逻辑
        let sizeSource = 'unknown';
        let hasValidSize = false;
        
        if (range.br) {
          // 优先级1: 有右下角锚点，计算完整尺寸
          const brCellBounds = this.getCellPixelBoundsPrecise(range.br.row, range.br.col, worksheet);
          const brX = brCellBounds.x + emuToPx(range.br.nativeColOffset);
          const brY = brCellBounds.y + emuToPx(range.br.nativeRowOffset);
          
          width = brX - x;
          height = brY - y;
          sizeSource = 'br_anchor';
          hasValidSize = true;
          console.log(`✅ 使用br锚点计算尺寸: ${width}x${height}`);
        } else if (range.ext && (range.ext.cx || range.ext['@_cx'])) {
          // 优先级2: 有扩展尺寸，直接使用ext的cx和cy
          // 兼容两种属性名格式：cx/cy 和 @_cx/@_cy
          const extWidth = range.ext.cx || range.ext['@_cx'];
          const extHeight = range.ext.cy || range.ext['@_cy'];
          
          if (extWidth && extHeight && extWidth > 0 && extHeight > 0) {
            width = emuToPx(extWidth);
            height = emuToPx(extHeight);
            sizeSource = 'ext_size';
            hasValidSize = true;
            console.log(`✅ 使用ext扩展尺寸: ${width}x${height} (原始值:${extWidth}x${extHeight})`);
          }
        }
        
        // 优先级3: 尝试从图片原始尺寸计算合适的显示尺寸
        if (!hasValidSize) {
          // 获取图片原始尺寸（如果可用）
          const originalWidth = image.width || image.originalWidth || 100;
          const originalHeight = image.height || image.originalHeight || 100;
          
          if (originalWidth > 0 && originalHeight > 0) {
            // 根据原始尺寸和单元格大小计算合适的显示尺寸
            const cellWidth = tlCellBounds.width;
            const cellHeight = tlCellBounds.height;
            
            // 计算缩放比例，使图片能完整显示在合理范围内
            const scaleX = cellWidth / originalWidth;
            const scaleY = cellHeight / originalHeight;
            const scale = Math.min(scaleX, scaleY, 1); // 不放大，只缩小
            
            width = Math.max(originalWidth * scale, cellWidth * 1.5); // 至少1.5个单元格宽
            height = Math.max(originalHeight * scale, cellHeight * 2); // 至少2个单元格高
            
            sizeSource = 'original_scaled';
            hasValidSize = true;
            console.log(`✅ 使用原始尺寸缩放: ${width}x${height} (原始:${originalWidth}x${originalHeight}, 缩放:${scale.toFixed(2)})`);
          }
        }
        
        // 优先级4: 最后兜底，使用默认尺寸
        if (!hasValidSize) {
          const cellWidth = tlCellBounds.width;
          const cellHeight = tlCellBounds.height;
          
          // 使用更合理的默认尺寸
          width = cellWidth * 2;  // 2个单元格宽
          height = cellHeight * 3; // 3个单元格高
          sizeSource = 'default';
          
          console.log(`⚠️ 使用默认显示尺寸: ${width}x${height} (基于单元格${cellWidth}x${cellHeight})`);
        }

        // 确保尺寸不会太小
        if (width <= 50 || height <= 50) {
          console.warn('计算出的图片尺寸太小，使用最小显示尺寸');
          width = Math.max(120, width);  // 最小120px宽
          height = Math.max(100, height); // 最小100px高
        }

        // 确保尺寸为正数
        width = Math.max(1, width);
        height = Math.max(1, height);

        // 按照brief要求的日志格式
        const anchorType = range.br ? 'twoCell' : 'oneCell';
        const fromInfo = `(${tl.row},${tl.col},${tl.nativeColOffset},${tl.nativeRowOffset})`;
        const toInfo = range.br ? `(${range.br.row},${range.br.col},${range.br.nativeColOffset},${range.br.nativeRowOffset})` : 'NA';
        const extInfo = range.ext ? `${range.ext.cx || range.ext['@_cx'] || '无'},${range.ext.cy || range.ext['@_cy'] || '无'} emu` : 'NA';
        
        console.log(`📌 图片锚点解析:`);
        console.log(`   anchorType: ${anchorType}`);
        console.log(`   from=${fromInfo}`);
        console.log(`   to=${toInfo}`);
        console.log(`   ext=(${extInfo})`);
        console.log(`   → displaySize(px)=(${Math.round(width)}×${Math.round(height)})`);
        console.log(`   source=${sizeSource}`);
        console.log(`   位置: (${Math.round(x)},${Math.round(y)})`);
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
    
    // 改进的图片尺寸处理逻辑
    console.log(`📐 锚点尺寸: ${width}x${height}`);
    console.log(`📐 原始尺寸: ${originalWidth}x${originalHeight}px`);
    
    // 使用新的尺寸选择逻辑
    const displaySizePx = (sizeSource === 'br_anchor' || sizeSource === 'ext_size') ? 
      { w: width, h: height } : null;
    const rawSizePx = { w: originalWidth, h: originalHeight };
    const cellHeightPx = 60; // 单元格高度阈值
    
    const targetPicked = this.pickTargetSize(displaySizePx, rawSizePx, cellHeightPx, {
      fitMode: this.fitMode,
      minSize: this.minSize
    });
    
    width = targetPicked.w;
    height = targetPicked.h;
    
    console.log(`🎯 尺寸策略=${this.fitMode} -> 使用${targetPicked.source}尺寸: ${width}x${height}`);
    
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
      col: image.range?.tl?.col || 0,
      sizeSource: sizeSource  // 添加尺寸来源信息
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
