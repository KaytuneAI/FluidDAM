# 图片Frame适配修正说明

## 问题描述

之前的图片适配Frame功能存在三个核心问题，导致图片无法完全填充格子：

1. **缩放被人为"限高不放大"** - `Math.min(scaleX, scaleY, 1)` 禁止放大
2. **只"算了个frame对象"，却没真正把图片"挂到frame里"** - 没有建立TLDraw的parent-child关系
3. **"frame内尺寸"与"视觉边界"未对齐** - 没有预留描边/内边距

## 修正方案

### 1. 允许放大到刚好贴满（contain，无1限制）

**修改位置**: `src/utils/excelUtils.js` 和 `src/utils/imageFrameUtils.js` 的 `_fitImageToFrame` 函数

**修改前**:
```javascript
const scale = Math.min(scaleX, scaleY, 1); // 不超过100%原图像素
```

**修改后**:
```javascript
const scale = Math.min(scaleX, scaleY); // 移除,1限制，允许放大到贴满
```

### 2. 生成"真"frame shape，并把图片设为其子节点

**修改位置**: `src/utils/excelUtils.js` 的 `_fitImagesIntoFrames` 函数

**修改前**:
```javascript
// 只是push普通对象到frames数组
const cellFrame = {
  x: combinedBounds.x,
  y: combinedBounds.y,
  width: combinedBounds.width,
  height: combinedBounds.height,
  type: 'frame',
  id: `image-frame-${i}`, // 自定义ID，不是真正的TLDraw shape
  name: `图片Frame ${i + 1}`
};
frames.push(cellFrame);
```

**修改后**:
```javascript
// 创建真正的TLDraw frame shape
const frameShape = {
  type: 'frame',
  x: combinedBounds.x * this.scale,
  y: combinedBounds.y * this.scale,
  props: {
    w: combinedBounds.width * this.scale,
    h: combinedBounds.height * this.scale,
    name: `图片Frame ${i + 1}`
  }
};

// 使用TLDraw创建真正的frame shape
const frameId = this.editor.createShape(frameShape);
console.log(`创建了真正的TLDraw frame shape: ${frameId}`);

// 设置parent关系
img.frameId = frameId; // 记录真正的TLDraw frame ID
img.parentId = frameId; // 设置parent关系
```

### 3. Shape ID规范化

**修改前**: 使用自定义ID `image-frame-${i}`
**修改后**: 使用TLDraw生成的真正shape ID（自动以`shape:`开头）

### 4. 统一预留内边距与描边

**修改位置**: `_fitImageToFrame` 函数

**修改前**:
```javascript
const availableWidth = Math.max(1, frameRect.width - padding * 2);
const availableHeight = Math.max(1, frameRect.height - padding * 2);
```

**修改后**:
```javascript
// 项目级常量：内边距和描边
const CELL_PADDING = 8;
const FRAME_STROKE = 1;
const totalPadding = padding + CELL_PADDING + FRAME_STROKE;

// 计算frame内的可用空间（统一预留内边距与描边）
const availableWidth = Math.max(1, frameRect.width - totalPadding * 2);
const availableHeight = Math.max(1, frameRect.height - totalPadding * 2);
```

### 5. 以image资产天然宽高为基准

**修改位置**: `createShapesBatch` 函数中的图片shape创建

**修改前**:
```javascript
// 重新计算缩放，可能覆盖fit结果
const scaleFit = Math.min(boxW / naturalW, boxH / naturalH, 1);
const drawW = Math.round(naturalW * scaleFit * 100) / 100;
const drawH = Math.round(naturalH * scaleFit * 100) / 100;
```

**修改后**:
```javascript
// 使用已经fit好的尺寸和位置（来自_fitImagesIntoFrames）
const drawX = element.x * this.scale;
const drawY = element.y * this.scale;
const drawW = element.width * this.scale;
const drawH = element.height * this.scale;

// 创建图片shape，使用正确的props.w/h尺寸
shape = {
  type: 'image',
  parentId: parentId,
  x: drawX,
  y: drawY,
  props: {
    w: finalW,  // 使用fit后的尺寸
    h: finalH, // 使用fit后的尺寸
    assetId: assetId
  }
};
```

### 6. 建立真正的frame内坐标系统

**修改前**: 图片shape的坐标是页面坐标，没有parent关系
**修改后**: 图片shape的parentId设置为frame的ID，建立真正的parent-child关系

## 修正效果

经过以上修正，图片现在能够：

1. **完全填充格子** - 允许放大到贴满frame边界
2. **建立正确的层级关系** - 图片真正成为frame的子元素
3. **预留合适的边距** - 避免图片"顶线"或被边框"吃掉"
4. **使用正确的尺寸** - props.w/h使用fit后的尺寸，而不是原始尺寸

## 测试建议

1. 导入包含图片的Excel文件
2. 检查图片是否完全填充对应的格子
3. 验证图片与frame的parent-child关系
4. 确认图片不会超出frame边界
5. 检查图片是否有合适的边距

## 相关文件

- `src/utils/excelUtils.js` - 主要修正文件
- `src/utils/imageFrameUtils.js` - 辅助函数修正
- `IMAGE_FRAME_FITTING_FIX.md` - 本说明文档

