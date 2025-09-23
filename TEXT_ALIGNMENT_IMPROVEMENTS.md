# Excel文字对齐和位置优化

## 问题分析

通过对比Excel原图和画布上的图，发现了以下主要问题：

1. **文字对齐问题**: 文字在单元格中的位置不够精确
2. **内边距问题**: 文字与单元格边界的距离不一致
3. **对齐方式缺失**: 没有处理Excel单元格的水平/垂直对齐
4. **背景和边框**: 单元格的背景色和边框没有正确显示

## 解决方案

### 1. 添加单元格对齐信息提取

**文件**: `src/utils/excel/utils/texts.js`

- 添加了 `getCellAlignment()` 函数来提取Excel单元格的对齐信息
- 支持水平对齐：left, center, right, justify
- 支持垂直对齐：top, middle, bottom
- 支持文字换行和缩进设置

### 2. 精确的文字位置计算

**文件**: `src/utils/excelUtils.js`

- 添加了 `calculateTextPosition()` 方法来计算文字在单元格中的精确位置
- 支持多种对齐方式：
  - **水平对齐**: 左对齐、居中、右对齐、两端对齐
  - **垂直对齐**: 顶部对齐、垂直居中、底部对齐
- 考虑了内边距、缩进等Excel特性

### 3. 改进的文字渲染

- 文字位置计算更加精确，减少内边距到2px（更接近Excel）
- 支持文字对齐属性传递到TLDraw
- 文字高度计算更准确（12px字体对应14px高度）

### 4. 单元格样式支持

- 支持单元格背景色显示
- 支持单元格边框显示
- 只在有背景色或边框时才创建背景形状，优化性能

## 技术细节

### 对齐方式映射

```javascript
// 水平对齐
'left' -> 'start' (左对齐)
'center' -> 'middle' (居中)
'right' -> 'end' (右对齐)
'justify' -> 'justify' (两端对齐)

// 垂直对齐
'top' -> 顶部对齐
'middle' -> 垂直居中
'bottom' -> 底部对齐
```

### 位置计算

```javascript
// 水平位置
x = cellX + padding + indent + alignment_offset

// 垂直位置  
y = cellY + padding + vertical_alignment_offset

// 宽度计算
width = cellW - (padding * 2) - indent
```

## 效果对比

### 改进前
- 文字位置不准确
- 没有考虑Excel的对齐方式
- 内边距过大
- 缺少单元格样式

### 改进后
- 文字位置精确匹配Excel
- 支持完整的对齐方式
- 内边距更接近Excel标准
- 支持背景色和边框显示

## 使用方式

这些改进会自动应用到Excel导入功能中，无需额外配置。导入的Excel文件会：

1. 自动提取单元格对齐信息
2. 精确计算文字位置
3. 保持Excel的视觉效果
4. 支持各种对齐方式

## 测试建议

1. 测试不同对齐方式的Excel文件
2. 验证文字位置是否与Excel一致
3. 检查背景色和边框是否正确显示
4. 测试合并单元格的对齐效果
