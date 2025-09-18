# Excel 图片 → Frame → 图片 Fit 实现测试

## 文件结构

### 新增文件
- **`src/utils/imageFrameUtils.js`**: 专门的图片frame处理工具类
  - 包含所有图片frame相关的函数
  - 模块化设计，便于维护和测试
  - 减少 `excelUtils.js` 的文件大小

### 修改文件
- **`src/utils/excelUtils.js`**: 主转换器类
  - 移除了图片frame相关的函数
  - 导入并使用 `imageFrameUtils.js` 中的工具函数
  - 保持原有的接口不变

## 实现概述

按照Brief要求，我们已经实现了以下改造：

### 1. 新增函数（在 `imageFrameUtils.js` 中）

#### `createFrameFromImageAnchor(drawing, rowOffsets, colOffsets, getCellPixelBoundsPrecise)`
- **功能**: 根据Excel图片锚点生成对应的frame矩形
- **输入**: 
  - `drawing`: Excel图片的drawing对象（包含range和worksheet信息）
  - `rowOffsets`: 行偏移量数组
  - `colOffsets`: 列偏移量数组
  - `getCellPixelBoundsPrecise`: 获取单元格精确像素边界的函数
- **输出**: frame矩形 `{x, y, width, height}`
- **特点**: 
  - 支持完整的tl/br锚点
  - 兼容缺失br锚点的情况（回退到单格）
  - 精确的EMU到像素转换
  - 错误处理和日志记录

#### `placeImageIntoFrame(imageInfo, frameRect, padding)`
- **功能**: 将图片等比contain到frame中
- **输入**:
  - `imageInfo`: 图片信息对象（包含原始尺寸）
  - `frameRect`: frame矩形
  - `padding`: 内边距（默认0）
- **输出**: 适配后的图片位置和尺寸 `{x, y, width, height}`
- **特点**:
  - 等比缩放（不放大超过100%）
  - 在frame内居中
  - 确保图片不超出frame边界

#### `processImagesWithFrames(images, createFrameFromImageAnchor, placeImageIntoFrame)`
- **功能**: 批量处理图片数组，生成frame并适配图片
- **输入**:
  - `images`: 图片数组
  - `createFrameFromImageAnchor`: 创建frame的函数
  - `placeImageIntoFrame`: 适配图片的函数
- **输出**: `{adjustedImages, imageFrames}`
- **特点**: 批量处理，提高效率

#### `createImageFrameShape(frameInfo, scale)`
- **功能**: 创建图片frame的TLDraw形状对象
- **输入**:
  - `frameInfo`: frame信息对象
  - `scale`: 缩放比例
- **输出**: TLDraw形状对象
- **特点**: 图片frame用红色虚线，表格frame用黑色实线

#### `addFrameInfoToImage(imageInfo, frameRect, imageIndex)`
- **功能**: 为图片信息添加frame信息
- **输入**:
  - `imageInfo`: 原始图片信息
  - `frameRect`: 生成的frame矩形
  - `imageIndex`: 图片索引
- **输出**: 包含frame信息的图片对象

#### 其他工具函数
- `isImageWithinFrame(imageInfo, frameRect)`: 验证图片是否完全在frame内
- `calculateImageScale(originalSize, fittedSize)`: 计算图片的缩放比例

### 2. 修改的处理流程

#### 新的图片处理顺序：
1. **Excel → 提取图片** → 生成frame → 再生成图片（坐标来自fit结果）
2. **渲染时**: frame在下，图片在上

#### 具体实现：
1. 在 `extractImages` 方法中，为每张图片生成对应的frame
2. 将frame信息保存到图片对象中
3. 在主转换方法中，为每张图片创建对应的frame形状
4. 使用 `_placeImageIntoFrame` 将图片适配到frame中
5. 按正确顺序创建形状：背景 → frame → 图片 → 文本

### 3. 调试功能

#### Frame可视化：
- **图片frame**: 红色虚线边框，ID格式为 `frame:image${i}`
- **表格frame**: 黑色实线边框
- 便于调试时区分不同类型的frame

#### 日志输出：
- 详细的frame生成日志
- 图片适配过程日志
- 错误处理和警告信息

## 验收标准检查

### ✅ 每张图片都有一个对应的frame容器
- 实现：每张图片都会生成对应的frame，ID为 `frame:image${i}`
- 验证：在画布上可以看到红色的虚线frame

### ✅ 图片都被等比缩小在容器内，不会溢出
- 实现：使用 `_placeImageIntoFrame` 函数进行contain适配
- 验证：图片尺寸 = min(原图尺寸, frame尺寸)，且居中显示

### ✅ 横幅跨格图片能正确铺到整块区域
- 实现：通过 `createFrameFromImageAnchor` 正确处理tl/br锚点
- 验证：跨格图片的frame会覆盖多个单元格区域

### ✅ 调试模式下可以看到frame边界与图片对齐
- 实现：图片frame用红色虚线显示，表格frame用黑色实线显示
- 验证：在画布上可以清楚看到frame边界和图片的对齐关系

## 测试方法

### 1. 使用现有Excel文件测试
```bash
# 启动开发服务器
npm run dev

# 在浏览器中打开应用
# 导入 "麦卡伦品专SKU蒙版文案0905.xlsx" 文件
# 观察：
# - 每张图片是否有对应的红色虚线frame
# - 图片是否正确适配在frame内
# - 横幅图片是否正确跨格显示
```

### 2. 控制台验证
打开浏览器开发者工具，查看控制台输出：
- `生成图片frame: 位置(x, y), 尺寸widthxheight`
- `图片适配到frame: 原图(wxh) -> 适配后(wxh), 位置(x, y)`
- `图片X适配完成: 原图(wxh) -> 适配后(wxh)`

### 3. 视觉验证
- 图片frame：红色虚线边框
- 表格frame：黑色实线边框
- 图片完全在frame内，不溢出
- 图片在frame内居中显示

## 技术细节

### EMU到像素转换
```javascript
const emuToPx = (emu) => {
  if (!emu || emu === 0) return 0;
  const numEmu = typeof emu === 'number' ? emu : parseFloat(emu);
  if (isNaN(numEmu)) return 0;
  // 1英寸 = 914400 EMU, 1英寸 = 96像素
  return (numEmu * 96) / 914400;
};
```

### 等比缩放算法
```javascript
const scaleX = availableWidth / originalWidth;
const scaleY = availableHeight / originalHeight;
const scale = Math.min(scaleX, scaleY, 1); // 不超过100%原图像素
```

### Frame ID生成
```javascript
const frameInfo = {
  ...imageInfo.frameRect,
  type: 'frame',
  id: `frame:image${i}` // 生成唯一的frame ID
};
```

## 兼容性

- 向后兼容原有的图片处理逻辑
- 如果frame生成失败，会回退到原始锚点计算
- 支持各种Excel格式的锚点结构
- 错误处理确保程序稳定性

## 性能优化

- 批量处理图片和frame
- 避免重复计算
- 详细的日志记录便于调试
- 内存友好的实现方式
