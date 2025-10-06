/**
 * 图片Frame处理工具类
 * 负责Excel图片的frame生成和图片适配功能
 */

/**
 * 根据Excel图片锚点生成对应的frame矩形
 * @param {Object} drawing - Excel图片的drawing对象
 * @param {Array} rowOffsets - 行偏移量数组
 * @param {Array} colOffsets - 列偏移量数组
 * @param {Function} getCellPixelBoundsPrecise - 获取单元格精确像素边界的函数
 * @returns {Object} frame矩形 {x, y, width, height}
 */
export function createFrameFromImageAnchor(drawing, rowOffsets, colOffsets, getCellPixelBoundsPrecise) {
  try {
    if (!drawing || !drawing.range) {
      console.warn('drawing对象或range不存在');
      return null;
    }

    const range = drawing.range;
    const tl = range.tl;
    const br = range.br || range.ext; // 兼容不同的Excel格式

    if (!tl) {
      console.warn('图片锚点tl不存在');
      return null;
    }

    // 计算左上角位置
    const tlCellBounds = getCellPixelBoundsPrecise(tl.row, tl.col, drawing.worksheet);
    
    // EMU到像素的转换函数
    const emuToPx = (emu) => {
      if (!emu || emu === 0) return 0;
      const numEmu = typeof emu === 'number' ? emu : parseFloat(emu);
      if (isNaN(numEmu)) return 0;
      // 1英寸 = 914400 EMU, 1英寸 = 96像素
      return (numEmu * 96) / 914400;
    };

    // 计算frame的左上角位置（包含native偏移）
    const frameX = tlCellBounds.x + emuToPx(tl.nativeColOffset);
    const frameY = tlCellBounds.y + emuToPx(tl.nativeRowOffset);

    let frameWidth, frameHeight;

    if (br) {
      // 有右下角锚点，计算完整尺寸
      const brCellBounds = getCellPixelBoundsPrecise(br.row, br.col, drawing.worksheet);
      const brX = brCellBounds.x + emuToPx(br.nativeColOffset);
      const brY = brCellBounds.y + emuToPx(br.nativeRowOffset);
      
      frameWidth = brX - frameX;
      frameHeight = brY - frameY;
    } else {
      // 没有右下角锚点，使用单个单元格的尺寸
      frameWidth = tlCellBounds.width;
      frameHeight = tlCellBounds.height;
    }

    // 如果计算出的尺寸太小，使用单元格的默认尺寸
    if (frameWidth <= 1 || frameHeight <= 1) {
      console.warn('计算出的frame尺寸太小，使用单元格默认尺寸');
      frameWidth = Math.max(100, tlCellBounds.width); // 最小100px
      frameHeight = Math.max(50, tlCellBounds.height); // 最小50px
    }

    // 确保尺寸为正数
    frameWidth = Math.max(1, frameWidth);
    frameHeight = Math.max(1, frameHeight);

    const frameRect = {
      x: Math.round(frameX),
      y: Math.round(frameY),
      width: Math.round(frameWidth),
      height: Math.round(frameHeight)
    };

    // 只在尺寸异常时输出日志
    if (frameRect.width <= 10 || frameRect.height <= 10) {
      console.log(`生成图片frame: 位置(${frameRect.x}, ${frameRect.y}), 尺寸${frameRect.width}x${frameRect.height}`);
    }
    return frameRect;

  } catch (error) {
    console.warn('创建图片frame失败:', error);
    return null;
  }
}

/**
 * 将图片适配到指定的frame中（contain模式）
 * @param {Object} imageInfo - 图片信息对象
 * @param {Object} frameRect - frame矩形 {x, y, width, height}
 * @param {number} padding - 内边距，默认0像素
 * @returns {Object} 适配后的图片位置和尺寸 {x, y, width, height}
 */
export function placeImageIntoFrame(imageInfo, frameRect, padding = 0) {
  try {
    // 项目级常量：内边距和描边（改为0以避免图片被裁剪）
    const CELL_PADDING = 0;
    const FRAME_STROKE = 0;
    const totalPadding = padding + CELL_PADDING + FRAME_STROKE;
    
    // 获取原始图片尺寸
    const originalWidth = Math.max(1, imageInfo.originalWidth || imageInfo.width || 1);
    const originalHeight = Math.max(1, imageInfo.originalHeight || imageInfo.height || 1);

    // 计算frame内的可用空间（统一预留内边距与描边）
    const availableWidth = Math.max(1, frameRect.width - totalPadding * 2);
    const availableHeight = Math.max(1, frameRect.height - totalPadding * 2);

    // 计算contain缩放比例（允许放大到贴满frame）
    const scaleX = availableWidth / originalWidth;
    const scaleY = availableHeight / originalHeight;
    const scale = Math.min(scaleX, scaleY); // 移除,1限制，允许放大到贴满

    // 计算适配后的尺寸
    const fittedWidth = Math.round(originalWidth * scale);
    const fittedHeight = Math.round(originalHeight * scale);

    // 确保尺寸不为0（TLDraw v3要求）
    const finalWidth = Math.max(1, fittedWidth);
    const finalHeight = Math.max(1, fittedHeight);

    // 在frame内居中
    const fittedX = frameRect.x + (frameRect.width - finalWidth) / 2;
    const fittedY = frameRect.y + (frameRect.height - finalHeight) / 2;

    const result = {
      x: Math.round(fittedX),
      y: Math.round(fittedY),
      width: finalWidth,
      height: finalHeight
    };

    console.log(`图片适配到frame: 原图(${originalWidth}x${originalHeight}) -> 适配后(${result.width}x${result.height}), 位置(${result.x}, ${result.y}), 缩放比例: ${scale.toFixed(3)}`);
    return result;

  } catch (error) {
    console.warn('图片适配到frame失败:', error);
    // 返回原始位置作为后备
    return {
      x: imageInfo.x || 0,
      y: imageInfo.y || 0,
      width: imageInfo.width || 100,
      height: imageInfo.height || 100
    };
  }
}

/**
 * 为图片数组生成对应的frame并适配图片
 * @param {Array} images - 图片数组
 * @param {Function} createFrameFromImageAnchor - 创建frame的函数
 * @param {Function} placeImageIntoFrame - 适配图片的函数
 * @returns {Object} {adjustedImages, imageFrames}
 */
export function processImagesWithFrames(images, createFrameFromImageAnchor, placeImageIntoFrame) {
  const imageFrames = [];
  const adjustedImages = [...images];

  for (let i = 0; i < adjustedImages.length; i++) {
    const imageInfo = adjustedImages[i];
    if (imageInfo.frameRect) {
      // 检查frame尺寸是否太小
      let frameRect = imageInfo.frameRect;
      
      if (frameRect.width <= 1 || frameRect.height <= 1) {
        console.warn(`图片${i + 1}的frame尺寸太小(${frameRect.width}x${frameRect.height})，使用图片原始尺寸`);
        // 使用图片的原始尺寸作为frame
        frameRect = {
          x: frameRect.x,
          y: frameRect.y,
          width: Math.max(100, imageInfo.originalWidth || 200),
          height: Math.max(50, imageInfo.originalHeight || 150)
        };
      }
      
      // 创建frame信息
      const frameInfo = {
        ...frameRect,
        type: 'frame',
        id: `frame:image${i}` // 生成唯一的frame ID
      };
      imageFrames.push(frameInfo);
      
      // 将图片适配到frame中
      const fittedImage = placeImageIntoFrame(imageInfo, frameRect, 0);
      adjustedImages[i] = {
        ...imageInfo,
        x: fittedImage.x,
        y: fittedImage.y,
        width: fittedImage.width,
        height: fittedImage.height
      };
    }
  }
  return { adjustedImages, imageFrames };
}

/**
 * 创建图片frame的形状对象
 * @param {Object} frameInfo - frame信息
 * @param {number} scale - 缩放比例
 * @returns {Object} TLDraw形状对象
 */
export function createImageFrameShape(frameInfo, scale = 1) {
  const frameX = frameInfo.x * scale;
  const frameY = frameInfo.y * scale;
  const frameW = frameInfo.width * scale;
  const frameH = frameInfo.height * scale;
  
  if (isNaN(frameX) || isNaN(frameY) || isNaN(frameW) || isNaN(frameH)) {
    console.warn('frame元素坐标无效，跳过:', { 
      frameInfo, 
      frameX, 
      frameY, 
      frameW, 
      frameH,
      scale 
    });
    return null;
  }
  
  // 判断是否为图片frame（通过ID判断）
  const isImageFrame = frameInfo.id && frameInfo.id.startsWith('frame:image');
  
  return {
    type: 'geo',
    x: frameX,
    y: frameY,
    props: {
      geo: 'rectangle',
      w: frameW,
      h: frameH,
      fill: 'none',
      color: isImageFrame ? 'red' : 'black', // 图片frame用红色，表格frame用黑色
      dash: isImageFrame ? 'dashed' : 'solid' // 图片frame用虚线，表格frame用实线
    }
  };
}

/**
 * 在图片提取过程中添加frame信息
 * @param {Object} imageInfo - 原始图片信息
 * @param {Object} frameRect - 生成的frame矩形
 * @param {number} imageIndex - 图片索引
 * @returns {Object} 包含frame信息的图片对象
 */
export function addFrameInfoToImage(imageInfo, frameRect, imageIndex) {
  return {
    ...imageInfo,
    frameRect: frameRect, // 保存生成的frame信息
    imageIndex: imageIndex // 用于生成唯一的frame ID
  };
}

/**
 * 验证图片是否完全在frame内
 * @param {Object} imageInfo - 图片信息
 * @param {Object} frameRect - frame矩形
 * @returns {boolean} 是否完全在frame内
 */
export function isImageWithinFrame(imageInfo, frameRect) {
  return imageInfo.x >= frameRect.x && 
         imageInfo.y >= frameRect.y &&
         imageInfo.x + imageInfo.width <= frameRect.x + frameRect.width &&
         imageInfo.y + imageInfo.height <= frameRect.y + frameRect.height;
}

/**
 * 计算图片的缩放比例
 * @param {Object} originalSize - 原始尺寸 {width, height}
 * @param {Object} fittedSize - 适配后尺寸 {width, height}
 * @returns {number} 缩放比例
 */
export function calculateImageScale(originalSize, fittedSize) {
  const scaleX = fittedSize.width / originalSize.width;
  const scaleY = fittedSize.height / originalSize.height;
  return Math.min(scaleX, scaleY);
}
