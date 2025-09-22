import * as ExcelJS from 'exceljs';
import { toRichText } from 'tldraw';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import DrawingML from './DrawingML.js';
import { createTextFitConfig, pt2px, shrinkAndRefitTextShape, createSafeRichText } from './textFitUtils.js';

// 导入拆分后的工具函数
import {
  pointsToPx,
  columnWidthToPx,
} from './excel/utils/units.js';

import {
  getCellPixelBounds,
  getCellPixelBoundsPrecise,
  calculateOffsets,
} from './excel/utils/geometry.js';

import {
  columnLetterToNumber,
  getMergedCells,
  isInMergedCell,
} from './excel/utils/merges.js';

import {
  analyzeLayoutStructure,
  groupElementsByRow,
  groupElementsByColumn,
  calculateElementSpacing,
  identifyElementClusters,
  calculateScaleFactors,
} from './excel/utils/layout.js';

import {
  mapColorToTLDraw,
  mapFontSizeToTLDraw,
  createSafeRichText as createSafeRichTextUtil,
} from './excel/utils/colorsFonts.js';

import {
  extractDrawingMLElements,
} from './excel/utils/drawml.js';

import {
  extractImages,
  compressImage,
  getImageTextOverlays,
} from './excel/utils/images.js';

// 导入图片frame处理工具
import {
  createFrameFromImageAnchor,
  placeImageIntoFrame,
  processImagesWithFrames,
  createImageFrameShape,
  addFrameInfoToImage,
  isImageWithinFrame,
  calculateImageScale
} from './imageFrameUtils.js';

import {
  extractTexts,
  extractRectangleTexts,
  extractTextFromRectangle,
  extractTextFromDrawings,
  extractTextFromSingleDrawing,
  extractTextFromWorkbook,
  extractTextFromWorksheetProperties,
} from './excel/utils/texts.js';

// Fidelity-first 模式配置
export const PRESERVE_EXCEL_LAYOUT = false;       // 图片要fit到格子
export const SNAP_TO_FRAME_THRESHOLD = 0.95;      // 可选：与某个frame重叠≥95%才贴齐

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
    return pointsToPx(points);
  }

  /**
   * 单位换算：列宽 Excel width -> px
   * @param {number} width - Excel列宽
   * @returns {number} 像素值
   */
  columnWidthToPx(width) {
    return columnWidthToPx(width);
  }

  /**
   * 计算行列偏移量数组，用于DrawingML解析
   * @param {Object} worksheet - Excel工作表
   * @returns {Object} { colOffsets: [], rowOffsets: [] }
   */
  calculateOffsets(worksheet) {
    return calculateOffsets(worksheet);
  }

  /**
   * 更精确的单元格像素边界计算
   * @param {number} row - 行号（1-based）
   * @param {number} col - 列号（1-based）
   * @param {Object} worksheet - Excel工作表
   * @returns {Object} {x, y, width, height}
   */
  getCellPixelBoundsPrecise(row, col, worksheet) {
    return getCellPixelBoundsPrecise(row, col, worksheet);
  }

  /**
   * 计算单元格的像素坐标
   * @param {number} row - 行号（1-based）
   * @param {number} col - 列号（1-based）
   * @param {Object} worksheet - Excel工作表
   * @returns {Object} {x, y, width, height}
   */
  getCellPixelBounds(row, col, worksheet) {
    return getCellPixelBounds(row, col, worksheet);
  }

  /**
   * 将列字母转换为数字 (A=1, B=2, ..., Z=26, AA=27, ...)
   * @param {string} columnLetter - 列字母
   * @returns {number} 列数字
   */
  columnLetterToNumber(columnLetter) {
    return columnLetterToNumber(columnLetter);
  }

  /**
   * 处理合并单元格
   * @param {Object} worksheet - Excel工作表
   * @returns {Array} 合并单元格信息数组
   */
  getMergedCells(worksheet) {
    return getMergedCells(worksheet);
  }

  /**
   * 检查单元格是否在合并区域内
   * @param {number} row - 行号
   * @param {number} col - 列号
   * @param {Array} mergedCells - 合并单元格数组
   * @returns {Object|null} 合并单元格信息或null
   */
  isInMergedCell(row, col, mergedCells) {
    return isInMergedCell(row, col, mergedCells);
  }

  /**
   * 动态分析Excel布局结构，自动识别元素间的关系和比例
   * @param {Object} worksheet - Excel工作表对象
   * @param {Array} images - 图片元素数组
   */
  analyzeLayoutStructure(worksheet, images = []) {
    return analyzeLayoutStructure(worksheet, images);
  }

  /**
   * 按Y坐标分组元素（识别水平行）
   */
  groupElementsByRow(elements) {
    return groupElementsByRow(elements);
  }

  /**
   * 按X坐标分组元素（识别垂直列）
   */
  groupElementsByColumn(elements) {
    return groupElementsByColumn(elements);
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
   * 使用DrawingML解析器提取文本框和图片（只解析当前worksheet关联的drawing文件）
   * @param {Object} worksheet - Excel工作表
   * @param {JSZip} zip - Excel文件的zip对象
   * @param {Object} opts - 过滤选项
   * @returns {Object} { texts: [], images: [] }
   */
  async extractDrawingMLElements(worksheet, zip, opts = {}) {
    const drawingTexts = [];
    const drawingImages = [];
    let sheetIndex = 1; // 默认值，防止未定义错误
    
    try {
      console.log('开始使用DrawingML解析器提取元素...');
      
      // 计算行列偏移量
      const dims = this.calculateOffsets(worksheet);
      console.log('计算的行列偏移量:', dims);
      
      // 获取当前worksheet的索引（从0开始）
      const workbook = worksheet._workbook;
      sheetIndex = workbook.worksheets.indexOf(worksheet) + 1; // 转换为1-based索引
      console.log(`当前worksheet索引: ${sheetIndex}`);
      
      // 查找当前worksheet关联的drawing文件
      const relsPath = `xl/worksheets/_rels/sheet${sheetIndex}.xml.rels`;
      let drawingPath = null;
      
      if (zip.file(relsPath)) {
        try {
          const relsXml = await zip.file(relsPath).async('string');
          const parser = new XMLParser({ ignoreAttributes: false });
          const relsDoc = parser.parse(relsXml);
          
          if (relsDoc.Relationships && relsDoc.Relationships.Relationship) {
            const relationships = relsDoc.Relationships.Relationship;
            const relArray = Array.isArray(relationships) ? relationships : [relationships];
            
            // 查找drawing关系
            const drawingRel = relArray.find(r => 
              r['@_Type'] && r['@_Type'].includes('/drawing')
            );
            
            if (drawingRel && drawingRel['@_Target']) {
              // 构建drawing文件路径
              drawingPath = `xl/drawings/${drawingRel['@_Target'].replace('../drawings/', '')}`;
              console.log(`找到worksheet ${sheetIndex} 关联的drawing文件: ${drawingPath}`);
            }
          }
        } catch (error) {
          console.warn(`解析worksheet关系文件失败: ${relsPath}`, error);
        }
      } else {
        console.log(`未找到worksheet关系文件: ${relsPath}`);
      }
      
      // 如果没有找到关联的drawing文件，跳过DrawingML解析
      if (!drawingPath) {
        console.log(`worksheet ${sheetIndex} 没有关联的drawing文件，跳过DrawingML解析`);
        return { texts: drawingTexts, images: drawingImages };
      }
      
      // 验证drawing文件是否存在
      if (!zip.file(drawingPath)) {
        console.warn(`drawing文件不存在: ${drawingPath}`);
        return { texts: drawingTexts, images: drawingImages };
      }
      
      // 只解析当前worksheet关联的drawing文件
      try {
        console.log(`解析worksheet ${sheetIndex} 的drawing文件: ${drawingPath}`);
        
        // 设置过滤选项 - 调试模式，放宽过滤条件
        const filterOpts = {
          includeHidden: true,       // 包含隐藏元素（调试）
          includeVML: false,         // 不包含VML元素
          includePrintOnly: true,    // 包含仅打印元素（调试）
          minPixelSize: 0,           // 最小像素尺寸设为0（调试）
          clipToSheetBounds: false   // 不裁剪到工作表边界（调试）
        };
        
        const drawingResults = await DrawingML.parseDrawingML(zip, drawingPath, dims, filterOpts);
        
        console.log(`从${drawingPath}解析到:`, drawingResults);
        
        // 处理文本框
        if (drawingResults.texts && drawingResults.texts.length > 0) {
          for (const textItem of drawingResults.texts) {
            if (textItem.text && textItem.text.trim()) {
              drawingTexts.push({
                text: textItem.text.trim(),
                x: textItem.rect.x,
                y: textItem.rect.y,
                width: textItem.rect.w,
                height: textItem.rect.h,
                type: 'textbox', // 标记为textbox类型
                source: 'drawingml'
              });
              console.log(`添加DrawingML文本框: "${textItem.text.trim()}" 位置(${textItem.rect.x}, ${textItem.rect.y})`);
            }
          }
        }
        
        // 处理图片
        if (drawingResults.images && drawingResults.images.length > 0) {
          for (const imageItem of drawingResults.images) {
            // 从workbook获取图片数据
            try {
              const workbook = worksheet._workbook;
              let imageData = null;
              
              // 尝试通过rId获取图片
              if (imageItem.rId && workbook) {
                // 这里需要根据实际的ExcelJS API来获取图片
                // 可能需要遍历workbook的图片集合
                console.log(`尝试获取图片数据，rId: ${imageItem.rId}`);
                
                // 暂时创建一个占位符，实际实现需要根据ExcelJS的API调整
                drawingImages.push({
                  url: null, // 需要从workbook获取
                  x: imageItem.rect.x,
                  y: imageItem.rect.y,
                  width: imageItem.rect.w,
                  height: imageItem.rect.h,
                  type: 'image',
                  source: 'drawingml',
                  rId: imageItem.rId,
                  target: imageItem.target
                });
              }
            } catch (error) {
              console.warn('处理DrawingML图片失败:', error);
            }
          }
        }
        
      } catch (error) {
        console.warn(`解析drawing文件${drawingPath}失败:`, error);
      }
      
    } catch (error) {
      console.warn('DrawingML解析失败:', error);
    }
    
      console.log(`DrawingML解析完成: ${drawingTexts.length}个文本框, ${drawingImages.length}个图片`);
      console.log(`✅ 修复验证: 只解析了worksheet ${sheetIndex} 关联的drawing文件，避免了加载其他sheet的文本框`);
      return { texts: drawingTexts, images: drawingImages };
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
          
          // console.log('处理图片:', image, 'ID:', imageId);
          
          // 获取图片数据
          let imageData;
          if (typeof image.getImage === 'function') {
            imageData = await image.getImage();
            console.log('通过getImage()获取图片数据:', imageData);
          } else {
            imageData = image;
            // console.log('直接使用图片对象:', imageData);
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
          
          // 详细调试图片数据（已注释以减少日志输出）
          // console.log('图片数据类型:', typeof imageData);
          
          // 检查不同的图片数据格式
          let buffer = null;
          
          // 如果有imageId，尝试从workbook获取图片数据
          if (imageData.imageId !== undefined && imageData.imageId !== null) {
            // console.log('检测到imageId:', imageData.imageId);
            try {
              // 尝试从workbook获取图片
              const workbook = imageData.worksheet?._workbook;
              // console.log('workbook对象:', workbook);
              
              if (workbook) {
                // 尝试多种方法获取图片
                let imageBuffer = null;
                
                // 方法1: getImage
                if (typeof workbook.getImage === 'function') {
                  try {
                    imageBuffer = await workbook.getImage(imageData.imageId);
                    // console.log('通过getImage获取图片数据:', imageBuffer);
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
              // 改进的Base64转换方法
              try {
                // 使用更安全的方法转换Base64
                const binaryString = Array.from(uint8Array, byte => String.fromCharCode(byte)).join('');
                base64String = btoa(binaryString);
                // console.log('Base64转换成功，长度:', base64String.length);
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
            
            // 压缩图片（如果超过100KB）
            const compressedBase64 = await this.compressImage(base64String, 100, mimeType);
            
            imageUrl = `data:${mimeType};base64,${compressedBase64}`;
            
            // 验证URL格式
            if (!imageUrl.startsWith('data:image/') || !imageUrl.includes(';base64,')) {
              throw new Error('生成的URL格式不正确');
            }
            
            // 验证Base64部分
            const base64Part = imageUrl.split(';base64,')[1];
            if (!base64Part || base64Part.length === 0) {
              throw new Error('Base64部分为空');
            }
            
            // 记录压缩信息
            const finalSizeKB = Math.round((base64Part.length * 3) / 4 / 1024);
            console.log(`最终图片大小: ${finalSizeKB}KB`);
            
            console.log('创建base64图片URL成功');
            console.log('URL长度:', imageUrl.length);
            console.log('Base64长度:', base64Part.length);
            console.log('URL预览:', imageUrl.substring(0, 100) + '...');
            
            // 测试URL是否有效
            try {
              const testImg = new Image();
              testImg.onload = () => {
                // console.log('Base64图片URL验证成功，图片尺寸:', testImg.width, 'x', testImg.height);
              };
              testImg.onerror = (error) => {
                console.error('Base64图片URL验证失败，图片无法加载:', error);
                console.error('URL长度:', imageUrl.length);
                console.error('URL预览:', imageUrl.substring(0, 200) + '...');
                console.error('Base64部分长度:', base64Part.length);
                console.error('Base64预览:', base64Part.substring(0, 100) + '...');
              };
              testImg.src = imageUrl;
            } catch (e) {
              console.warn('无法测试图片URL:', e);
            }
          } catch (e) {
            console.warn('base64转换失败，跳过此图片:', e);
            console.warn('图片数据长度:', imageData.data ? imageData.data.length : '未知');
            console.warn('图片类型:', imageData.type || '未知');
            continue; // 跳过这个图片，继续处理下一个
          }
          
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
              
              // console.log(`图片使用frame容器: 位置(${x},${y}) 尺寸: ${width}x${height}`);
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
          let originalWidth = imageData.width || 100;
          let originalHeight = imageData.height || 100;
          
          // 总是尝试从Base64数据中获取真实尺寸，因为ExcelJS的尺寸信息可能不准确
          try {
            const testImg = new Image();
            await new Promise((resolve, reject) => {
              testImg.onload = () => {
                originalWidth = testImg.width;
                originalHeight = testImg.height;
                // console.log('从Base64获取的真实图片尺寸:', originalWidth, 'x', originalHeight);
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
            // console.log(`使用锚点计算的显示尺寸: ${width}x${height}`);
          }
          
          const imageInfo = addFrameInfoToImage({
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
          }, frameRect, images.length);
          
          // console.log('添加图片信息:', imageInfo);
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
   * 将十六进制颜色映射到TLDraw支持的颜色名称
   * @param {string} hexColor - 十六进制颜色值
   * @returns {string} TLDraw颜色名称
   */
  mapColorToTLDraw(hexColor) {
    if (!hexColor || typeof hexColor !== 'string') return 'black';
    
    // 移除#号并转换为小写
    const hex = hexColor.replace('#', '').toLowerCase();
    
    // 常见颜色映射
    const colorMap = {
      '000000': 'black',
      'ffffff': 'white',
      'ff0000': 'red',
      '00ff00': 'green',
      '0000ff': 'blue',
      'ffff00': 'yellow',
      'ffa500': 'orange',
      '800080': 'violet',
      'ffc0cb': 'light-red',
      '90ee90': 'light-green',
      'add8e6': 'light-blue',
      'dda0dd': 'light-violet',
      '808080': 'grey'
    };
    
    // 精确匹配
    if (colorMap[hex]) {
      return colorMap[hex];
    }
    
    // 根据颜色值进行近似匹配
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    
    // 计算亮度
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    
    if (brightness < 50) return 'black';
    if (brightness > 200) return 'white';
    
    // 根据RGB值判断主要颜色
    if (r > g && r > b) return 'red';
    if (g > r && g > b) return 'green';
    if (b > r && b > g) return 'blue';
    if (r > 200 && g > 200 && b < 100) return 'yellow';
    if (r > 200 && g > 100 && b < 100) return 'orange';
    
    return 'black'; // 默认返回黑色
  }

  /**
   * 将pt字号映射到TLDraw v3的size值
   * @param {number} pt - 字号（pt）
   * @returns {string} TLDraw v3的size值
   */
  mapFontSizeToTLDraw(pt) {
    if (!pt || pt <= 0) return 's';
    
    // TLDraw v3的size映射规则
    // 根据TLDraw官方文档，size值对应的大致字号：
    // s: 小号 (约8-10pt)
    // m: 中号 (约12-14pt) 
    // l: 大号 (约16-18pt)
    // xl: 超大号 (约20pt+)
    
    if (pt <= 10) return 's';
    if (pt <= 14) return 'm';
    if (pt <= 18) return 'l';
    return 'xl';
  }

  /**
   * 创建安全的富文本格式，避免空文本节点错误
   * @param {string} text - 原始文本
   * @returns {Object} 安全的富文本格式
   */
  createSafeRichText(text) {
    return createSafeRichText(text);
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
   * 解析Excel单元格颜色
   * @param {Object} color - ExcelJS颜色对象
   * @returns {string} 十六进制颜色值
   */
  parseExcelColor(color) {
    if (!color) return '#FFFFFF';
    
    if (color.argb) {
      // ARGB格式：AARRGGBB
      const argb = color.argb.toString(16).padStart(8, '0');
      return `#${argb.substr(2)}`; // 去掉Alpha通道
    }
    
    if (color.theme !== undefined) {
      // 主题色，使用默认主题色映射
      const themeColors = {
        0: '#FFFFFF', // light1
        1: '#000000', // dark1
        2: '#E7E6E6', // light2
        3: '#44546A', // dark2
        4: '#5B9BD5', // accent1
        5: '#ED7D31', // accent2
        6: '#A5A5A5', // accent3
        7: '#FFC000', // accent4
        8: '#4472C4', // accent5
        9: '#70AD47'  // accent6
      };
      return themeColors[color.theme] || '#FFFFFF';
    }
    
    return '#FFFFFF';
  }

  /**
   * 提取单元格背景色
   * @param {Object} worksheet - Excel工作表
   * @param {Array} mergedCells - 合并单元格数组
   * @returns {Array} 背景色信息数组
   */
  extractCellBackgrounds(worksheet, mergedCells) {
    const backgrounds = [];
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
              
              // 检查是否有背景色
              if (cell.fill && cell.fill.type === 'pattern' && cell.fill.pattern === 'solid') {
                const fillColor = this.parseExcelColor(cell.fill.fgColor);
                
                // 检查是否在合并单元格内
                const mergedCell = this.isInMergedCell(rowNumber, colNumber, mergedCells);
                
                if (mergedCell) {
                  const mergedCellKey = `${mergedCell.top}-${mergedCell.left}`;
                  if (processedCells.has(mergedCellKey)) {
                    return;
                  }
                  processedCells.add(mergedCellKey);
                  
                  // 标记合并单元格范围内的所有单元格为已处理
                  for (let r = mergedCell.top; r <= mergedCell.bottom; r++) {
                    for (let c = mergedCell.left; c <= mergedCell.right; c++) {
                      const cellKey = `${r}-${c}`;
                      processedCells.add(cellKey);
                    }
                  }
                  
                  backgrounds.push({
                    x: mergedCell.x,
                    y: mergedCell.y,
                    width: mergedCell.width,
                    height: mergedCell.height,
                    color: fillColor,
                    type: 'background'
                  });
                } else {
                  processedCells.add(cellKey);
                  const cellBounds = this.getCellPixelBoundsPrecise(rowNumber, colNumber, worksheet);
                  
                  backgrounds.push({
                    x: cellBounds.x,
                    y: cellBounds.y,
                    width: cellBounds.width,
                    height: cellBounds.height,
                    color: fillColor,
                    type: 'background'
                  });
                }
              }
            } catch (error) {
              console.warn(`处理单元格背景 ${rowNumber}-${colNumber} 失败:`, error);
            }
          });
        } catch (error) {
          console.warn(`处理行背景 ${rowNumber} 失败:`, error);
        }
      });
    } catch (error) {
      console.warn('提取单元格背景失败:', error);
    }
    
    return backgrounds;
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
   * 可选：仅在"几乎完全在某 frame 内部"时贴齐
   * @param {Object} element - 元素对象 {x, y, width, height}
   * @param {Array} frames - 框架数组
   * @returns {Object} 处理后的元素
   */
  maybeSnapToFrame(element, frames) {
    if (!PRESERVE_EXCEL_LAYOUT || !frames || frames.length === 0) {
      return element;
    }

    // 永久禁用图片的贴齐功能，避免被"挤进"容器导致裁切
    if (element.type === 'image') {
      console.log('永久跳过图片的frame贴齐，保持contain后的位置和尺寸');
      return element;
    }

    const elArea = element.width * element.height;
    let bestFrame = null;
    let bestRatio = 0;

    for (const frame of frames) {
      const overlap = this._calculateOverlapArea(element, frame);
      const ratio = overlap / elArea;
      if (ratio > bestRatio) {
        bestRatio = ratio;
        bestFrame = frame;
      }
    }

    // 只有当重叠比例≥95%时才贴齐
    if (bestFrame && bestRatio >= SNAP_TO_FRAME_THRESHOLD) {
      console.log(`元素与frame重叠度${(bestRatio * 100).toFixed(1)}%，进行贴齐对齐`);
      return {
        ...element,
        x: bestFrame.x,
        y: bestFrame.y,
        width: bestFrame.width,
        height: bestFrame.height
      };
    }

    return element;
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
    
    // 对于textbox，如果没找到完全包含的框架，尝试找重叠度最高的框架
    if (img.type === 'textbox') {
      let bestFrame = null;
      let maxOverlap = 0;
      
      for (const frame of frames) {
        const frameLeft = frame.x;
        const frameTop = frame.y;
        const frameRight = frame.x + frame.width;
        const frameBottom = frame.y + frame.height;
        
        // 计算重叠区域
        const overlapLeft = Math.max(imgLeft, frameLeft);
        const overlapTop = Math.max(imgTop, frameTop);
        const overlapRight = Math.min(imgRight, frameRight);
        const overlapBottom = Math.min(imgBottom, frameBottom);
        
        if (overlapLeft < overlapRight && overlapTop < overlapBottom) {
          const overlapArea = (overlapRight - overlapLeft) * (overlapBottom - overlapTop);
          const overlapRatio = overlapArea / imgArea;
          
          if (overlapRatio > maxOverlap && overlapRatio > 0.3) { // 至少30%重叠
            maxOverlap = overlapRatio;
            bestFrame = frame;
          }
        }
      }
      
      if (bestFrame) {
        console.log(`textbox找到最佳重叠框架，重叠度: ${(maxOverlap * 100).toFixed(1)}%`);
        return [bestFrame];
      }
    }
    
    // 检查高重叠的框架，使用平衡的标准
    const highOverlapFrames = frames.filter(frame => {
      const overlapArea = this._calculateOverlapArea(
        { x: imgLeft, y: imgTop, width: imgRight - imgLeft, height: imgBottom - imgTop },
        { x: frame.x, y: frame.y, width: frame.width, height: frame.height }
      );
      
      // 平衡的标准：重叠面积超过图片面积的70%，或者重叠面积超过框架面积的40%
      const frameArea = frame.width * frame.height;
      return overlapArea >= imgArea * 0.7 || overlapArea >= frameArea * 0.4;
    });
    
    // 如果找到高重叠的框架，返回它们
    if (highOverlapFrames.length > 0) {
      return highOverlapFrames;
    }
    
    // 如果没有完全包含或高重叠的框架，检查图片中心点所在的框架
    const imgCenterX = (imgLeft + imgRight) / 2;
    const imgCenterY = (imgTop + imgBottom) / 2;
    
    const centerFrames = frames.filter(frame => {
      // 中心点检测也需要检查重叠面积，避免误判
      const overlapArea = this._calculateOverlapArea(
        { x: imgLeft, y: imgTop, width: imgRight - imgLeft, height: imgBottom - imgTop },
        { x: frame.x, y: frame.y, width: frame.width, height: frame.height }
      );
      
      // 中心点在框架内 且 重叠面积至少占图片面积的20%
      return this._isPointInRect(imgCenterX, imgCenterY, frame) && overlapArea >= imgArea * 0.2;
    });
    
    // 如果中心点在某个框架内且重叠足够，返回该框架
    if (centerFrames.length > 0) {
      // 返回面积最小的框架（最精确的匹配）
      return [centerFrames.sort((a, b) => (a.width * a.height) - (b.width * b.height))[0]];
    }
    
    // 最后回退到重叠检测，使用平衡的标准
    const overlappingFrames = frames.filter(frame => {
      const overlapArea = this._calculateOverlapArea(
        { x: imgLeft, y: imgTop, width: imgRight - imgLeft, height: imgBottom - imgTop },
        { x: frame.x, y: frame.y, width: frame.width, height: frame.height }
      );
      
      // 重叠面积必须至少占图片面积的15%，避免误判
      return overlapArea >= imgArea * 0.15;
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
   * 核心：把textbox适配到容器里，如果textbox在格子内就fit到格子内
   * @param {Array} texts - 文字数组（包含textbox）
   * @param {Array} frames - 框架数组
   * @param {number} padding - 内边距，默认4像素
   */
  _fitTextboxesIntoFrames(texts, frames, padding = 4) {
    // Fidelity-first 模式：直接返回原始文本框，不做任何适配处理
    if (PRESERVE_EXCEL_LAYOUT) {
      console.log(`Fidelity-first模式：保持Excel原始布局，跳过文本框适配处理`);
      return texts.map(text => this.maybeSnapToFrame(text, frames));
    }

    console.log(`开始处理 ${texts.length} 个文字元素，${frames.length} 个框架`);
    
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      
      // 只处理textbox类型的文字
      if (text.type !== 'textbox') {
        continue;
      }
      
      console.log(`处理textbox ${i + 1}: 当前位置 (${text.x}, ${text.y}), 当前尺寸 ${text.width}x${text.height}`);
      
      // 查找所有包含此textbox的框架
      const containingFrames = this._findAllContainingFrames(frames, text);
      
      console.log(`textbox ${i + 1}: 查找包含框架，textbox位置 (${text.x}, ${text.y}, ${text.width}x${text.height})`);
      console.log(`textbox ${i + 1}: 找到 ${containingFrames.length} 个包含的框架`);
      
      if (containingFrames.length === 0) {
        console.log(`textbox ${i + 1}: 未找到包含的框架，保持原始位置和尺寸`);
        console.log(`textbox ${i + 1}: 可用框架数量: ${frames.length}`);
        if (frames.length > 0) {
          console.log(`textbox ${i + 1}: 第一个框架位置: (${frames[0].x}, ${frames[0].y}, ${frames[0].width}x${frames[0].height})`);
        }
        // 不在任何格子内的textbox，保持原始位置和尺寸
        text.x = Math.round(text.x);
        text.y = Math.round(text.y);
        text.width = Math.round(text.width);
        text.height = Math.round(text.height);
        continue;
      }
      
      // 如果textbox在格子内，适配到格子内
      const frame = containingFrames[0]; // 使用第一个包含的框架
      console.log(`textbox ${i + 1}: 适配到框架 (${frame.x}, ${frame.y}, ${frame.width}x${frame.height})`);
      
      // 计算适配后的位置和尺寸
      const newX = frame.x + padding;
      const newY = frame.y + padding;
      const newWidth = Math.max(20, frame.width - padding * 2); // 最小宽度20px
      const newHeight = Math.max(20, frame.height - padding * 2); // 最小高度20px
      
      // 更新textbox的位置和尺寸
      text.x = Math.round(newX);
      text.y = Math.round(newY);
      text.width = Math.round(newWidth);
      text.height = Math.round(newHeight);
      
      console.log(`textbox ${i + 1}: 适配后位置 (${text.x}, ${text.y}), 尺寸 ${text.width}x${text.height}`);
    }
    
    console.log('textbox适配完成');
    return texts; // 返回处理后的文本框数组
  }


  /**
   * 核心：把图片 contain 到容器里，且不放大超过 100%
   * @param {Array} images - 图片数组
   * @param {Array} frames - 框架数组
   * @param {number} padding - 内边距，默认8像素
   */
  _fitImagesIntoFrames(images, frames, padding = 0) {
    // Fidelity-first 模式：直接返回原始图片，不做任何适配处理
    if (PRESERVE_EXCEL_LAYOUT) {
      console.log(`Fidelity-first模式：保持Excel原始布局，跳过图片适配处理`);
      return images.map(img => this.maybeSnapToFrame(img, frames));
    }

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
        // 单格子图片：创建frame并使用fit to frame功能
        console.log(`图片 ${i + 1}: 单格子图片，创建frame并使用fit to frame功能`);
        
        // 为这个图片创建一个与格子大小一致的frame
        const cellFrame = {
          x: combinedBounds.x,
          y: combinedBounds.y,
          width: combinedBounds.width,
          height: combinedBounds.height,
          type: 'frame',
          id: `image-frame-${i}`,
          name: `图片Frame ${i + 1}`
        };
        
        // 将frame添加到frames数组中（如果还没有的话）
        const existingFrame = frames.find(f => f.id === cellFrame.id);
        if (!existingFrame) {
          frames.push(cellFrame);
          console.log(`图片 ${i + 1}: 创建了新的frame，尺寸 ${cellFrame.width}x${cellFrame.height}`);
        }
        
        // 使用fit to frame功能将图片适配到frame中
        const fittedImage = this._fitImageToFrame(img, cellFrame, padding);
        
        // 更新图片信息
        img.x = fittedImage.x;
        img.y = fittedImage.y;
        img.width = fittedImage.width;
        img.height = fittedImage.height;
        img.frameId = cellFrame.id; // 记录关联的frame ID
        
        console.log(`图片 ${i + 1}: fit to frame完成 - 新尺寸 ${img.width}x${img.height}, 位置 (${img.x}, ${img.y})`);
      }
    }
    
    console.log('图片尺寸调整完成');
    return images; // 返回处理后的图片数组
  }

  /**
   * 将图片适配到指定的frame中（contain模式）
   * @param {Object} imageInfo - 图片信息对象
   * @param {Object} frameRect - frame矩形 {x, y, width, height}
   * @param {number} padding - 内边距，默认0像素
   * @returns {Object} 适配后的图片位置和尺寸 {x, y, width, height}
   */
  _fitImageToFrame(imageInfo, frameRect, padding = 0) {
    try {
      // 获取原始图片尺寸
      const originalWidth = Math.max(1, imageInfo.originalWidth || imageInfo.width || 1);
      const originalHeight = Math.max(1, imageInfo.originalHeight || imageInfo.height || 1);

      // 计算frame内的可用空间
      const availableWidth = Math.max(1, frameRect.width - padding * 2);
      const availableHeight = Math.max(1, frameRect.height - padding * 2);

      // 计算contain缩放比例（不放大，只缩小）
      const scaleX = availableWidth / originalWidth;
      const scaleY = availableHeight / originalHeight;
      const scale = Math.min(scaleX, scaleY, 1); // 不超过100%原图像素

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

      console.log(`图片适配到frame: 原图(${originalWidth}x${originalHeight}) -> 适配后(${result.width}x${result.height}), 位置(${result.x}, ${result.y})`);
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
            // 图片：强制contain到锚点矩形，不允许超框
            // 先创建资产，再创建形状
            try {
              // 如果图片有关联的frame，先创建frame
              if (element.frameId) {
                // 查找对应的frame信息
                const frameInfo = frames.find(f => f.id === element.frameId);
                if (frameInfo) {
                  // 创建frame形状
                  const frameShape = {
                    type: 'frame',
                    x: frameInfo.x * this.scale,
                    y: frameInfo.y * this.scale,
                    props: {
                      w: frameInfo.width * this.scale,
                      h: frameInfo.height * this.scale,
                      name: frameInfo.name || `图片Frame ${frameCounter + 1}`
                    }
                  };
                  
                  // 先创建frame
                  const frameId = this.editor.createShape(frameShape);
                  console.log(`创建了图片frame: ${frameId}`);
                  
                  // 更新frame信息，添加实际的frame ID
                  frameInfo.tldrawId = frameId;
                }
              }
              
              const assetId = `asset:${(globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2))}`;
              
              // 1) 先把 asset 的天然尺寸设成原图尺寸（asset 只存元数据，不裁图）
              const naturalW = element.originalWidth || element.width;
              const naturalH = element.originalHeight || element.height;
              
              // 创建资产 - 使用原图天然尺寸
              this.editor.store.put([
                {
                  id: assetId,
                  type: "image",
                  typeName: "asset",
                  meta: {},
                  props: {
                    w: naturalW,            // 用原图天然宽高
                    h: naturalH,
                    src: element.url,
                    name: `Excel图片_${Date.now()}`,
                    mimeType: element.mimeType || 'image/png',
                    isAnimated: false
                  }
                }
              ]);
              
              // 2) 计算在"Excel锚点矩形"内的等比缩放（不放大，只缩小）
              const boxX = element.x * this.scale;
              const boxY = element.y * this.scale;
              const boxW = element.width * this.scale;
              const boxH = element.height * this.scale;
              
              const scaleFit = Math.min(boxW / naturalW, boxH / naturalH, 1); // <=1，避免放大导致糊
              const drawW = Math.round(naturalW * scaleFit * 100) / 100; // 提高精度
              const drawH = Math.round(naturalH * scaleFit * 100) / 100; // 提高精度
              
              // 确保尺寸不为0（TLDraw v3要求）
              const finalW = Math.max(1, drawW);
              const finalH = Math.max(1, drawH);
              
              // 居中到锚点矩形内
              const drawX = Math.round(boxX + (boxW - finalW) / 2);
              const drawY = Math.round(boxY + (boxH - finalH) / 2);
              
              if (isNaN(drawX) || isNaN(drawY) || isNaN(finalW) || isNaN(finalH) || finalW <= 0 || finalH <= 0) {
                console.warn('图片元素坐标无效，跳过:', { 
                  element, 
                  drawX, 
                  drawY, 
                  finalW, 
                  finalH,
                  scale: this.scale 
                });
                continue;
              }
              
              // 3) 创建图片 shape（不设置任何 crop，不进 frame）
              // console.log(`创建图片形状: 等比缩放模式，原图(${naturalW}x${naturalH}) -> 显示(${finalW}x${finalH}), 位置(${drawX}, ${drawY})`);
              
              // 4) 验证断言：确保图片不超出锚点矩形
              const exceedsAnchor = finalW > boxW + 0.5 || finalH > boxH + 0.5;
              if (exceedsAnchor) {
                console.error(`FITTING_BROKEN: image exceeds anchor rect - finalW:${finalW} > boxW:${boxW} or finalH:${finalH} > boxH:${boxH}`);
              } else {
                // console.log(`✅ 图片尺寸验证通过: finalW:${finalW} <= boxW:${boxW}, finalH:${finalH} <= boxH:${boxH}`);
              }
              
              // 检查是否有关联的frame
              let parentId = this.editor.getCurrentPageId(); // 默认在页面根
              if (element.frameId) {
                // 如果图片有关联的frame，将图片放在frame内
                const frameInfo = frames.find(f => f.id === element.frameId);
                if (frameInfo && frameInfo.tldrawId) {
                  parentId = frameInfo.tldrawId;
                  console.log(`图片将放置在frame内: ${frameInfo.tldrawId}`);
                }
              }
              
              shape = {
                type: 'image',
                parentId: parentId,
                x: drawX,
                y: drawY,
                props: {
                  w: finalW,
                  h: finalH,
                  assetId: assetId
                }
              };
            } catch (error) {
              console.warn('创建图片资产失败:', error);
              continue; // 跳过这个图片
            }
            break;
            
          case 'text':
            // 文本：保留锚点矩形宽度触发换行，必要时跑shrink-and-refit字号逻辑
            // 验证坐标和尺寸是否为有效数字
            const textX = element.x * this.scale;
            const textY = element.y * this.scale;
            const textW = element.width * this.scale;
            const textH = element.height * this.scale;
            
            if (isNaN(textX) || isNaN(textY) || isNaN(textW) || isNaN(textH)) {
              console.warn('文字元素坐标无效，跳过:', { 
                element, 
                textX, 
                textY, 
                textW,
                textH,
                scale: this.scale 
              });
              continue;
            }
            
            // 检查是否是textbox类型
            if (element.type === 'textbox') {
              // 为textbox创建自适应文本
              const textElement = {
                x: textX,
                y: textY,
                width: textW,
                height: textH,
                text: element.text,
                fontSize: element.fontSize || 12
              };
              
              // 计算文本适配配置
              const fitConfig = createTextFitConfig(textElement, {
                basePt: element.fontSize || 12,
                minPt: 8,
                lineHeight: 1.35
              });
              
              console.log(`文本框适配: 原字号${fitConfig.originalPt}pt -> 适配字号${fitConfig.fitPt}pt, 行数${fitConfig.lines.length}`);
              
              // 创建白底矩形（可选）
              const backgroundColor = element.fill?.color || '#FFFFFF';
              const backgroundShape = {
                type: 'geo',
                x: textX,
                y: textY,
                props: {
                  geo: 'rectangle',
                  w: textW,
                  h: textH,
                  fill: 'solid',
                  color: this.mapColorToTLDraw(backgroundColor)
                }
              };
              
              // 创建自适应文本
              const textShape = {
                type: 'text',
                x: textX + 4, // 稍微偏移避免贴边
                y: textY + 4,
                parentId: this.editor.getCurrentPageId(), // 不入frame，避免被裁剪
                props: {
                  w: Math.max(4, Math.round(textW - 8)), // 固定宽度触发换行，至少4px
                  richText: this.createSafeRichText(fitConfig.softenedText), // 使用安全的富文本格式
                  size: this.mapFontSizeToTLDraw(fitConfig.fitPt), // 映射到TLDraw v3的size值
                  color: 'black'
                }
              };
              
              // 先创建背景，再创建文字
              shapes.push(backgroundShape);
              shapes.push(textShape);
              continue;
            } else {
              // 普通单元格文字（无背景，但也要适配）
              const textElement = {
                x: textX,
                y: textY,
                width: textW,
                height: textH,
                text: element.text,
                fontSize: element.fontSize || 12
              };
              
              // 计算文本适配配置
              const fitConfig = createTextFitConfig(textElement, {
                basePt: element.fontSize || 12,
                minPt: 8,
                lineHeight: 1.35
              });
              
              shape = {
                type: 'text',
                x: textX,
                y: textY,
                parentId: this.editor.getCurrentPageId(), // 不入frame，避免被裁剪
                props: {
                  w: Math.max(4, Math.round(textW)), // 固定宽度触发换行，至少4px
                  richText: this.createSafeRichText(fitConfig.softenedText), // 使用安全的富文本格式
                  size: this.mapFontSizeToTLDraw(fitConfig.fitPt), // 映射到TLDraw v3的size值
                  color: 'black'
                }
              };
            }
            break;
            
          case 'frame':
            // 使用新的工具函数创建frame形状
            shape = createImageFrameShape(element, this.scale);
            if (shape) {
              frameCounter++;
            }
            break;
            
          case 'background':
            // 验证背景坐标和尺寸
            const bgX = element.x * this.scale;
            const bgY = element.y * this.scale;
            const bgW = element.width * this.scale;
            const bgH = element.height * this.scale;
            
            if (isNaN(bgX) || isNaN(bgY) || isNaN(bgW) || isNaN(bgH)) {
              console.warn('背景元素坐标无效，跳过:', { 
                element, 
                bgX, 
                bgY, 
                bgW, 
                bgH,
                scale: this.scale 
              });
              continue;
            }
            
            shape = {
              type: 'geo',
              x: bgX,
              y: bgY,
              props: {
                geo: 'rectangle',
                w: bgW,
                h: bgH,
                fill: 'solid',
                color: this.mapColorToTLDraw(element.color)
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
   * 后处理文本形状：缩窄过于宽的文本框
   * @param {Array} textElements - 文本元素数组
   */
  async postProcessTextShapes(textElements) {
    if (!textElements || textElements.length === 0) {
      return;
    }

    console.log(`开始后处理 ${textElements.length} 个文本形状...`);
    
    // 获取当前页面的所有文本形状
    const currentPageShapes = this.editor.getCurrentPageShapes();
    const textShapes = currentPageShapes.filter(shape => shape.type === 'text');
    
    console.log(`找到 ${textShapes.length} 个文本形状进行后处理`);
    
    for (const textShape of textShapes) {
      try {
        // 检查文本是否过宽（宽度 > 300px 或包含长串）
        const currentWidth = textShape.props.w || 0;
        const richText = textShape.props.richText;
        const text = richText?.text || '';
        
        // 判断是否需要缩窄
        const needsShrinking = currentWidth > 300 || 
                              text.length > 50 || 
                              /[A-Za-z0-9]{20,}/.test(text);
        
        if (needsShrinking) {
          // 计算目标宽度（比当前宽度小20%，但至少100px）
          const targetWidth = Math.max(100, Math.round(currentWidth * 0.8));
          
          console.log(`缩窄文本形状 ${textShape.id}: ${currentWidth}px -> ${targetWidth}px`);
          
          // 使用shrinkAndRefitTextShape进行缩窄
          shrinkAndRefitTextShape(this.editor, textShape.id, targetWidth, {
            minPt: 8,
            lineHeight: 1.35
          });
        }
      } catch (error) {
        console.warn(`后处理文本形状 ${textShape.id} 失败:`, error);
      }
    }
    
    console.log('文本形状后处理完成');
  }

  /**
   * 主转换方法
   * @param {File} file - Excel文件
   */
  async convertExcelToTLDraw(file) {
    try {
      console.log('开始转换Excel文件:', file.name);
      
      // 读取Excel文件
      const fileBuffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(fileBuffer);
      
      // 同时创建JSZip对象用于DrawingML解析
      const zip = await JSZip.loadAsync(fileBuffer);
      
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
      
      // 使用DrawingML解析器提取文本框和图片
      console.log('开始使用DrawingML解析器提取元素...');
      const drawingMLElements = await this.extractDrawingMLElements(worksheet, zip);
      console.log('DrawingML解析结果:', drawingMLElements);
      
      // 显示过滤统计
      if (drawingMLElements.skipped && drawingMLElements.skipped.length > 0) {
        console.log(`DrawingML过滤了 ${drawingMLElements.skipped.length} 个幽灵元素`);
      }
      
      // 合并DrawingML的文本框到现有文字数组
      const allTexts = [];
      
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
      const cellTexts = this.extractTexts(worksheet, mergedCells, images);
      console.log('提取到单元格文字数量:', cellTexts.length);
      
      // 合并单元格文字和DrawingML文本框
      allTexts.push(...cellTexts);
      allTexts.push(...drawingMLElements.texts);
      
      console.log('合并后总文字数量:', allTexts.length);
      console.log('其中单元格文字:', cellTexts.length, 'DrawingML文本框:', drawingMLElements.texts.length);
      
      // 调试：显示所有提取的文字内容
      console.log('=== 单元格文字内容 ===');
      cellTexts.forEach((text, index) => {
        console.log(`${index + 1}. "${text.text}" (${text.x}, ${text.y})`);
      });
      
      console.log('=== DrawingML文本框内容 ===');
      drawingMLElements.texts.forEach((text, index) => {
        console.log(`${index + 1}. "${text.text}" (${text.x}, ${text.y})`);
      });
      
      // 去重：移除重复的文字（相同内容和相近位置）
      const uniqueTexts = [];
      const seenTexts = new Set();
      
      for (const text of allTexts) {
        // 创建文字的唯一标识（内容+位置）
        const textKey = `${text.text}_${Math.round(text.x)}_${Math.round(text.y)}`;
        
        if (!seenTexts.has(textKey)) {
          seenTexts.add(textKey);
          uniqueTexts.push(text);
        } else {
          console.log(`跳过重复文字: "${text.text}" 位置(${text.x}, ${text.y})`);
        }
      }
      
      console.log(`去重后文字数量: ${uniqueTexts.length} (原来: ${allTexts.length})`);
      allTexts.length = 0; // 清空原数组
      allTexts.push(...uniqueTexts); // 使用去重后的数组
      
      // 4. 提取单元格背景色
      console.log('开始提取单元格背景色...');
      const backgrounds = this.extractCellBackgrounds(worksheet, mergedCells);
      console.log('提取到背景色数量:', backgrounds.length);
      
      // 5. 提取表格框架
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
      console.log('images变量:', images, '类型:', typeof images, '长度:', images?.length);
      console.log('allTexts变量:', allTexts, '类型:', typeof allTexts, '长度:', allTexts?.length);
      console.log('frames变量:', frames, '类型:', typeof frames, '长度:', frames?.length);
      
      let adjustedImages = images || [];  // 直接使用原始图片位置，提供默认值
      let adjustedTexts = allTexts || []; // 使用合并后的文字位置，提供默认值
      const adjustedFrames = frames || [];  // 直接使用原始框架位置，提供默认值
      
      // 6.5. 新逻辑：为每张图片生成对应的frame，然后适配图片到frame中
      const { adjustedImages: processedImages, imageFrames } = processImagesWithFrames(
        adjustedImages, 
        createFrameFromImageAnchor, 
        placeImageIntoFrame
      );
      
      // 更新调整后的图片数组
      adjustedImages.length = 0;
      adjustedImages.push(...processedImages);
      
      // 将图片frame添加到总的frame数组中
      adjustedFrames.push(...imageFrames);
      console.log(`生成了${imageFrames.length}个图片frame，总共${adjustedFrames.length}个frame`);
      
      // 处理textbox适配
      adjustedTexts = this._fitTextboxesIntoFrames(adjustedTexts, adjustedFrames, 4);
      console.log('textbox适配完成');
      
      // 7. 批量创建形状（按正确层级顺序：背景→边框→图片→文本）
      console.log('开始创建TLDraw形状...');
      
      // 1. 先创建背景色（最底层）
      if (backgrounds.length > 0) {
        console.log('开始创建背景色形状...');
        await this.createShapesBatch(backgrounds, 'background');
      }
      
      // 2. 创建frame（包括表格框和图片frame）
      if (adjustedFrames.length > 0) {
        console.log('开始创建frame形状...');
        try {
          await this.createShapesBatch(adjustedFrames, 'frame');
        } catch (frameError) {
          console.warn('frame创建失败，但不影响其他内容:', frameError);
        }
      }
      
      // 3. 创建图片（放在框之上，不入frame）
      if (adjustedImages.length > 0) {
        console.log('开始创建图片形状...');
        await this.createShapesBatch(adjustedImages, 'image');
      }
      
      // 4. 最后创建文字（最上层）
      if (adjustedTexts.length > 0) {
        console.log('开始创建文字形状...');
        await this.createShapesBatch(adjustedTexts, 'text');
        
        // 5. 后处理：缩窄过于宽的文本框
        console.log('开始后处理文本缩窄...');
        await this.postProcessTextShapes(adjustedTexts);
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
      console.log(`创建了 ${backgrounds.length} 个背景色, ${frames.length} 个表格框, ${images.length} 个图片, ${allTexts.length} 个文字`);
      
      return {
        success: true,
        stats: {
          backgrounds: backgrounds.length,
          frames: frames.length, // 使用矩形框代替frame
          images: images.length,
          texts: allTexts.length,
          cellTexts: cellTexts.length,
          drawingMLTexts: drawingMLElements.texts.length,
          mergedCells: mergedCells.length,
          note: '包含DrawingML样式解析、单元格背景色、表格边框和文本框'
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
