/**
 * 图片Frame处理工具使用示例
 * 展示如何使用 imageFrameUtils.js 中的各种函数
 */

import {
  createFrameFromImageAnchor,
  placeImageIntoFrame,
  processImagesWithFrames,
  createImageFrameShape,
  addFrameInfoToImage,
  isImageWithinFrame,
  calculateImageScale
} from './imageFrameUtils.js';

// 示例1: 创建frame
function exampleCreateFrame() {
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
    }
  };

  const mockRowOffsets = [0, 20, 40, 60, 80, 100];
  const mockColOffsets = [0, 100, 200, 300, 400, 500, 600, 700];

  // 模拟getCellPixelBoundsPrecise函数
  const getCellPixelBoundsPrecise = (row, col, worksheet) => ({
    x: col * 100,
    y: row * 20,
    width: 100,
    height: 20
  });

  const frameRect = createFrameFromImageAnchor(
    mockDrawing, 
    mockRowOffsets, 
    mockColOffsets, 
    getCellPixelBoundsPrecise
  );

  console.log('生成的frame:', frameRect);
  return frameRect;
}

// 示例2: 适配图片到frame
function examplePlaceImage(frameRect) {
  const imageInfo = {
    originalWidth: 800,
    originalHeight: 600,
    x: 0,
    y: 0,
    width: 100,
    height: 100
  };

  const fittedImage = placeImageIntoFrame(imageInfo, frameRect, 0);
  console.log('适配后的图片:', fittedImage);

  // 验证图片是否在frame内
  const isWithin = isImageWithinFrame(fittedImage, frameRect);
  console.log('图片是否在frame内:', isWithin);

  // 计算缩放比例
  const scale = calculateImageScale(
    { width: imageInfo.originalWidth, height: imageInfo.originalHeight },
    { width: fittedImage.width, height: fittedImage.height }
  );
  console.log('缩放比例:', scale);

  return fittedImage;
}

// 示例3: 批量处理图片
function exampleProcessImages() {
  const images = [
    {
      url: 'data:image/png;base64,...',
      x: 0,
      y: 0,
      width: 200,
      height: 150,
      originalWidth: 800,
      originalHeight: 600,
      frameRect: { x: 0, y: 0, width: 200, height: 150 }
    },
    {
      url: 'data:image/jpeg;base64,...',
      x: 250,
      y: 0,
      width: 300,
      height: 200,
      originalWidth: 1200,
      originalHeight: 800,
      frameRect: { x: 250, y: 0, width: 300, height: 200 }
    }
  ];

  const { adjustedImages, imageFrames } = processImagesWithFrames(
    images,
    createFrameFromImageAnchor,
    placeImageIntoFrame
  );

  console.log('处理后的图片:', adjustedImages);
  console.log('生成的frame:', imageFrames);

  return { adjustedImages, imageFrames };
}

// 示例4: 创建frame形状
function exampleCreateFrameShape() {
  const frameInfo = {
    x: 100,
    y: 100,
    width: 200,
    height: 150,
    type: 'frame',
    id: 'frame:image0'
  };

  const shape = createImageFrameShape(frameInfo, 1);
  console.log('创建的frame形状:', shape);

  return shape;
}

// 示例5: 添加frame信息到图片
function exampleAddFrameInfo() {
  const imageInfo = {
    url: 'data:image/png;base64,...',
    x: 0,
    y: 0,
    width: 200,
    height: 150,
    originalWidth: 800,
    originalHeight: 600
  };

  const frameRect = { x: 0, y: 0, width: 200, height: 150 };
  const imageIndex = 0;

  const imageWithFrame = addFrameInfoToImage(imageInfo, frameRect, imageIndex);
  console.log('添加frame信息后的图片:', imageWithFrame);

  return imageWithFrame;
}

// 运行所有示例
export function runAllExamples() {
  console.log('=== 图片Frame处理工具示例 ===');
  
  console.log('\n1. 创建frame示例:');
  const frameRect = exampleCreateFrame();
  
  console.log('\n2. 适配图片示例:');
  const fittedImage = examplePlaceImage(frameRect);
  
  console.log('\n3. 批量处理图片示例:');
  const processed = exampleProcessImages();
  
  console.log('\n4. 创建frame形状示例:');
  const frameShape = exampleCreateFrameShape();
  
  console.log('\n5. 添加frame信息示例:');
  const imageWithFrame = exampleAddFrameInfo();
  
  console.log('\n=== 所有示例运行完成 ===');
}

// 如果直接运行此文件，执行所有示例
if (typeof window === 'undefined' && typeof global !== 'undefined') {
  // Node.js环境
  runAllExamples();
}
