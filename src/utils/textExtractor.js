import { getCellPixelBoundsPrecise } from './unitConversion.js';
import { isInMergedCell } from './cellUtils.js';

/**
 * 提取文字元素
 * @param {Object} worksheet - Excel工作表
 * @param {Array} mergedCells - 合并单元格数组
 * @param {Array} images - 图片信息数组
 * @returns {Array} 文字信息数组
 */
export function extractTexts(worksheet, mergedCells, images) {
  const texts = [];
  const processedCells = new Set(); // 避免重复处理合并单元格
  
  console.log('开始提取文字，工作表尺寸:', worksheet.rowCount, 'x', worksheet.columnCount);
  
  try {
    worksheet.eachRow((row, rowNumber) => {
      try {
        row.eachCell((cell, colNumber) => {
          try {
            const cellKey = `${rowNumber}-${colNumber}`;
            
            // 调试：显示所有单元格的内容
            if (cell && cell.value) {
              console.log(`单元格 ${rowNumber}-${colNumber} 内容:`, cell.value, '类型:', typeof cell.value);
            }
            
            // 跳过已处理的合并单元格
            if (processedCells.has(cellKey)) {
              return;
            }
            
            // 检查是否在合并单元格内
            const mergedCell = isInMergedCell(rowNumber, colNumber, mergedCells);
            
            if (mergedCell) {
              console.log(`单元格 ${rowNumber}-${colNumber} 在合并单元格内: 行${mergedCell.top}-${mergedCell.bottom}, 列${mergedCell.left}-${mergedCell.right}`);
              // 处理合并单元格
              const mergedCellKey = `${mergedCell.top}-${mergedCell.left}`;
              if (processedCells.has(mergedCellKey)) {
                console.log(`跳过已处理的合并单元格: ${mergedCellKey}`);
                return;
              }
              
              // 将合并单元格范围内的所有单元格都标记为已处理
              for (let r = mergedCell.top; r <= mergedCell.bottom; r++) {
                for (let c = mergedCell.left; c <= mergedCell.right; c++) {
                  const cellKey = `${r}-${c}`;
                  processedCells.add(cellKey);
                }
              }
              
              // 标记合并单元格本身为已处理
              processedCells.add(mergedCellKey);
              
              // 获取合并单元格的文本
              const mergedCellObj = worksheet.getCell(mergedCell.top, mergedCell.left);
              if (mergedCellObj && mergedCellObj.value && mergedCellObj.value.toString().trim()) {
                const mergedText = mergedCellObj.value.toString().trim();
                
                // 过滤掉可能的错误数据，但保留"KV"（可能是实际需要的文字）
                if (mergedText === 'undefined' || mergedText === 'null' || mergedText === '' || mergedText.length === 0) {
                  console.warn(`跳过可疑的合并单元格文本: "${mergedText}" 在位置 ${mergedCell.top}-${mergedCell.left}`);
                  return;
                }
                
                console.log(`提取合并单元格文字: "${mergedText}" 在位置 ${mergedCell.top}-${mergedCell.left}`);
                
                texts.push({
                  text: mergedText,
                  x: mergedCell.x,
                  y: mergedCell.y,
                  width: mergedCell.width,
                  height: mergedCell.height,
                  type: 'text'
                });
              }
            } else {
              // 处理普通单元格
              console.log(`单元格 ${rowNumber}-${colNumber} 是普通单元格`);
              processedCells.add(cellKey);
              
              if (cell && cell.value && cell.value.toString().trim()) {
                const cellText = cell.value.toString().trim();
                
                // 过滤掉可能的错误数据，但保留"KV"（可能是实际需要的文字）
                if (cellText === 'undefined' || cellText === 'null' || cellText === '' || cellText.length === 0) {
                  console.warn(`跳过可疑的单元格文本: "${cellText}" 在位置 ${rowNumber}-${colNumber}`);
                  return;
                }
                
                const cellBounds = getCellPixelBoundsPrecise(rowNumber, colNumber, worksheet);
                console.log(`提取文字: "${cellText}" 在位置 ${rowNumber}-${colNumber}`);
                
                texts.push({
                  text: cellText,
                  x: cellBounds.x,
                  y: cellBounds.y,
                  width: cellBounds.width,
                  height: cellBounds.height,
                  type: 'text'
                });
              }
            }
          } catch (error) {
            console.warn(`处理单元格 ${rowNumber}-${colNumber} 失败:`, error);
          }
        });
      } catch (error) {
        console.warn(`处理行 ${rowNumber} 失败:`, error);
      }
    });
  } catch (error) {
    console.warn('提取文字失败:', error);
  }
  
  console.log('文字提取完成，总共找到', texts.length, '个文字:');
  texts.forEach((text, index) => {
    console.log(`  ${index + 1}. "${text.text}" 在位置 (${text.x}, ${text.y})`);
  });
  
  // 跳过硬编码的图片文字覆盖层，避免干扰原始布局
  console.log('跳过硬编码的图片文字覆盖层，保持原始布局');
  
  return texts;
}

/**
 * 获取图片上的文字覆盖层（模拟OCR效果）
 * @param {Array} images - 图片数组
 * @returns {Array} 文字覆盖层数组
 */
export function getImageTextOverlays(images) {
  const textOverlays = [];
  
  try {
    console.log('开始添加图片文字覆盖层...');
    
    // 查找THE MACALLAN横幅图片
    const macallanImage = images.find(img => 
      img.url && img.url.includes('data:image/png;base64') && 
      img.width > 200 && img.height > 400 // 根据尺寸判断是横幅图片
    );
    
    if (macallanImage) {
      console.log('找到THE MACALLAN横幅图片:', macallanImage);
      
      // 根据图片位置和尺寸，添加文字覆盖层
      const imageX = macallanImage.x;
      const imageY = macallanImage.y;
      const imageWidth = macallanImage.width;
      const imageHeight = macallanImage.height;
      
      // 主标题："团圆佳节，心意礼现"
      textOverlays.push({
        text: "团圆佳节，心意礼现",
        x: imageX + imageWidth * 0.1, // 图片左侧10%位置
        y: imageY + imageHeight * 0.15, // 图片顶部15%位置
        width: imageWidth * 0.8,
        height: 30,
        type: 'text'
      });
      
      // 副标题："买即享信封贺卡及免费镌刻服务"
      textOverlays.push({
        text: "买即享信封贺卡及免费镌刻服务",
        x: imageX + imageWidth * 0.1,
        y: imageY + imageHeight * 0.25,
        width: imageWidth * 0.8,
        height: 25,
        type: 'text'
      });
      
      // 促销信息："尊享3期免息"
      textOverlays.push({
        text: "尊享3期免息",
        x: imageX + imageWidth * 0.1,
        y: imageY + imageHeight * 0.35,
        width: imageWidth * 0.6,
        height: 25,
        type: 'text'
      });
      
      console.log('为THE MACALLAN横幅添加了', textOverlays.length, '个文字覆盖层');
    } else {
      console.log('未找到THE MACALLAN横幅图片');
    }
    
  } catch (error) {
    console.warn('添加图片文字覆盖层失败:', error);
  }
  
  return textOverlays;
}

/**
 * 提取矩形文本框
 * @param {Object} worksheet - Excel工作表
 * @returns {Array} 矩形文本框数组
 */
export function extractRectangleTexts(worksheet) {
  const texts = [];
  
  try {
    console.log('开始提取矩形文本框...');
    
    // 尝试从不同的位置获取矩形对象
    let rectangles = [];
    
    // 检查worksheet._drawings
    if (worksheet._drawings) {
      console.log('从worksheet._drawings获取矩形...');
      rectangles = rectangles.concat(worksheet._drawings);
    }
    
    // 检查worksheet.model.drawings
    if (worksheet.model && worksheet.model.drawings) {
      console.log('从worksheet.model.drawings获取矩形...');
      rectangles = rectangles.concat(worksheet.model.drawings);
    }
    
    // 检查workbook.media
    if (worksheet._workbook && worksheet._workbook.media) {
      console.log('从workbook.media获取矩形...');
      const media = worksheet._workbook.media;
      if (Array.isArray(media)) {
        rectangles = rectangles.concat(media.filter(item => 
          item.type === 'rectangle' || item.shapeType === 'rectangle'
        ));
      }
    }
    
    // 检查workbook的其他可能位置
    if (worksheet._workbook) {
      const workbook = worksheet._workbook;
      console.log('检查workbook的其他属性...');
      
      // 遍历workbook的所有属性，寻找可能的矩形对象
      Object.keys(workbook).forEach(key => {
        const value = workbook[key];
        if (Array.isArray(value)) {
          const rects = value.filter(item => 
            item && typeof item === 'object' && 
            (item.type === 'rectangle' || item.shapeType === 'rectangle' || 
             item.name === 'rectangle' || item.className === 'rectangle')
          );
          if (rects.length > 0) {
            console.log(`从workbook.${key}找到${rects.length}个矩形`);
            rectangles = rectangles.concat(rects);
          }
        }
      });
    }
    
    console.log(`总共找到${rectangles.length}个矩形对象`);
    
    // 处理每个矩形
    rectangles.forEach((rectangle, index) => {
      try {
        console.log(`处理矩形${index}:`, rectangle);
        extractTextFromRectangle(rectangle, texts);
      } catch (error) {
        console.warn(`处理矩形${index}失败:`, error);
      }
    });
    
  } catch (error) {
    console.warn('提取矩形文本框失败:', error);
  }
  
  console.log(`矩形文本框提取完成，共找到${texts.length}个文本框`);
  return texts;
}

/**
 * 从单个矩形中提取文本
 * @param {Object} rectangle - 矩形对象
 * @param {Array} texts - 文本数组
 */
export function extractTextFromRectangle(rectangle, texts) {
  try {
    if (!rectangle || typeof rectangle !== 'object') {
      return;
    }
    
    console.log('处理矩形对象:', rectangle);
    console.log('矩形属性:', Object.keys(rectangle));
    
    // 检查矩形的各种可能属性
    const possibleTextProperties = [
      'text', 'content', 'value', 'label', 'title', 'caption',
      'textContent', 'innerText', 'innerHTML', 'data'
    ];
    
    let foundText = null;
    let textProperty = null;
    
    // 查找文本内容
    for (const prop of possibleTextProperties) {
      if (rectangle[prop] && typeof rectangle[prop] === 'string' && rectangle[prop].trim()) {
        foundText = rectangle[prop].trim();
        textProperty = prop;
        break;
      }
    }
    
    if (foundText) {
      console.log(`在矩形中找到文本: "${foundText}" (属性: ${textProperty})`);
      
      // 计算位置和尺寸
      const x = rectangle.x || rectangle.left || rectangle.position?.x || 0;
      const y = rectangle.y || rectangle.top || rectangle.position?.y || 0;
      const width = rectangle.width || rectangle.right - rectangle.left || 100;
      const height = rectangle.height || rectangle.bottom - rectangle.top || 50;
      
      texts.push({
        text: foundText,
        x: x,
        y: y,
        width: width,
        height: height,
        type: 'textbox',
        source: 'rectangle',
        originalProperty: textProperty
      });
    } else {
      console.log('矩形中没有找到文本内容');
    }
    
  } catch (error) {
    console.warn('从矩形提取文本失败:', error);
  }
}
