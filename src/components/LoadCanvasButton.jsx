import React, { useRef, useState } from "react";
import { loadSnapshot } from "tldraw";
import ExcelJS from 'exceljs';
import { toRichText } from 'tldraw';
import storageManager from '../utils/storageManager.js';
import SheetSelectionDialog from './SheetSelectionDialog.jsx';

export default function LoadCanvasButton({ editor, setIsLoading }) {
  const fileInputRef = useRef(null);
  const [showSheetDialog, setShowSheetDialog] = useState(false);
  const [currentFile, setCurrentFile] = useState(null);

  // 检测是否有多个工作表导出
  const checkMultipleSheets = async (file) => {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(file);
      
      const layoutSheet = workbook.getWorksheet('LayoutJson');
      if (!layoutSheet) {
        return { hasMultiple: false, sheets: [] };
      }

      const maxRow = layoutSheet.rowCount;
      const availableSheets = [];

      for (let row = 1; row <= maxRow; row++) {
        const cellValue = layoutSheet.getCell(row, 1).value;
        
        if (cellValue && typeof cellValue === 'string' && cellValue.length > 0) {
          if (cellValue.includes('"sheet":{') && cellValue.includes('"name":')) {
            try {
              const sheetName = extractSheetNameFromJson(cellValue);
              if (sheetName) {
                availableSheets.push({
                  name: sheetName,
                  row: row,
                  hasMultipleColumns: layoutSheet.getCell(row, 2).value && 
                                   layoutSheet.getCell(row, 2).value.length > 0
                });
              }
            } catch (parseError) {
              console.warn(`解析第${row}行JSON失败:`, parseError);
            }
          }
        }
      }

      return {
        hasMultiple: availableSheets.length > 1,
        sheets: availableSheets
      };
    } catch (error) {
      console.error('检测多工作表失败:', error);
      return { hasMultiple: false, sheets: [] };
    }
  };

  // 从JSON字符串中提取工作表名称
  const extractSheetNameFromJson = (jsonStr) => {
    try {
      const searchPattern = '"sheet":{"name":"';
      const startPos = jsonStr.indexOf(searchPattern);
      
      if (startPos > -1) {
        const nameStart = startPos + searchPattern.length;
        const nameEnd = jsonStr.indexOf('"', nameStart);
        
        if (nameEnd > nameStart) {
          return jsonStr.substring(nameStart, nameEnd);
        }
      }
      
      return null;
    } catch (error) {
      console.warn('提取工作表名称失败:', error);
      return null;
    }
  };

  // Excel处理函数
  const processExcelFile = async (file, selectedSheet = null) => {
    const loadingMessage = document.createElement('div');
    loadingMessage.textContent = '正在读取Excel文件中的LayoutJson...';
    loadingMessage.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.8); color: white; padding: 20px; border-radius: 8px;
      z-index: 10000; font-family: Arial, sans-serif;
    `;
    document.body.appendChild(loadingMessage);

    try {
      console.log('开始读取Excel文件中的LayoutJson sheet...');
      
      // 1. 读取Excel文件
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(file);
      
      console.log('找到LayoutJson sheet');
      console.log('工作簿调试信息:', {
        workbookName: workbook.name,
        sheetCount: workbook.worksheets.length,
        sheetNames: workbook.worksheets.map(ws => ws.name)
      });
      
      // 2. 找到LayoutJson sheet
      const layoutSheet = workbook.getWorksheet('LayoutJson');
      if (!layoutSheet) {
        throw new Error('未找到LayoutJson sheet');
      }
      
      // 3. 确定要读取的行
      let targetRow = 1; // 默认第一行
      if (selectedSheet) {
        targetRow = selectedSheet.row;
        console.log(`加载选中的工作表: ${selectedSheet.name} (第${targetRow}行)`);
      }
      
      // 4. 检查是否分割的JSON（横向扩展模式）
      let jsonContent = '';
      
      // 从指定行读取JSON
      const singleJson = layoutSheet.getCell(targetRow, 1).value;
      if (singleJson && singleJson.length > 0) {
        // 检查下一列是否有内容，如果有则说明是横向分割的JSON
        const secondChunk = layoutSheet.getCell(targetRow, 2).value;
        if (secondChunk && secondChunk.length > 0) {
          // 横向分割的JSON，需要重新组合
          console.log(`检测到第${targetRow}行横向分割的JSON`);
          
          // 横向读取：A{targetRow}, B{targetRow}, C{targetRow}...
          let columnIndex = 1;
          let chunk = layoutSheet.getCell(targetRow, columnIndex).value;
          
          while (chunk && chunk.length > 0) {
            jsonContent += chunk;
            columnIndex++;
            chunk = layoutSheet.getCell(targetRow, columnIndex).value;
          }
          
          console.log(`横向分割的JSON，总列数: ${columnIndex - 1}`);
        } else {
          // 单个JSON，直接从指定行读取
          jsonContent = singleJson;
        }
      }
      
      console.log('读取到JSON内容长度:', jsonContent.length);
      
      if (!jsonContent) {
        throw new Error(`LayoutJson sheet第${targetRow}行中没有找到有效数据`);
      }
      
      // 4. 解析JSON
      const layoutData = JSON.parse(jsonContent);
      console.log('成功解析布局数据:', layoutData);
      
      // 5. 清空当前画布
      const currentShapes = editor.getCurrentPageShapes();
      if (currentShapes.length > 0) {
        const shapeIds = currentShapes.map(shape => shape.id);
        editor.deleteShapes(shapeIds);
      }
      
      // 6. 处理布局数据并创建形状
      await processLayoutData(layoutData, file);
      
      // 6.5 触发自动保存，确保导入的内容被保存
      setTimeout(async () => {
        try {
          console.log('===== Excel导入完成后触发自动保存 =====');
          const { getSnapshot } = await import('tldraw');
          const canvasData = getSnapshot(editor.store);
          const currentPageId = editor.getCurrentPageId();
          const currentShapes = editor.getCurrentPageShapes();
          const imageShapes = currentShapes.filter(shape => shape.type === 'image');
          const viewport = editor.getViewportPageBounds();
          const camera = editor.getCamera();
          
          console.log('准备保存的数据:', {
            shapesCount: currentShapes.length,
            shapes: currentShapes.map(s => ({ id: s.id, type: s.type })),
            imageCount: imageShapes.length
          });
          
          // 检查快照中的形状
          if (canvasData && canvasData.store) {
            const shapesInSnapshot = Object.keys(canvasData.store).filter(key => 
              key.startsWith('shape:') && !key.includes('pointer')
            );
            console.log('快照中的形状数量:', shapesInSnapshot.length);
          }
          
          const autoSaveData = {
            canvasData,
            currentPageId,
            imageInfo: imageShapes.map(shape => ({ shapeId: shape.id })),
            viewport: {
              x: viewport.x,
              y: viewport.y,
              width: viewport.width,
              height: viewport.height
            },
            camera: {
              x: camera.x,
              y: camera.y,
              z: camera.z
            },
            version: '1.0',
            timestamp: Date.now(),
            autoSave: true,
            source: 'excel-import' // 标记数据来源
          };
          
              // 使用智能存储管理器保存（支持 IndexedDB 大容量）
              const result = await storageManager.saveCanvas(autoSaveData);
              
              if (result.success) {
                console.log(`✅ Excel导入后自动保存完成 (${result.method}, ${result.size}MB)，形状数量:`, currentShapes.length);
                console.log('=====================================');
              } else {
                console.error('❌ Excel导入后自动保存失败:', result.error);
                if (parseFloat(result.size) > 10) {
                  alert(`Excel 数据太大 (${result.size}MB)，无法自动保存。\n刷新后将无法恢复，请使用"保存画布"按钮手动保存为文件。`);
                }
              }
        } catch (saveError) {
          console.error('❌ Excel导入后自动保存失败:', saveError);
        }
      }, 1500); // 增加等待时间到 1.5 秒
      
      // 7. 移除加载提示
      document.body.removeChild(loadingMessage);
      console.log('Excel LayoutJson重构测试完成！');
      
    } catch (error) {
      document.body.removeChild(loadingMessage);
      console.error('处理Excel文件失败:', error);
      alert('处理Excel文件失败: ' + error.message);
    }
  };

  // 处理布局数据的函数
  const processLayoutData = async (layoutData, file) => {
    // 开始处理布局数据
    
    // 1. 设置画布尺寸（如果需要）
    if (layoutData.sheet && layoutData.sheet.sizePx) {
      // 画布尺寸已设置
    }
    
    // 2. 创建所有元素的统一列表并按Z-order排序
    const allElements = [];
    
    // 添加文本框
    if (layoutData.sheet && layoutData.sheet.textboxes) {
      for (const textbox of layoutData.sheet.textboxes) {
        allElements.push({
          type: 'textbox',
          data: textbox,
          z: textbox.z
        });
      }
    }
    
    // 添加图片
    if (layoutData.sheet && layoutData.sheet.images) {
      for (const image of layoutData.sheet.images) {
        allElements.push({
          type: 'image',
          data: image,
          z: image.z
        });
      }
    }
    
    // 按Z-order排序，Z值小的先创建（在底层）
    const sortedElements = allElements.sort((a, b) => a.z - b.z);
    console.log('所有元素Z-order排序:', sortedElements.map(el => ({ 
      type: el.type, 
      name: el.data.name, 
      z: el.z 
    })));
    
    // 3. 首先提取图片数据
    let extractedImages = [];
    if (layoutData.sheet && layoutData.sheet.images && layoutData.sheet.images.length > 0) {
      try {
        console.log('提取图片数据...');
        const { importExcelToTLDraw } = await import('../utils/excelUtils.js');
        const tempResult = await importExcelToTLDraw(file, null, { extractOnly: true });

        if (tempResult.success && tempResult.data && tempResult.data.images) {
          extractedImages = tempResult.data.images;
          console.log('从importExcelToTLDraw提取到图片:', extractedImages.length);
        } else {
          // 找到原始工作表来提取图片
          const originalSheetName = layoutData.sheet.name;
          const workbook = new ExcelJS.Workbook();
          await workbook.xlsx.load(file);
          const originalSheet = workbook.getWorksheet(originalSheetName);
          
          if (originalSheet) {
            console.log('找到原始工作表:', originalSheetName);
            const { ExcelToTLDrawConverter } = await import('../utils/excelConverter.js');
            const converter = new ExcelToTLDrawConverter(null);
            const images = await converter.extractImages(originalSheet);
            extractedImages = images;
            console.log('从ExcelToTLDrawConverter提取到图片:', extractedImages.length);
          } else {
            console.warn('未找到原始工作表:', originalSheetName);
          }
        }
      } catch (error) {
        console.warn('图片提取失败:', error);
      }
    }

    // 提取图片创建函数
    async function createImageShape(editor, imageInfo, imageData) {
      // 检查是否已存在相同的图片（跨页面检测）
      const { checkExistingImageByContent } = await import('../utils/assetUtils.js');
      let assetId = await checkExistingImageByContent(editor, imageData.url);
      
      if (!assetId) {
        // 创建新的图片资产
        assetId = `asset:${(globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2))}`;
        
        // 预加载图片获取真实尺寸
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = imageData.url;
        });

        const naturalW = img.naturalWidth || imageInfo.width;
        const naturalH = img.naturalHeight || imageInfo.height;
        
        console.log(`🖼️ Asset尺寸分析: 自然尺寸${naturalW}×${naturalH}, Excel尺寸${imageInfo.width}×${imageInfo.height}`);
        
        // 检查是否需要正方形策略 - 使用Excel尺寸判断
        const excelAspectRatio = imageInfo.width / imageInfo.height;
        const isExcelVeryWide = excelAspectRatio > 1.8;
        
        console.log(`🔍 Excel长宽比: ${excelAspectRatio.toFixed(2)}:1, 是否超宽:${isExcelVeryWide}`);
        
        let assetW, assetH;
        if (isExcelVeryWide) {
          // 超宽图片Asset策略：保持原始尺寸，让TLDraw的contain机制处理
          assetW = naturalW;
          assetH = naturalH; // 保持原始比例，让TLDraw自动处理
          console.log(`🎯 Asset超宽策略: 保持原始尺寸${naturalW}×${naturalH}，让TLDraw处理contain`);
        } else {
          // 普通策略：使用原始尺寸
          assetW = naturalW;
          assetH = naturalH;
        }

        // 创建资产
        editor.createAssets([
          {
            id: assetId,
            type: "image",
            typeName: "asset",
            meta: {},
            props: {
              w: assetW,
              h: assetH,
              src: imageData.url,
              name: imageInfo.name,
              mimeType: imageData.mimeType || 'image/png',
              isAnimated: false
            }
          }
        ]);
        
        // 创建新图片资产
      } else {
        // 重用现有图片资产
      }

      // 创建图片形状 - 直接使用VBA提供的精确坐标
      // 确保assetId有正确的前缀
      const normalizedAssetId = assetId.startsWith('asset:') ? assetId : `asset:${assetId}`;
      
       // 智能补偿策略：超宽图片使用正方形策略
       const aspectRatio = imageInfo.width / imageInfo.height;
       const isVeryWide = aspectRatio > 1.8; // 降低阈值到1.8:1，更容易触发正方形策略
       
       console.log(`🔍 图片分析: ${imageInfo.width}×${imageInfo.height}, 长宽比${aspectRatio.toFixed(2)}:1, 是否超宽:${isVeryWide}`);
       
       let adjustedWidth, adjustedHeight, adjustedX, adjustedY;
       
       if (isVeryWide) {
         // 超宽图片TLDraw兼容策略：使用更大的Shape尺寸，让TLDraw自动处理contain
         // 根据TLDraw的设计理念，Shape尺寸应该足够大以容纳完整图片
         const scaleFactor = 1.5; // 放大1.5倍，给图片更多空间
         
         adjustedWidth = imageInfo.width * scaleFactor;
         adjustedHeight = imageInfo.height * scaleFactor;
         
         // 保持图片中心对齐
         const widthOffset = (adjustedWidth - imageInfo.width) / 2;
         const heightOffset = (adjustedHeight - imageInfo.height) / 2;
         adjustedX = imageInfo.left - widthOffset;
         adjustedY = imageInfo.top - heightOffset;
         
         console.log(`🎯 超宽图片TLDraw兼容策略: 长宽比${aspectRatio.toFixed(2)}:1`);
         console.log(`   放大系数: ${scaleFactor}x, 尺寸: ${adjustedWidth.toFixed(1)}×${adjustedHeight.toFixed(1)}`);
         console.log(`   位置偏移: X-${widthOffset.toFixed(1)}px, Y-${heightOffset.toFixed(1)}px`);
       } else {
         // 普通补偿策略：扩大Shape并调整位置
         const horizontalCompensation = 16; // 左右各补偿16像素
         const verticalCompensation = 8;   // 上下各补偿8像素
         
         adjustedWidth = imageInfo.width + horizontalCompensation * 2;
         adjustedHeight = imageInfo.height + verticalCompensation * 2;
         
         // 调整位置使图片视觉中心与Excel对齐
         adjustedX = imageInfo.left - horizontalCompensation;
         adjustedY = imageInfo.top - verticalCompensation;
         
         console.log(`📐 普通图片补偿策略: H±${horizontalCompensation}px, V±${verticalCompensation}px`);
       }
      
       console.log(`📐 VBA图片处理:`);
       console.log(`   Excel位置/尺寸: (${imageInfo.left}, ${imageInfo.top}) ${imageInfo.width}×${imageInfo.height}`);
       console.log(`   处理后位置/尺寸: (${adjustedX}, ${adjustedY}) ${adjustedWidth}×${adjustedHeight}`);
       console.log(`   策略: ${isVeryWide ? 'TLDraw兼容策略' : '普通补偿策略'}`);
      
      const imageShape = {
        type: 'image',
        x: adjustedX,  // 使用调整后的位置
        y: adjustedY,  // 使用调整后的位置
        props: {
          w: adjustedWidth,   // 使用补偿后的宽度
          h: adjustedHeight,  // 使用补偿后的高度
          assetId: normalizedAssetId
        }
      };
      
      // 图片宽度补偿已应用，确保无裁剪
      
      editor.createShape(imageShape);
      // 图片形状创建完成
    }

    // 4. 按Z-order顺序创建所有元素
    
    for (const element of sortedElements) {
      try {
        if (element.type === 'textbox') {
          // 创建文本框
          const textbox = element.data;
          
          // 检查是否有真正的边框或填充
          const hasBorder = textbox.border && textbox.border.style !== 'none';
          const hasFill = textbox.fill && 
                         textbox.fill.color && 
                         textbox.fill.color !== '#FFFFFF' && 
                         textbox.fill.opacity > 0;
          
          if (hasBorder || hasFill) {
            // 创建带边框和填充的背景矩形
            const backgroundShape = {
              type: 'geo',
              x: textbox.left,
              y: textbox.top,
              props: {
                geo: 'rectangle',
                w: textbox.width,
                h: textbox.height,
                fill: hasFill ? 'solid' : 'none',
                color: hasFill ? mapColorToTLDraw(textbox.fill.color) : 'black',
                ...(hasBorder && {
                  dash: mapBorderStyle(textbox.border.style),
                  size: 's'  // 强制设置为最细边框
                })
              }
            };
            
            editor.createShape(backgroundShape);
            // 文本框背景创建完成
          }
          
          // 创建文字内容
          const padding = 6; // 增加内边距，确保文字不贴边
          const textWidth = Math.max(textbox.width - (padding * 2), 20);
          
          // 直接使用原始文本，让TLDraw自动处理换行
          const processedText = textbox.text;
          
          // 使用TLDraw官方文档的正确语法，通过props.w设置固定宽度
          const textShape = {
            type: 'text',
            x: textbox.left + padding,
            y: textbox.top + padding,
            props: {
              richText: toRichText(processedText), // 使用toRichText函数
              w: textWidth, // 设置固定宽度，让文本自动换行
              autoSize: false, // 禁用自动调整大小，使用固定宽度
            }
          };
          
          // 添加调试信息
          editor.createShape(textShape);
          // 文本框创建完成
          
        } else if (element.type === 'image') {
          // 创建图片
          const imageInfo = element.data;
          let imageData = null;
          
          // 尝试匹配图片数据（仅用于获取Base64数据，不使用坐标）
          if (extractedImages.length > 0) {
            // 简单的索引匹配
            const imageIndex = layoutData.sheet.images.indexOf(imageInfo);
            if (imageIndex >= 0 && imageIndex < extractedImages.length) {
              imageData = extractedImages[imageIndex];
              console.log('图片数据匹配:', {
                vba坐标: { x: imageInfo.left, y: imageInfo.top },
                提取坐标: { x: imageData.x, y: imageData.y },
                说明: '仅使用提取的Base64数据，坐标完全以VBA为准'
              });
            }
          }
          
          // 检查是否启用懒加载
          const enableLazyLoading = false; // 禁用懒加载，避免API错误
          if (enableLazyLoading && imageData && imageData.url) {
            // 使用懒加载
            const { getLazyLoadingManager } = await import('../utils/lazyLoading.js');
            const lazyManager = getLazyLoadingManager(editor);
            
            // 设置加载回调
            lazyManager.setLoadCallback(async (imageId, imageData) => {
              await createImageShape(editor, imageInfo, imageData);
            });
            
            // 添加待加载图片
            const imageId = `lazy_${imageInfo.name}_${Date.now()}`;
            const imageDataWithPosition = {
              ...imageData,
              x: imageInfo.left,
              y: imageInfo.top,
              width: imageInfo.width,
              height: imageInfo.height
            };
            
            lazyManager.addPendingImage(imageId, imageDataWithPosition);
            console.log('🔄 图片已加入懒加载队列:', imageInfo.name);
            continue; // 跳过立即创建
          }
          
          if (imageData && imageData.url) {
            // 使用提取的图片创建函数
            await createImageShape(editor, imageInfo, imageData);
          } else {
            // 创建占位符 - 直接使用VBA提供的精确坐标
            const placeholderShape = {
              type: 'geo',
              x: imageInfo.left,  // 直接使用VBA的精确坐标
              y: imageInfo.top,   // 直接使用VBA的精确坐标
              props: {
                geo: 'rectangle',
                w: imageInfo.width,  // 直接使用VBA的精确宽度
                h: imageInfo.height, // 直接使用VBA的精确高度
                fill: 'none',
                color: 'grey',
                dash: 'dashed'
              }
            };
            
            editor.createShape(placeholderShape);
            // 图片占位符创建完成
          }
        }
      } catch (error) {
        console.warn('创建元素失败:', element.data.name, error);
      }
    }
    
    // 5. 重构单元格数据 - 使用VBA提供的精确坐标
    if (layoutData.sheet && layoutData.sheet.cells) {
      console.log('开始重构单元格:', layoutData.sheet.cells.length);
      
      for (const cell of layoutData.sheet.cells) {
        try {
          // 验证并设置默认值
          const x = typeof cell.x === 'number' ? cell.x : 0;
          const y = typeof cell.y === 'number' ? cell.y : 0;
          const w = typeof cell.w === 'number' && cell.w > 0 ? cell.w : 50; // 默认宽度50
          const h = typeof cell.h === 'number' && cell.h > 0 ? cell.h : 20; // 默认高度20
          
          // 使用VBA提供的精确坐标和尺寸
          const cellShape = {
            type: 'geo',
            x: x, // 使用验证后的X坐标
            y: y, // 使用验证后的Y坐标
            props: {
              geo: 'rectangle',
              w: w, // 使用验证后的宽度
              h: h, // 使用验证后的高度
              fill: 'none',
              color: 'grey', // 使用tldraw v3支持的颜色名称
              dash: 'solid',
              size: 's' // 细线条
            }
          };
          
          // 创建单元格边框
          editor.createShape(cellShape);
          
          // 如果有内容，添加文本
          if (cell.v && cell.v.trim()) {
            const textShape = {
              type: 'text',
              x: x + 2, // 稍微偏移，避免与边框重叠
              y: y + 2,
              props: {
                w: Math.max(w - 4, 10), // 确保最小宽度
                richText: toRichText(cell.v),
                size: 's',
                color: 'black',
                font: 'draw'
              }
            };
            
            editor.createShape(textShape);
          }
          
          // 单元格创建完成
        } catch (error) {
          console.warn('创建单元格失败:', cell, error);
        }
      }
    }
    
    console.log('布局数据处理完成');
  };

  const loadCanvas = async (file) => {
    if (!editor) {
      return;
    }

    // 显示加载提示
    const loadingMessage = document.createElement('div');
    
    try {
      console.log('开始加载画布...');
      loadingMessage.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 20px;
        border-radius: 8px;
        z-index: 3000;
        font-size: 16px;
      `;
      loadingMessage.textContent = '正在加载画布...';
      document.body.appendChild(loadingMessage);
      
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const saveData = JSON.parse(e.target.result);
          
          // 1. 重置当前画布 - 使用更安全的方法
          try {
            // 尝试删除所有形状而不是清空store
            const currentShapes = editor.getCurrentPageShapes();
            if (currentShapes.length > 0) {
              const shapeIds = currentShapes.map(shape => shape.id);
              try {
                editor.deleteShapes(shapeIds);
              } catch (deleteError) {
                // 备用方案：逐个删除
                for (const shapeId of shapeIds) {
                  try {
                    editor.deleteShapes([shapeId]);
                  } catch (singleDeleteError) {
                    // 删除单个形状失败，静默处理
                  }
                }
              }
            }
            
            // 等待删除操作完成
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (clearError) {
            // 清空画布时出错，静默处理
          }
          
          // 2. 直接使用loadSnapshot加载完整状态
          if (saveData.canvasData) {
            try {
              // Tldraw v3: 使用loadSnapshot加载完整状态
              try {
                loadSnapshot(editor.store, saveData.canvasData);
                
                // 标记为加载状态，触发组件完全重新渲染
                setIsLoading(true);
                
                // 延迟重新渲染，确保加载完成
                setTimeout(() => {
                  setIsLoading(false);
                }, 500);
                
              } catch (error) {
                // 加载画布状态时出错，静默处理
              }
              
              // 等待加载完成
              await new Promise(resolve => setTimeout(resolve, 200));
            } catch (error) {
              // 加载画布状态时出错，静默处理
            }
          }
          
          // 3. 检查加载结果
          const loadedShapes = editor.getCurrentPageShapes();
          const imageShapes = loadedShapes.filter(shape => shape.type === 'image');
          
          // 4. 更新localStorage中的图片ID列表
          if (saveData.imageInfo) {
            const currentImageIds = saveData.imageInfo.map(img => img.shapeId);
            localStorage.setItem('currentImageIds', JSON.stringify(currentImageIds));
          }
          
          // 4.5 触发自动保存，确保加载的内容被保存
          setTimeout(async () => {
            try {
              console.log('===== 加载完成后触发自动保存 =====');
              const { getSnapshot } = await import('tldraw');
              const canvasData = getSnapshot(editor.store);
              const currentPageId = editor.getCurrentPageId();
              const currentShapes = editor.getCurrentPageShapes();
              const imageShapes = currentShapes.filter(shape => shape.type === 'image');
              const viewport = editor.getViewportPageBounds();
              const camera = editor.getCamera();
              
              console.log('准备保存的数据:', {
                shapesCount: currentShapes.length,
                shapes: currentShapes.map(s => ({ id: s.id, type: s.type })),
                imageCount: imageShapes.length
              });
              
              // 检查快照中的形状
              if (canvasData && canvasData.store) {
                const shapesInSnapshot = Object.keys(canvasData.store).filter(key => 
                  key.startsWith('shape:') && !key.includes('pointer')
                );
                console.log('快照中的形状数量:', shapesInSnapshot.length);
              }
              
              const autoSaveData = {
                canvasData,
                currentPageId,
                imageInfo: imageShapes.map(shape => ({ shapeId: shape.id })),
                viewport: {
                  x: viewport.x,
                  y: viewport.y,
                  width: viewport.width,
                  height: viewport.height
                },
                camera: {
                  x: camera.x,
                  y: camera.y,
                  z: camera.z
                },
                version: '1.0',
                timestamp: Date.now(),
                autoSave: true,
                source: 'json-load' // 标记数据来源
              };
              
              // 使用智能存储管理器保存（支持 IndexedDB 大容量）
              const result = await storageManager.saveCanvas(autoSaveData);
              
              if (result.success) {
                console.log(`✅ JSON加载后自动保存完成 (${result.method}, ${result.size}MB)，形状数量:`, currentShapes.length);
                console.log('=====================================');
              } else {
                console.error('❌ JSON加载后自动保存失败:', result.error);
                if (parseFloat(result.size) > 10) {
                  alert(`画布数据太大 (${result.size}MB)，无法自动保存。\n刷新后将无法恢复，请使用"保存画布"按钮手动保存为文件。`);
                }
              }
            } catch (saveError) {
              console.error('❌ 加载后自动保存失败:', saveError);
            }
          }, 1500); // 增加等待时间到 1.5 秒
          
          // 5. 恢复保存的页面状态
          if (saveData.currentPageId) {
            try {
              console.log('尝试恢复到页面:', saveData.currentPageId);
              
              // 检查页面是否存在
              const allPages = editor.getPages();
              const targetPage = allPages.find(page => page.id === saveData.currentPageId);
              console.log('目标页面是否存在:', !!targetPage);
              
              if (targetPage) {
                // 等待一下确保画布完全加载
                setTimeout(() => {
                  try {
                    editor.setCurrentPage(saveData.currentPageId);
                    console.log('已恢复到页面:', saveData.currentPageId);
                    
                    // 验证是否真的切换了
                    setTimeout(() => {
                      const newCurrentPage = editor.getCurrentPage();
                      console.log('切换后的当前页面:', newCurrentPage.name, newCurrentPage.id);
                      
                      // 强制刷新UI
                      try {
                        editor.updateViewportPageBounds();
                      } catch (e) {
                        // 如果方法不存在，静默处理
                      }
                      console.log('已强制刷新UI');
                    }, 50);
                  } catch (error) {
                    console.warn('恢复页面状态时出错:', error);
                    console.log('错误详情:', error.message);
                  }
                }, 200); // 增加等待时间
              } else {
                console.warn('目标页面不存在:', saveData.currentPageId);
              }
            } catch (error) {
              console.warn('恢复页面状态时出错:', error);
              console.log('错误详情:', error.message);
            }
          } else {
            console.log('保存数据中没有currentPageId');
          }
          
          // 6. 加载完成，组件将自动重新渲染
          // 移除加载提示
          document.body.removeChild(loadingMessage);
          
        } catch (error) {
          document.body.removeChild(loadingMessage);
          alert('加载失败：文件格式错误');
        }
      };
      
      reader.onerror = (error) => {
        document.body.removeChild(loadingMessage);
        alert('加载失败：无法读取文件');
      };
      
      reader.readAsText(file);
      
    } catch (error) {
      if (document.body.contains(loadingMessage)) {
        document.body.removeChild(loadingMessage);
      }
      alert('加载失败，请重试');
    }
  };

  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (file) {
      // 检测文件类型，分别处理
      if (file.type === 'application/json' || file.name.endsWith('.json')) {
        console.log('检测到JSON文件，使用JSON画布加载逻辑');
        loadCanvas(file);
      } else if (file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
                 file.type === 'application/vnd.ms-excel' || 
                 file.name.endsWith('.xlsx') || 
                 file.name.endsWith('.xls')) {
        console.log('检测到Excel文件，使用Excel布局重构逻辑');
        
        // 检查是否有多个工作表导出
        const sheetInfo = await checkMultipleSheets(file);
        
        if (sheetInfo.hasMultiple) {
          // 显示工作表选择对话框
          setCurrentFile(file);
          setShowSheetDialog(true);
        } else if (sheetInfo.sheets.length === 1) {
          // 只有一个工作表，直接加载
          processExcelFile(file, sheetInfo.sheets[0]);
        } else {
          // 没有找到有效的工作表数据
          alert('LayoutJson工作表中没有找到有效的导出数据');
        }
      } else {
        alert('请选择有效的JSON或Excel文件');
      }
    }
    // 清空input值，允许重复选择同一文件
    event.target.value = '';
  };

  const openFileDialog = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // 处理工作表选择
  const handleSheetSelect = (selectedSheet) => {
    setShowSheetDialog(false);
    processExcelFile(currentFile, selectedSheet);
  };

  // 取消工作表选择
  const handleSheetCancel = () => {
    setShowSheetDialog(false);
    setCurrentFile(null);
  };

  return (
    <>
      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.xlsx,.xls"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />
      
      {/* 加载画布按钮 */}
        <button
          onClick={openFileDialog}
         title="加载画布(JSON)或Excel布局重构"
         style={{
           fontSize: 12,
           padding: "2px",
           border: "0.5px solid #dee2e6",
           borderRadius: 2,
           background: "#dee2e6",
           color: "white",
           cursor: "pointer",
           fontWeight: "bold",
           whiteSpace: "nowrap",
           width: 40,
           height: 40,
           display: "flex",
           alignItems: "center",
           justifyContent: "center"
         }}
        >
          <img src="/src/assets/load_canvas.png" alt="加载画布" style={{width: 32, height: 32}} />
        </button>

      {/* 工作表选择对话框 */}
      {showSheetDialog && currentFile && (
        <SheetSelectionDialog
          file={currentFile}
          onSheetSelect={handleSheetSelect}
          onCancel={handleSheetCancel}
        />
      )}
    </>
  );
}

// 辅助函数：颜色映射
const mapColorToTLDraw = (hexColor) => {
  if (!hexColor || !hexColor.startsWith('#')) return 'black';
  
  const hex = hexColor.replace('#', '');
  if (hex.length === 6) {
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    
    // 根据RGB值映射到TLDraw支持的颜色
    if (r > 200 && g < 100 && b < 100) return 'red';
    if (r < 100 && g > 200 && b < 100) return 'green';
    if (r < 100 && g < 100 && b > 200) return 'blue';
    if (r > 200 && g > 200 && b < 100) return 'yellow';
    if (r > 200 && g < 100 && b > 200) return 'violet';
    if (r > 200 && g > 200 && b > 200) return 'white';
    if (r < 100 && g < 100 && b < 100) return 'black';
  }
  
  // 默认返回黑色
  return 'black';
};

// 辅助函数：边框样式映射
const mapBorderStyle = (style) => {
  switch (style) {
    case 'solid': return 'solid';
    case 'dashed': return 'dashed';
    case 'dotted': return 'dotted';
    case 'dashDot': return 'dashed';
    case 'dashDotDot': return 'dashed';
    default: return 'solid';
  }
};
