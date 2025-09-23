// 测试新的图片frame实现
import { ExcelToTLDrawConverter } from './src/utils/excelUtils.js';

// 模拟测试数据
const mockDrawing = {
  range: {
    tl: {
      row: 2,
      col: 3,
      nativeRowOffset: 0,
      nativeColOffset: 0
    },
    br: {
      row: 5,
      col: 7,
      nativeRowOffset: 100000, // 约1.1像素
      nativeColOffset: 200000  // 约2.1像素
    }
  },
  worksheet: {
    // 模拟worksheet对象
    getCell: (row, col) => ({
      width: 100,
      height: 20
    })
  }
};

const mockRowOffsets = [0, 20, 40, 60, 80, 100];
const mockColOffsets = [0, 100, 200, 300, 400, 500, 600, 700];

// 创建转换器实例
const converter = new ExcelToTLDrawConverter(null, 1);

// 测试createFrameFromImageAnchor函数
console.log('=== 测试 createFrameFromImageAnchor 函数 ===');
const frameRect = converter.createFrameFromImageAnchor(mockDrawing, mockRowOffsets, mockColOffsets);
console.log('生成的frame矩形:', frameRect);

// 测试_placeImageIntoFrame函数
console.log('\n=== 测试 _placeImageIntoFrame 函数 ===');
const mockImageInfo = {
  originalWidth: 800,
  originalHeight: 600,
  x: 0,
  y: 0,
  width: 100,
  height: 100
};

if (frameRect) {
  const fittedImage = converter._placeImageIntoFrame(mockImageInfo, frameRect, 0);
  console.log('适配后的图片信息:', fittedImage);
  
  // 验证图片是否在frame内
  const isWithinFrame = fittedImage.x >= frameRect.x && 
                       fittedImage.y >= frameRect.y &&
                       fittedImage.x + fittedImage.width <= frameRect.x + frameRect.width &&
                       fittedImage.y + fittedImage.height <= frameRect.y + frameRect.height;
  
  console.log('图片是否完全在frame内:', isWithinFrame);
  console.log('图片缩放比例:', Math.min(fittedImage.width / mockImageInfo.originalWidth, fittedImage.height / mockImageInfo.originalHeight));
}

console.log('\n=== 测试完成 ===');
