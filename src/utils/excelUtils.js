import * as ExcelJS from 'exceljs';
import { toRichText } from 'tldraw';

/**
 * Excel到TLDraw转换工具类
 * 实现Excel布局到TLDraw画布的转换，保持相对距离和版式
 */
export class ExcelToTLDrawConverter {
  constructor(editor, scale = 1) {
    this.editor = editor;
    this.scale = scale; // 整体缩放系数
    this.batchSize = 100; // 批量处理大小
  }

  /**
   * 单位换算：行高 points -> px
   * @param {number} points - 行高（points）
   * @returns {number} 像素值
   */
  pointsToPx(points) {
    return points * 96 / 72;
  }

  /**
   * 单位换算：列宽 Excel width -> px
   * @param {number} width - Excel列宽
   * @returns {number} 像素值
   */
  columnWidthToPx(width) {
    // Excel列宽近似换算公式（Calibri 11下较稳）
    // 改进：使用更精确的换算，考虑不同字体和缩放
    return Math.floor((width + 0.12) * 7);
  }

  /**
   * 更精确的单元格像素边界计算
   * @param {number} row - 行号（1-based）
   * @param {number} col - 列号（1-based）
   * @param {Object} worksheet - Excel工作表
   * @returns {Object} {x, y, width, height}
   */
  getCellPixelBoundsPrecise(row, col, worksheet) {
    let x = 0;
    let y = 0;

    // 计算X坐标（累加前面所有列的宽度）
    for (let c = 1; c < col; c++) {
      const colObj = worksheet.getColumn(c);
      // 安全获取列宽，使用更精确的换算
      const colWidth = (colObj && colObj.width) ? colObj.width : 8.43;
      x += this.columnWidthToPx(colWidth);
    }

    // 计算Y坐标（累加前面所有行的高度）
    for (let r = 1; r < row; r++) {
      const rowObj = worksheet.getRow(r);
      // 安全获取行高，使用更精确的换算
      const rowHeight = (rowObj && rowObj.height) ? rowObj.height : 15;
      y += this.pointsToPx(rowHeight);
    }

    // 当前单元格的宽高
    const currentCol = worksheet.getColumn(col);
    const currentRow = worksheet.getRow(row);
    
    // 安全获取当前单元格的宽高
    const width = this.columnWidthToPx((currentCol && currentCol.width) ? currentCol.width : 8.43);
    const height = this.pointsToPx((currentRow && currentRow.height) ? currentRow.height : 15);

    return { x, y, width, height };
  }

  /**
   * 计算单元格的像素坐标
   * @param {number} row - 行号（1-based）
   * @param {number} col - 列号（1-based）
   * @param {Object} worksheet - Excel工作表
   * @returns {Object} {x, y, width, height}
   */
  getCellPixelBounds(row, col, worksheet) {
    let x = 0;
    let y = 0;
    let width = 0;
    let height = 0;

    // 计算X坐标（累加前面所有列的宽度）
    for (let c = 1; c < col; c++) {
      const colObj = worksheet.getColumn(c);
      // 安全获取列宽
      const colWidth = (colObj && colObj.width) ? colObj.width : 8.43;
      x += this.columnWidthToPx(colWidth);
    }

    // 计算Y坐标（累加前面所有行的高度）
    for (let r = 1; r < row; r++) {
      const rowObj = worksheet.getRow(r);
      // 安全获取行高
      const rowHeight = (rowObj && rowObj.height) ? rowObj.height : 15;
      y += this.pointsToPx(rowHeight);
    }

    // 当前单元格的宽高
    const currentCol = worksheet.getColumn(col);
    const currentRow = worksheet.getRow(row);
    
    // 安全获取当前单元格的宽高
    width = this.columnWidthToPx((currentCol && currentCol.width) ? currentCol.width : 8.43);
    height = this.pointsToPx((currentRow && currentRow.height) ? currentRow.height : 15);

    return { x, y, width, height };
  }

  /**
   * 将列字母转换为数字 (A=1, B=2, ..., Z=26, AA=27, ...)
   * @param {string} columnLetter - 列字母
   * @returns {number} 列数字
   */
  columnLetterToNumber(columnLetter) {
    let result = 0;
    for (let i = 0; i < columnLetter.length; i++) {
      result = result * 26 + (columnLetter.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
    }
    return result;
  }

  /**
   * 处理合并单元格
   * @param {Object} worksheet - Excel工作表
   * @returns {Array} 合并单元格信息数组
   */
  getMergedCells(worksheet) {
    const mergedCells = [];
    
    try {
      // 尝试不同的方式获取合并单元格信息
      let merges = [];
      
      if (worksheet.model && worksheet.model.merges) {
        merges = worksheet.model.merges;
        console.log('从worksheet.model.merges获取合并单元格:', merges);
      } else if (worksheet.merges) {
        merges = worksheet.merges;
        console.log('从worksheet.merges获取合并单元格:', merges);
      } else if (worksheet._merges) {
        merges = worksheet._merges;
        console.log('从worksheet._merges获取合并单元格:', merges);
      }
      
      console.log('找到的合并单元格数量:', merges.length);
      
      if (merges && merges.length > 0) {
        merges.forEach((merge, index) => {
          try {
            let top, left, bottom, right;
            
            // 处理字符串格式的合并单元格 (如 'D11:G12')
            if (typeof merge === 'string') {
              console.log(`处理字符串格式合并单元格: ${merge}`);
              const match = merge.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
              if (match) {
                const [, startCol, startRow, endCol, endRow] = match;
                left = this.columnLetterToNumber(startCol);
                top = parseInt(startRow);
                right = this.columnLetterToNumber(endCol);
                bottom = parseInt(endRow);
                console.log(`解析结果: 行${top}-${bottom}, 列${left}-${right}`);
              } else {
                console.warn(`无法解析合并单元格字符串: ${merge}`);
                return;
              }
            } else if (typeof merge === 'object' && merge.top !== undefined) {
              // 处理对象格式的合并单元格
              ({ top, left, bottom, right } = merge);
            } else {
              console.warn(`未知的合并单元格格式:`, merge);
              return;
            }
            
            console.log(`合并单元格 ${index}: 行${top}-${bottom}, 列${left}-${right}`);
            
            // 计算合并单元格的像素边界
            const topLeft = this.getCellPixelBoundsPrecise(top, left, worksheet);
            const bottomRight = this.getCellPixelBoundsPrecise(bottom + 1, right + 1, worksheet);
            
            mergedCells.push({
              top,
              left,
              bottom,
              right,
              x: topLeft.x,
              y: topLeft.y,
              width: bottomRight.x - topLeft.x,
              height: bottomRight.y - topLeft.y,
              isMerged: true
            });
          } catch (error) {
            console.warn('处理合并单元格失败:', error);
          }
        });
      } else {
        console.log('未找到合并单元格信息');
      }
    } catch (error) {
      console.warn('获取合并单元格信息失败:', error);
    }
    
    console.log('最终合并单元格数组:', mergedCells);
    return mergedCells;
  }

  /**
   * 检查单元格是否在合并区域内
   * @param {number} row - 行号
   * @param {number} col - 列号
   * @param {Array} mergedCells - 合并单元格数组
   * @returns {Object|null} 合并单元格信息或null
   */
  isInMergedCell(row, col, mergedCells) {
    return mergedCells.find(merge => 
      row >= merge.top && row <= merge.bottom &&
      col >= merge.left && col <= merge.right
    );
  }

  /**
   * 动态分析Excel布局结构，自动识别元素间的关系和比例
   * @param {Object} worksheet - Excel工作表对象
   * @param {Array} images - 图片元素数组
   */
  analyzeLayoutStructure(worksheet, images = []) {
    const layoutInfo = {
      cellDimensions: {},
      elementClusters: [],
      spacing: {},
      scaleFactors: {}
    };
    
    try {
      // 1. 分析单元格尺寸分布
      const rowCount = worksheet.rowCount || 100;
      const colCount = worksheet.columnCount || 50;
      
      const rowHeights = [];
      const colWidths = [];
      
      // 收集所有行高和列宽
      for (let row = 1; row <= Math.min(rowCount, 100); row++) {
        const rowHeight = worksheet.getRow(row)?.height || 15;
        rowHeights.push({ row, height: rowHeight });
      }
      
      for (let col = 1; col <= Math.min(colCount, 50); col++) {
        const colWidth = worksheet.getColumn(col)?.width || 64;
        colWidths.push({ col, width: colWidth });
      }
      
      // 计算统计信息
      const avgRowHeight = rowHeights.reduce((sum, r) => sum + r.height, 0) / rowHeights.length;
      const avgColWidth = colWidths.reduce((sum, c) => sum + c.width, 0) / colWidths.length;
      
      // 识别异常大小的行/列（可能是图片区域）
      const largeRows = rowHeights.filter(r => r.height > avgRowHeight * 1.5);
      const largeCols = colWidths.filter(c => c.width > avgColWidth * 1.5);
      
      layoutInfo.cellDimensions = {
        avgRowHeight,
        avgColWidth,
        totalRows: rowCount,
        totalCols: colCount,
        largeRows,
        largeCols
      };
      
      // 2. 分析图片元素的空间分布
      if (images.length > 0) {
        const imagePositions = images.map(img => ({
          x: img.x,
          y: img.y,
          width: img.width,
          height: img.height,
          row: img.row || 0,
          col: img.col || 0
        }));
        
        // 按Y坐标分组（识别水平行）
        const rows = this.groupElementsByRow(imagePositions);
        
        // 按X坐标分组（识别垂直列）
        const cols = this.groupElementsByColumn(imagePositions);
        
        // 计算元素间的间距
        const spacing = this.calculateElementSpacing(imagePositions, rows, cols);
        
        // 识别元素簇（相近的元素）
        const clusters = this.identifyElementClusters(imagePositions);
        
        layoutInfo.elementClusters = clusters;
        layoutInfo.spacing = spacing;
        layoutInfo.rows = rows;
        layoutInfo.cols = cols;
        
        // 3. 计算缩放因子
        layoutInfo.scaleFactors = this.calculateScaleFactors(imagePositions, avgRowHeight, avgColWidth);
      }
      
      console.log('动态布局分析完成:', layoutInfo);
      
    } catch (error) {
      console.warn('动态布局分析失败:', error);
    }
    
    return layoutInfo;
  }

  /**
   * 按Y坐标分组元素（识别水平行）
   */
  groupElementsByRow(elements) {
    const rows = [];
    const tolerance = 50; // 容差范围
    
    elements.sort((a, b) => a.y - b.y);
    
    for (const element of elements) {
      let foundRow = false;
      for (const row of rows) {
        if (Math.abs(element.y - row.y) <= tolerance) {
          row.elements.push(element);
          foundRow = true;
          break;
        }
      }
      if (!foundRow) {
        rows.push({
          y: element.y,
          elements: [element],
          avgHeight: element.height
        });
      }
    }
    
    // 计算每行的统计信息
    rows.forEach(row => {
      row.elements.sort((a, b) => a.x - b.x);
      row.avgHeight = row.elements.reduce((sum, el) => sum + el.height, 0) / row.elements.length;
      row.width = Math.max(...row.elements.map(el => el.x + el.width)) - Math.min(...row.elements.map(el => el.x));
    });
    
    return rows;
  }

  /**
   * 按X坐标分组元素（识别垂直列）
   */
  groupElementsByColumn(elements) {
    const cols = [];
    const tolerance = 50; // 容差范围
    
    elements.sort((a, b) => a.x - b.x);
    
    for (const element of elements) {
      let foundCol = false;
      for (const col of cols) {
        if (Math.abs(element.x - col.x) <= tolerance) {
          col.elements.push(element);
          foundCol = true;
          break;
        }
      }
      if (!foundCol) {
        cols.push({
          x: element.x,
          elements: [element],
          avgWidth: element.width
        });
      }
    }
    
    // 计算每列的统计信息
    cols.forEach(col => {
      col.elements.sort((a, b) => a.y - b.y);
      col.avgWidth = col.elements.reduce((sum, el) => sum + el.width, 0) / col.elements.length;
      col.height = Math.max(...col.elements.map(el => el.y + el.height)) - Math.min(...col.elements.map(el => el.y));
    });
    
    return cols;
  }

  /**
   * 计算元素间的间距
   */
  calculateElementSpacing(elements, rows, cols) {
    const spacing = {
      horizontal: [],
      vertical: [],
      avgHorizontal: 0,
      avgVertical: 0
    };
    
    // 计算水平间距（同一行内元素间）
    rows.forEach(row => {
      for (let i = 0; i < row.elements.length - 1; i++) {
        const current = row.elements[i];
        const next = row.elements[i + 1];
        const gap = next.x - (current.x + current.width);
        spacing.horizontal.push(gap);
      }
    });
    
    // 计算垂直间距（相邻行间）
    rows.sort((a, b) => a.y - b.y);
    for (let i = 0; i < rows.length - 1; i++) {
      const currentRow = rows[i];
      const nextRow = rows[i + 1];
      const gap = nextRow.y - (currentRow.y + currentRow.avgHeight);
      spacing.vertical.push(gap);
    }
    
    // 计算平均间距
    if (spacing.horizontal.length > 0) {
      spacing.avgHorizontal = spacing.horizontal.reduce((sum, gap) => sum + gap, 0) / spacing.horizontal.length;
    }
    if (spacing.vertical.length > 0) {
      spacing.avgVertical = spacing.vertical.reduce((sum, gap) => sum + gap, 0) / spacing.vertical.length;
    }
    
    return spacing;
  }

  /**
   * 识别元素簇（相近的元素组）
   */
  identifyElementClusters(elements) {
    const clusters = [];
    const visited = new Set();
    const clusterThreshold = 100; // 聚类阈值
    
    for (let i = 0; i < elements.length; i++) {
      if (visited.has(i)) continue;
      
      const cluster = [elements[i]];
      visited.add(i);
      
      // 寻找相近的元素
      for (let j = i + 1; j < elements.length; j++) {
        if (visited.has(j)) continue;
        
        const distance = Math.sqrt(
          Math.pow(elements[i].x - elements[j].x, 2) + 
          Math.pow(elements[i].y - elements[j].y, 2)
        );
        
        if (distance <= clusterThreshold) {
          cluster.push(elements[j]);
          visited.add(j);
        }
      }
      
      if (cluster.length > 1) {
        clusters.push({
          elements: cluster,
          centerX: cluster.reduce((sum, el) => sum + el.x, 0) / cluster.length,
          centerY: cluster.reduce((sum, el) => sum + el.y, 0) / cluster.length,
          avgSize: cluster.reduce((sum, el) => sum + (el.width * el.height), 0) / cluster.length
        });
      }
    }
    
    return clusters;
  }

  /**
   * 计算缩放因子
   */
  calculateScaleFactors(elements, avgRowHeight, avgColWidth) {
    if (elements.length === 0) return { x: 1, y: 1 };
    
    // 计算元素尺寸与单元格尺寸的比例
    const sizeRatios = elements.map(el => ({
      widthRatio: el.width / avgColWidth,
      heightRatio: el.height / avgRowHeight
    }));
    
    // 计算平均比例
    const avgWidthRatio = sizeRatios.reduce((sum, r) => sum + r.widthRatio, 0) / sizeRatios.length;
    const avgHeightRatio = sizeRatios.reduce((sum, r) => sum + r.heightRatio, 0) / sizeRatios.length;
    
    return {
      x: avgWidthRatio,
      y: avgHeightRatio,
      avgWidthRatio,
      avgHeightRatio
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
          
          // 检查是否已经处理过这张图片
          if (processedImages.has(imageId)) {
            console.log('跳过重复的图片:', imageId);
            continue;
          }
          processedImages.add(imageId);
          
          console.log('处理图片:', image, 'ID:', imageId);
          
          // 获取图片数据
          let imageData;
          if (typeof image.getImage === 'function') {
            imageData = await image.getImage();
            console.log('通过getImage()获取图片数据:', imageData);
          } else {
            imageData = image;
            console.log('直接使用图片对象:', imageData);
          }
          
          if (!imageData) {
            console.warn('图片数据为空:', image);
            continue;
          }
          
          // 详细调试图片数据
          console.log('图片数据类型:', typeof imageData);
          console.log('图片数据构造函数:', imageData.constructor?.name);
          console.log('图片数据所有属性:', Object.getOwnPropertyNames(imageData));
          console.log('图片数据所有键:', Object.keys(imageData));
          console.log('图片数据值:', imageData);
          
          // 检查不同的图片数据格式
          let buffer = null;
          
          // 如果有imageId，尝试从workbook获取图片数据
          if (imageData.imageId !== undefined && imageData.imageId !== null) {
            console.log('检测到imageId:', imageData.imageId);
            try {
              // 尝试从workbook获取图片
              const workbook = imageData.worksheet?._workbook;
              console.log('workbook对象:', workbook);
              console.log('workbook可用方法:', workbook ? Object.keys(workbook).filter(k => k.includes('image') || k.includes('Image') || k.includes('get')) : '无');
              
              if (workbook) {
                // 尝试多种方法获取图片
                let imageBuffer = null;
                
                // 方法1: getImage
                if (typeof workbook.getImage === 'function') {
                  try {
                    imageBuffer = await workbook.getImage(imageData.imageId);
                    console.log('通过getImage获取图片数据:', imageBuffer);
                  } catch (e) {
                    console.warn('getImage方法失败:', e);
                  }
                }
                
                // 方法2: 直接从workbook的images属性获取
                if (!imageBuffer && workbook.images) {
                  try {
                    imageBuffer = workbook.images[imageData.imageId];
                    console.log('从workbook.images获取图片数据:', imageBuffer);
                  } catch (e) {
                    console.warn('从workbook.images获取失败:', e);
                  }
                }
                
                // 方法3: 从workbook的_media属性获取
                if (!imageBuffer && workbook._media) {
                  try {
                    imageBuffer = workbook._media[imageData.imageId];
                    console.log('从workbook._media获取图片数据:', imageBuffer);
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
              // ExcelJS可能将数据存储在_data属性中
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
            
            // 如果仍然没有buffer，尝试从所有属性中查找
            if (!buffer) {
              const allKeys = Object.keys(imageData);
              console.log('尝试从所有属性中查找图片数据，可用属性:', allKeys);
              
              for (const key of allKeys) {
                const value = imageData[key];
                if (value instanceof ArrayBuffer || value instanceof Uint8Array) {
                  buffer = value;
                  console.log(`从属性 ${key} 中找到图片数据`);
                  break;
                } else if (value && typeof value === 'object' && (value.buffer || value.data)) {
                  buffer = value.buffer || value.data;
                  console.log(`从属性 ${key} 的嵌套对象中找到图片数据`);
                  break;
                } else if (key === 'worksheet' && value && value._workbook) {
                  // 特别处理worksheet._workbook的情况
                  const workbook = value._workbook;
                  console.log('检查worksheet._workbook中的图片数据');
                  
                  // 尝试从workbook的各种可能属性中获取图片
                  const workbookKeys = Object.keys(workbook);
                  console.log('workbook属性:', workbookKeys);
                  
                  for (const wbKey of workbookKeys) {
                    if (wbKey.includes('image') || wbKey.includes('media') || wbKey.includes('Image')) {
                      const wbValue = workbook[wbKey];
                      console.log(`检查workbook.${wbKey}:`, wbValue);
                      
                      if (wbValue && typeof wbValue === 'object') {
                        // 如果是数组或对象，尝试获取第一个元素
                        const firstItem = Array.isArray(wbValue) ? wbValue[0] : wbValue;
                        if (firstItem && (firstItem.buffer || firstItem.data || firstItem._data)) {
                          buffer = firstItem.buffer || firstItem.data || firstItem._data;
                          console.log(`从workbook.${wbKey}中找到图片数据`);
                          break;
                        }
                      }
                    }
                  }
                  
                  if (buffer) break;
                }
              }
            }
          }
          
          if (!buffer) {
            console.warn('无法获取图片buffer，图片数据格式:', imageData);
            console.warn('图片对象结构:', Object.keys(imageData));
            continue;
          }
          
          // 将buffer转换为base64 URL
          let imageUrl;
          try {
            // 确保buffer是正确的格式
            let uint8Array;
            if (buffer instanceof ArrayBuffer) {
              uint8Array = new Uint8Array(buffer);
            } else if (buffer instanceof Uint8Array) {
              uint8Array = buffer;
            } else {
              console.warn('buffer格式不正确:', typeof buffer, buffer);
              continue;
            }
            
            // 使用更安全的方法转换Base64
            let base64String = '';
            
            try {
              // 方法1: 直接使用btoa转换整个数组
              if (uint8Array.length < 1000000) { // 小于1MB的文件直接转换
                const binaryString = Array.from(uint8Array, byte => String.fromCharCode(byte)).join('');
                base64String = btoa(binaryString);
                console.log('直接转换Base64成功，长度:', base64String.length);
              } else {
                // 大文件分块转换
                const chunkSize = 8192; // 8KB chunks
                for (let i = 0; i < uint8Array.length; i += chunkSize) {
                  const chunk = uint8Array.slice(i, i + chunkSize);
                  const chunkString = Array.from(chunk, byte => String.fromCharCode(byte)).join('');
                  base64String += btoa(chunkString);
                }
                console.log('分块转换Base64成功，长度:', base64String.length);
              }
              
              // 验证Base64字符串
              if (!base64String || base64String.length === 0) {
                throw new Error('Base64字符串为空');
              }
              
              // 检查Base64字符串是否完整（应该能被4整除）
              if (base64String.length % 4 !== 0) {
                // 补齐Base64字符串
                const padding = 4 - (base64String.length % 4);
                base64String += '='.repeat(padding);
                console.log('补齐Base64字符串，添加padding:', padding);
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
            
            imageUrl = `data:${mimeType};base64,${base64String}`;
            
            // 验证URL格式
            if (!imageUrl.startsWith('data:image/') || !imageUrl.includes(';base64,')) {
              throw new Error('生成的URL格式不正确');
            }
            
            // 验证Base64部分
            const base64Part = imageUrl.split(';base64,')[1];
            if (!base64Part || base64Part.length === 0) {
              throw new Error('Base64部分为空');
            }
            
            console.log('创建base64图片URL成功');
            console.log('URL长度:', imageUrl.length);
            console.log('Base64长度:', base64Part.length);
            console.log('URL预览:', imageUrl.substring(0, 100) + '...');
            
            // 测试URL是否有效
            try {
              const testImg = new Image();
              testImg.onload = () => {
                console.log('Base64图片URL验证成功，图片尺寸:', testImg.width, 'x', testImg.height);
              };
              testImg.onerror = () => {
                console.error('Base64图片URL验证失败，图片无法加载');
              };
              testImg.src = imageUrl;
            } catch (e) {
              console.warn('无法测试图片URL:', e);
            }
          } catch (e) {
            console.warn('base64转换失败，跳过此图片:', e);
            continue; // 跳过这个图片，继续处理下一个
          }
          
          // 计算图片位置 - 使用锚点范围计算真实显示尺寸
          let x = 0, y = 0, width = 0, height = 0;
          
          if (image.range && image.range.tl && image.range.br) {
            const anchor = image.range;
            const tl = anchor.tl;
            const br = anchor.br;
            
            // 计算左上角位置（包含native偏移）
            const tlCellBounds = this.getCellPixelBoundsPrecise(tl.row, tl.col, worksheet);
            const brCellBounds = this.getCellPixelBoundsPrecise(br.row, br.col, worksheet);
            
            // 将native偏移从Excel单位转换为像素
            // ExcelJS的native偏移通常是EMU单位，1英寸 = 914400 EMU
            // 改进：添加更精确的单位转换和错误处理
            const emuToPx = (emu) => {
              if (!emu || emu === 0) return 0;
              // 确保是数字类型
              const numEmu = typeof emu === 'number' ? emu : parseFloat(emu);
              if (isNaN(numEmu)) return 0;
              // 1英寸 = 914400 EMU, 1英寸 = 96像素
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
            console.log(`native偏移: tl(${tl.nativeColOffset},${tl.nativeRowOffset}) br(${br.nativeColOffset},${br.nativeRowOffset})`);
            console.log(`计算位置: (${x},${y}) 尺寸: ${width}x${height}`);
          } else if (image.range && image.range.tl) {
            // 如果没有br锚点，回退到只使用tl锚点
            const anchor = image.range;
            const row = anchor.tl.row;
            const col = anchor.tl.col;
            
            const cellBounds = this.getCellPixelBoundsPrecise(row, col, worksheet);
            x = cellBounds.x;
            y = cellBounds.y;
            
            console.log(`图片基础位置: 行${row}列${col}, 位置:(${x},${y})`);
          }
          
          // 获取原始图片的真实尺寸（用于资产创建）
          let originalWidth = imageData.width || 100;
          let originalHeight = imageData.height || 100;
          
          // 总是尝试从Base64数据中获取真实尺寸，因为ExcelJS的尺寸信息可能不准确
          try {
            const testImg = new Image();
            await new Promise((resolve, reject) => {
              testImg.onload = () => {
                originalWidth = testImg.width;
                originalHeight = testImg.height;
                console.log('从Base64获取的真实图片尺寸:', originalWidth, 'x', originalHeight);
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
            console.log(`使用锚点计算的显示尺寸: ${width}x${height}`);
          }
          
          const imageInfo = {
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
          
          console.log('添加图片信息:', imageInfo);
          images.push(imageInfo);
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

  /**
   * 提取文字元素
   * @param {Object} worksheet - Excel工作表
   * @param {Array} mergedCells - 合并单元格数组
   * @param {Array} images - 图片信息数组
   * @returns {Array} 文字信息数组
   */
  extractTexts(worksheet, mergedCells, images) {
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
              const mergedCell = this.isInMergedCell(rowNumber, colNumber, mergedCells);
              
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
                  
                  const cellBounds = this.getCellPixelBoundsPrecise(rowNumber, colNumber, worksheet);
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
  getImageTextOverlays(images) {
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
   * 提取rectangle形状中的文字
   * @param {Object} worksheet - Excel工作表
   * @returns {Array} rectangle文字信息数组
   */
  extractRectangleTexts(worksheet) {
    const rectangleTexts = [];
    
    try {
      console.log('开始提取rectangle形状中的文字...');
      
      // 深入探索worksheet的所有属性
      console.log('探索worksheet的所有属性:');
      Object.keys(worksheet).forEach(key => {
        const value = worksheet[key];
        console.log(`worksheet.${key}:`, typeof value, value);
        
        // 如果值是对象，进一步探索
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          Object.keys(value).forEach(subKey => {
            const subValue = value[subKey];
            console.log(`  worksheet.${key}.${subKey}:`, typeof subValue, subValue);
          });
        }
      });
      
      // 尝试从worksheet的drawings中获取rectangle形状
      if (worksheet._drawings) {
        console.log('找到worksheet._drawings:', worksheet._drawings);
        this.extractTextFromDrawings(worksheet._drawings, rectangleTexts);
      }
      
      // 尝试从worksheet.model中获取rectangle形状
      if (worksheet.model && worksheet.model.drawings) {
        console.log('找到worksheet.model.drawings:', worksheet.model.drawings);
        this.extractTextFromDrawings(worksheet.model.drawings, rectangleTexts);
      }
      
      // 尝试从workbook中获取rectangle形状
      if (worksheet._workbook && worksheet._workbook.media) {
        console.log('从workbook.media中查找rectangle形状...');
        worksheet._workbook.media.forEach((media, index) => {
          console.log(`检查media ${index}:`, media);
          if (media.type === 'rectangle' || media.shapeType === 'rectangle') {
            console.log('找到rectangle形状:', media);
            this.extractTextFromRectangle(media, rectangleTexts);
          }
        });
      }
      
      // 尝试从workbook的其他属性中查找
      if (worksheet._workbook) {
        console.log('探索workbook的其他属性:');
        Object.keys(worksheet._workbook).forEach(key => {
          const value = worksheet._workbook[key];
          console.log(`workbook.${key}:`, typeof value, value);
          
          // 如果值包含drawings或shapes相关信息
          if (key.toLowerCase().includes('drawing') || key.toLowerCase().includes('shape') || key.toLowerCase().includes('rectangle')) {
            console.log(`发现可能的形状相关属性: workbook.${key}`, value);
          }
        });
      }
      
      console.log('从rectangle形状中提取到', rectangleTexts.length, '个文字');
      
    } catch (error) {
      console.warn('提取rectangle文字失败:', error);
    }
    
    return rectangleTexts;
  }

  /**
   * 从rectangle形状中提取文字
   * @param {Object} rectangle - rectangle形状对象
   * @param {Array} texts - 文字数组
   */
  extractTextFromRectangle(rectangle, texts) {
    try {
      console.log('处理rectangle形状:', rectangle);
      
      // 检查rectangle的所有属性
      Object.keys(rectangle).forEach(key => {
        const value = rectangle[key];
        console.log(`rectangle.${key}:`, value);
        
        // 如果值是字符串且包含中文，可能是文字内容
        if (typeof value === 'string' && /[\u4e00-\u9fff]/.test(value)) {
          console.log(`在rectangle.${key}中找到中文文字:`, value);
          
          texts.push({
            text: value,
            x: rectangle.x || rectangle.left || 0,
            y: rectangle.y || rectangle.top || 0,
            width: rectangle.width || 200,
            height: rectangle.height || 30,
            type: 'text'
          });
        }
      });
      
    } catch (error) {
      console.warn('处理rectangle形状失败:', error);
    }
  }

  /**
   * 提取表格框架
   * @param {Object} worksheet - Excel工作表
   * @param {Array} mergedCells - 合并单元格数组
   * @returns {Array} 框架信息数组
   */
  extractFrames(worksheet, mergedCells) {
    const frames = [];
    const processedCells = new Set();
    
    try {
      worksheet.eachRow((row, rowNumber) => {
        try {
          row.eachCell((cell, colNumber) => {
            try {
              const cellKey = `${rowNumber}-${colNumber}`;
              
              if (processedCells.has(cellKey)) {
                return;
              }
              
              // 检查是否有边框
              const hasBorder = cell && cell.border && (
                cell.border.top || cell.border.bottom || 
                cell.border.left || cell.border.right
              );
              
              if (hasBorder) {
                // 检查是否在合并单元格内
                const mergedCell = this.isInMergedCell(rowNumber, colNumber, mergedCells);
                
                if (mergedCell) {
                  const mergedCellKey = `${mergedCell.top}-${mergedCell.left}`;
                  if (processedCells.has(mergedCellKey)) {
                    return;
                  }
                  processedCells.add(mergedCellKey);
                  
                  frames.push({
                    x: mergedCell.x,
                    y: mergedCell.y,
                    width: mergedCell.width,
                    height: mergedCell.height,
                    type: 'frame'
                  });
                } else {
                  processedCells.add(cellKey);
                  const cellBounds = this.getCellPixelBoundsPrecise(rowNumber, colNumber, worksheet);
                  
                  frames.push({
                    x: cellBounds.x,
                    y: cellBounds.y,
                    width: cellBounds.width,
                    height: cellBounds.height,
                    type: 'frame'
                  });
                }
              }
            } catch (error) {
              console.warn(`处理单元格边框 ${rowNumber}-${colNumber} 失败:`, error);
            }
          });
        } catch (error) {
          console.warn(`处理行边框 ${rowNumber} 失败:`, error);
        }
      });
    } catch (error) {
      console.warn('提取表格框架失败:', error);
    }
    
    return frames;
  }

  /**
   * 应用布局分析结果，调整元素位置和间距
   * @param {Array} elements - 元素数组
   * @param {Object} layoutInfo - 布局分析结果
   */
  applyLayoutAnalysis(elements, layoutInfo) {
    if (!layoutInfo.spacing || !layoutInfo.rows || !layoutInfo.cols) {
      return elements; // 如果没有布局信息，返回原始元素
    }
    
    const adjustedElements = [];
    
    for (const element of elements) {
      const adjustedElement = { ...element };
      
      // 根据行和列信息调整位置
      if (element.row && element.col) {
        // 查找元素所在的行和列
        const elementRow = layoutInfo.rows.find(row => 
          row.elements.some(el => el.row === element.row)
        );
        const elementCol = layoutInfo.cols.find(col => 
          col.elements.some(el => el.col === element.col)
        );
        
        if (elementRow && elementCol) {
          // 使用布局分析的平均间距调整位置
          const rowIndex = layoutInfo.rows.indexOf(elementRow);
          const colIndex = layoutInfo.cols.indexOf(elementCol);
          
          // 应用水平间距
          if (colIndex > 0) {
            adjustedElement.x = elementCol.x + (colIndex * layoutInfo.spacing.avgHorizontal);
          }
          
          // 应用垂直间距
          if (rowIndex > 0) {
            adjustedElement.y = elementRow.y + (rowIndex * layoutInfo.spacing.avgVertical);
          }
          
          console.log(`调整元素位置: 原始(${element.x},${element.y}) -> 调整后(${adjustedElement.x},${adjustedElement.y})`);
        }
      }
      
      adjustedElements.push(adjustedElement);
    }
    
    return adjustedElements;
  }

  /**
   * 工具：判断点是否在矩形内
   * @param {number} px - 点的x坐标
   * @param {number} py - 点的y坐标
   * @param {Object} rect - 矩形对象 {x, y, width, height}
   * @returns {boolean} 点是否在矩形内
   */
  _isPointInRect(px, py, rect) {
    return px >= rect.x && px <= rect.x + rect.width && py >= rect.y && py <= rect.y + rect.height;
  }

  /**
   * 工具：找图片所属容器（用中心点命中；若多命中，取面积最小的那个）
   * @param {Array} frames - 框架数组
   * @param {Object} img - 图片对象
   * @returns {Object|null} 包含该图片的框架，如果没有则返回null
   */
  _findContainingFrame(frames, img) {
    const cx = img.x + (img.width || img.originalWidth) / 2;
    const cy = img.y + (img.height || img.originalHeight) / 2;
    const hits = frames.filter(f => this._isPointInRect(cx, cy, f));
    if (!hits.length) return null;
    return hits.sort((a, b) => (a.width * a.height) - (b.width * b.height))[0];
  }

  /**
   * 工具：计算两个矩形的重叠面积
   * @param {Object} rect1 - 矩形1 {x, y, width, height}
   * @param {Object} rect2 - 矩形2 {x, y, width, height}
   * @returns {number} 重叠面积
   */
  _calculateOverlapArea(rect1, rect2) {
    const left = Math.max(rect1.x, rect2.x);
    const top = Math.max(rect1.y, rect2.y);
    const right = Math.min(rect1.x + rect1.width, rect2.x + rect2.width);
    const bottom = Math.min(rect1.y + rect1.height, rect2.y + rect2.height);
    
    if (left < right && top < bottom) {
      return (right - left) * (bottom - top);
    }
    return 0;
  }

  /**
   * 工具：找图片所属的所有容器（用于横跨多个格子的图片）
   * @param {Array} frames - 框架数组
   * @param {Object} img - 图片对象
   * @returns {Array} 包含该图片的所有框架
   */
  _findAllContainingFrames(frames, img) {
    const imgLeft = img.x;
    const imgTop = img.y;
    const imgRight = img.x + (img.width || img.originalWidth);
    const imgBottom = img.y + (img.height || img.originalHeight);
    const imgArea = (imgRight - imgLeft) * (imgBottom - imgTop);
    
    // 首先尝试找到完全包含图片的框架
    const fullyContainingFrames = frames.filter(frame => {
      const frameLeft = frame.x;
      const frameTop = frame.y;
      const frameRight = frame.x + frame.width;
      const frameBottom = frame.y + frame.height;
      
      // 检查图片是否完全在框架内
      return imgLeft >= frameLeft && imgRight <= frameRight && imgTop >= frameTop && imgBottom <= frameBottom;
    });
    
    // 如果找到完全包含的框架，返回它们
    if (fullyContainingFrames.length > 0) {
      return fullyContainingFrames;
    }
    
    // 检查90%重叠的框架
    const highOverlapFrames = frames.filter(frame => {
      const overlapArea = this._calculateOverlapArea(
        { x: imgLeft, y: imgTop, width: imgRight - imgLeft, height: imgBottom - imgTop },
        { x: frame.x, y: frame.y, width: frame.width, height: frame.height }
      );
      
      // 如果重叠面积超过图片面积的90%，认为图片在这个框架内
      return overlapArea >= imgArea * 0.9;
    });
    
    // 如果找到90%重叠的框架，返回它们
    if (highOverlapFrames.length > 0) {
      return highOverlapFrames;
    }
    
    // 如果没有完全包含或90%重叠的框架，检查图片中心点所在的框架
    const imgCenterX = (imgLeft + imgRight) / 2;
    const imgCenterY = (imgTop + imgBottom) / 2;
    
    const centerFrames = frames.filter(frame => {
      return this._isPointInRect(imgCenterX, imgCenterY, frame);
    });
    
    // 如果中心点在某个框架内，返回该框架
    if (centerFrames.length > 0) {
      // 返回面积最小的框架（最精确的匹配）
      return [centerFrames.sort((a, b) => (a.width * a.height) - (b.width * b.height))[0]];
    }
    
    // 最后回退到重叠检测，但只返回面积最小的重叠框架
    const overlappingFrames = frames.filter(frame => {
      const frameLeft = frame.x;
      const frameTop = frame.y;
      const frameRight = frame.x + frame.width;
      const frameBottom = frame.y + frame.height;
      
      // 检查图片是否与框架有重叠
      return !(imgRight <= frameLeft || imgLeft >= frameRight || imgBottom <= frameTop || imgTop >= frameBottom);
    });
    
    // 返回面积最小的重叠框架
    if (overlappingFrames.length > 0) {
      return [overlappingFrames.sort((a, b) => (a.width * a.height) - (b.width * b.height))[0]];
    }
    
    return [];
  }

  /**
   * 工具：计算多个框架的合并边界
   * @param {Array} frames - 框架数组
   * @returns {Object} 合并后的边界 {x, y, width, height}
   */
  _calculateCombinedBounds(frames) {
    if (frames.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
    if (frames.length === 1) return frames[0];
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    for (const frame of frames) {
      minX = Math.min(minX, frame.x);
      minY = Math.min(minY, frame.y);
      maxX = Math.max(maxX, frame.x + frame.width);
      maxY = Math.max(maxY, frame.y + frame.height);
    }
    
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  /**
   * 核心：把图片 contain 到容器里，且不放大超过 100%
   * @param {Array} images - 图片数组
   * @param {Array} frames - 框架数组
   * @param {number} padding - 内边距，默认8像素
   */
  _fitImagesIntoFrames(images, frames, padding = 0) {
    console.log(`开始处理 ${images.length} 张图片，${frames.length} 个框架`);
    
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      // 原图像素
      const ow = Math.max(1, img.originalWidth || img.width || 1);
      const oh = Math.max(1, img.originalHeight || img.height || 1);

      console.log(`处理图片 ${i + 1}: 原始尺寸 ${ow}x${oh}, 当前位置 (${img.x}, ${img.y}), 当前尺寸 ${img.width}x${img.height}`);

      // 查找所有包含此图片的框架（可能横跨多个格子）
      const containingFrames = this._findAllContainingFrames(frames, img);
      
      if (containingFrames.length === 0) {
        console.log(`图片 ${i + 1}: 未找到包含的框架，保持原始位置和尺寸`);
        // 不在任何格子内的图片，保持原始位置和尺寸，只应用缩放
        img.x = Math.round(img.x);
        img.y = Math.round(img.y);
        img.width = Math.round(img.width);
        img.height = Math.round(img.height);
        continue;
      }

      // 如果图片横跨多个框架，计算合并后的边界
      const combinedBounds = this._calculateCombinedBounds(containingFrames);
      console.log(`图片 ${i + 1}: 找到 ${containingFrames.length} 个框架，合并边界: ${combinedBounds.width}x${combinedBounds.height}, 位置 (${combinedBounds.x}, ${combinedBounds.y})`);

      const maxW = Math.max(0, combinedBounds.width - padding * 2);
      const maxH = Math.max(0, combinedBounds.height - padding * 2);

      // 检查是否为横幅图片（横跨多个格子且尺寸较大）
      const excelBoxW = img.width || ow;
      const excelBoxH = img.height || oh;
      // 更严格的横幅检测：必须横跨多个格子 且 图片尺寸明显大于单个格子
      const isBanner = containingFrames.length > 1 && 
                      (excelBoxW > maxW * 1.5 || excelBoxH > maxH * 1.5) &&
                      (excelBoxW > 200 || excelBoxH > 200); // 绝对尺寸也要足够大
      
      console.log(`图片 ${i + 1}: Excel尺寸 ${excelBoxW}x${excelBoxH}, 合并容器最大尺寸 ${maxW}x${maxH}, 是否为横幅: ${isBanner}`);
      
      if (isBanner) {
        // 横幅图片：保持原始Excel尺寸，但确保不超出合并边界
        const scaleX = maxW / excelBoxW;
        const scaleY = maxH / excelBoxH;
        const scale = Math.min(scaleX, scaleY, 1); // 不超过100%原图像素
        
        const dw = Math.round(excelBoxW * scale);
        const dh = Math.round(excelBoxH * scale);
        
        // 在合并边界内居中
        const nx = combinedBounds.x + (combinedBounds.width - dw) / 2;
        const ny = combinedBounds.y + (combinedBounds.height - dh) / 2;
        
        console.log(`图片 ${i + 1}: 横幅处理 - 缩放比例 ${scale}, 新尺寸 ${dw}x${dh}, 新位置 (${nx}, ${ny})`);
        
        img.x = Math.round(nx);
        img.y = Math.round(ny);
        img.width = Math.round(dw);
        img.height = Math.round(dh);
      } else {
        // 单格子图片：使用原来的逻辑
        const s = Math.min(maxW / ow, maxH / oh, 1);
        const dw = Math.round(ow * s);
        const dh = Math.round(oh * s);

        // 居中
        const nx = combinedBounds.x + (combinedBounds.width - dw) / 2;
        const ny = combinedBounds.y + (combinedBounds.height - dh) / 2;

        // 边界检查：确保图片边框不超出合并边界
        const finalX = Math.max(combinedBounds.x + padding, Math.min(nx, combinedBounds.x + combinedBounds.width - dw - padding));
        const finalY = Math.max(combinedBounds.y + padding, Math.min(ny, combinedBounds.y + combinedBounds.height - dh - padding));

        console.log(`图片 ${i + 1}: 单格子处理 - 缩放比例 ${s}, 新尺寸 ${dw}x${dh}, 计算位置 (${nx}, ${ny}), 最终位置 (${finalX}, ${finalY})`);

        img.x = Math.round(finalX);
        img.y = Math.round(finalY);
        img.width = Math.round(dw);
        img.height = Math.round(dh);
      }
    }
    
    console.log('图片尺寸调整完成');
  }

  /**
   * 批量创建TLDraw形状
   * @param {Array} elements - 元素数组
   * @param {string} shapeType - 形状类型
   */
  async createShapesBatch(elements, shapeType) {
    const shapes = [];
    let frameCounter = 0; // 用于生成唯一的frame名称
    
    for (const element of elements) {
      try {
        let shape;
        
        switch (shapeType) {
          case 'image':
            // 先创建资产，再创建形状
            try {
              const assetId = `asset:${(globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2))}`;
              
              // 创建资产 - 使用原始图片尺寸
              this.editor.store.put([
                {
                  id: assetId,
                  type: "image",
                  typeName: "asset",
                  meta: {},
                  props: {
                    w: element.originalWidth,  // 使用原始尺寸
                    h: element.originalHeight, // 使用原始尺寸
                    src: element.url,
                    name: `Excel图片_${Date.now()}`,
                    mimeType: 'image/png',
                    isAnimated: false
                  }
                }
              ]);
              
              // 创建图片形状 - 使用计算出的显示尺寸，统一应用缩放
              console.log(`创建图片形状: 显示尺寸(${element.width}x${element.height}), 位置(${element.x}, ${element.y})`);
              
              shape = {
                type: 'image',
                x: element.x * this.scale,
                y: element.y * this.scale,
                props: {
                  w: element.width * this.scale,   // 统一应用缩放
                  h: element.height * this.scale,  // 统一应用缩放
                  assetId: assetId
                }
              };
            } catch (error) {
              console.warn('创建图片资产失败:', error);
              continue; // 跳过这个图片
            }
            break;
            
          case 'text':
            shape = {
              type: 'text',
              x: element.x * this.scale,
              y: element.y * this.scale,
              props: {
                richText: toRichText(element.text),
                w: element.width * this.scale,
                size: 's',
                color: 'black'
              }
            };
            break;
            
          case 'frame':
            frameCounter++;
            shape = {
              type: 'geo',
              x: element.x * this.scale,
              y: element.y * this.scale,
              props: {
                geo: 'rectangle',
                w: element.width * this.scale,
                h: element.height * this.scale,
                fill: 'none',
                color: 'black',
                size: 's'
              }
            };
            break;
        }
        
        if (shape) {
          shapes.push(shape);
        }
      } catch (error) {
        console.warn(`创建${shapeType}形状失败:`, error);
      }
    }
    
    // 批量添加到画布
    if (shapes.length > 0) {
      try {
        // 尝试批量创建
        if (typeof this.editor.batch === 'function') {
          await this.editor.batch(() => {
            shapes.forEach(shape => {
              this.editor.createShape(shape);
            });
          });
        } else {
          // 如果batch方法不存在，逐个创建
          shapes.forEach(shape => {
            this.editor.createShape(shape);
          });
        }
      } catch (error) {
        console.error('批量创建形状失败:', error);
        // 尝试逐个创建
        try {
          shapes.forEach(shape => {
            this.editor.createShape(shape);
          });
        } catch (fallbackError) {
          console.error('逐个创建形状也失败:', fallbackError);
        }
      }
    }
  }

  /**
   * 主转换方法
   * @param {File} file - Excel文件
   */
  async convertExcelToTLDraw(file) {
    try {
      console.log('开始转换Excel文件:', file.name);
      
      // 读取Excel文件
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      
      // 获取第一个工作表
      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        throw new Error('Excel文件中没有找到工作表');
      }
      
      console.log('工作表名称:', worksheet.name);
      console.log('工作表尺寸:', worksheet.rowCount, 'x', worksheet.columnCount);
      
      // 先提取图片，然后进行布局分析
      console.log('开始提取图片...');
      const images = await this.extractImages(worksheet);
      console.log('提取到图片数量:', images.length);
      
      // 基于提取的图片进行动态布局分析
      const layoutInfo = this.analyzeLayoutStructure(worksheet, images);
      console.log('动态布局分析结果:', layoutInfo);
      
      // 调试：打印工作表结构
      console.log('工作表对象:', worksheet);
      console.log('工作表模型:', worksheet.model);
      
      // 1. 获取合并单元格信息
      const mergedCells = this.getMergedCells(worksheet);
      console.log('合并单元格数量:', mergedCells.length);
      
      // 2. 图片已在上面提取完成
      console.log('图片详情:', images);
      
      // 3. 提取文字元素
      console.log('开始提取文字...');
      const texts = this.extractTexts(worksheet, mergedCells, images);
      console.log('提取到文字数量:', texts.length);
      
      // 4. 提取表格框架
      console.log('开始提取表格框架...');
      const frames = this.extractFrames(worksheet, mergedCells);
      console.log('提取到框架数量:', frames.length);
      console.log('框架详情:', frames);
      
      // 5. 清空当前画布
      const currentShapes = this.editor.getCurrentPageShapes();
      if (currentShapes.length > 0) {
        const shapeIds = currentShapes.map(shape => shape.id);
        this.editor.deleteShapes(shapeIds);
      }
      
      // 6. 跳过布局分析，直接使用原始位置
      console.log('跳过布局分析，使用原始位置...');
      const adjustedImages = images;  // 直接使用原始图片位置
      const adjustedTexts = texts;    // 直接使用原始文字位置
      const adjustedFrames = frames;  // 直接使用原始框架位置
      
      // 6.5. 先按容器把图片做"等比缩小且不放大"的自适应
      console.log('开始调整图片尺寸以适应容器...');
      this._fitImagesIntoFrames(adjustedImages, adjustedFrames, 0);
      console.log('图片尺寸调整完成');
      
      // 7. 批量创建形状
      console.log('开始创建TLDraw形状...');
      
      // 先创建图片
      if (adjustedImages.length > 0) {
        console.log('开始创建图片形状...');
        await this.createShapesBatch(adjustedImages, 'image');
      }
      
      // 再创建文字
      if (adjustedTexts.length > 0) {
        console.log('开始创建文字形状...');
        await this.createShapesBatch(adjustedTexts, 'text');
      }
      
      // 最后创建表格框（使用矩形框）
      if (adjustedFrames.length > 0) {
        console.log('开始创建表格框形状...');
        try {
          await this.createShapesBatch(adjustedFrames, 'frame');
        } catch (frameError) {
          console.warn('表格框创建失败，但不影响其他内容:', frameError);
        }
      }
      
      // 7. 调整视图
      try {
        // 根据TLDraw官方文档，使用正确的API
        this.editor.selectAll();
        this.editor.zoomToSelection({
          animation: { duration: 1000 }
        });
      } catch (viewError) {
        console.warn('调整视图失败，但不影响转换结果:', viewError);
        // 备用方案：尝试重置缩放
        try {
          this.editor.resetZoom();
        } catch (resetError) {
          console.warn('重置缩放也失败:', resetError);
        }
      }
      
      console.log('Excel转换完成！');
      console.log(`创建了 ${frames.length} 个表格框, ${images.length} 个图片, ${texts.length} 个文字`);
      
      return {
        success: true,
        stats: {
          frames: frames.length, // 使用矩形框代替frame
          images: images.length,
          texts: texts.length,
          mergedCells: mergedCells.length,
          note: '使用矩形框绘制表格边框'
        }
      };
      
    } catch (error) {
      console.error('Excel转换失败:', error);
      console.error('错误堆栈:', error.stack);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

/**
 * 验证Excel文件
 * @param {File} file - 文件对象
 * @returns {boolean} 是否为有效的Excel文件
 */
export function validateExcelFile(file) {
  if (!file) return false;
  
  const validTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
    'application/vnd.ms-excel.sheet.macroEnabled.12' // .xlsm
  ];
  
  const validExtensions = ['.xlsx', '.xls', '.xlsm'];
  const fileName = file.name.toLowerCase();
  
  return validTypes.includes(file.type) || 
         validExtensions.some(ext => fileName.endsWith(ext));
}

/**
 * 导入Excel文件到TLDraw
 * @param {File} file - Excel文件
 * @param {Object} editor - TLDraw编辑器实例
 * @returns {Promise<Object>} 导入结果
 */
export async function importExcelToTLDraw(file, editor) {
  if (!file) {
    return { success: false, error: '没有选择文件' };
  }
  
  if (!editor) {
    return { success: false, error: '编辑器未初始化' };
  }
  
  if (!validateExcelFile(file)) {
    return { success: false, error: '请选择有效的Excel文件（.xlsx, .xls, .xlsm）' };
  }
  
  try {
    const converter = new ExcelToTLDrawConverter(editor);
    const result = await converter.convertExcelToTLDraw(file);
    
    if (result.success) {
      return {
        success: true,
        shapesCount: result.shapesCount || 0,
        message: result.message || 'Excel导入成功'
      };
    } else {
      return {
        success: false,
        error: result.error || '导入失败'
      };
    }
  } catch (error) {
    console.error('导入Excel时出错:', error);
    return {
      success: false,
      error: error.message || '导入过程中发生未知错误'
    };
  }
}
