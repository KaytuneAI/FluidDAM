# 文本框白色背景修复说明

## 问题描述
用户反馈文本框仍然是透明的，可以看到下一层的图片颜色，希望文本框的底色是白色的，看不见其他背景。

## 问题分析
经过检查发现两个关键问题：

### 1. 类型设置错误
**问题位置**: `src/utils/excelUtils.js` 第 587 行
**问题**: DrawingML 解析的文本框被设置为 `type: 'text'`，而不是 `type: 'textbox'`
**影响**: 导致文本框被当作普通文字处理，没有白色背景

### 2. 颜色映射可能不准确
**问题位置**: `src/utils/excelUtils.js` 第 2386 行
**问题**: 使用 `mapColorToTLDraw(backgroundColor)` 可能映射不准确
**影响**: 即使设置了背景，颜色可能不是纯白色

## 修复方案

### 修复 1: 更正文本框类型
```javascript
// 修复前
type: 'text',

// 修复后  
type: 'textbox',  // 修改为 textbox 类型，确保有白色背景
source: 'drawingml',
fill: textItem.fill  // 传递填充样式信息
```

### 修复 2: 强制使用白色背景
```javascript
// 修复前
color: this.mapColorToTLDraw(backgroundColor),
opacity: opacity

// 修复后
color: 'white',  // 强制使用白色，确保不透明
opacity: 1       // 强制完全不透明
```

### 修复 3: TLDraw 属性结构修复
**问题**: TLDraw 的 `geo` 形状不支持 `props.opacity` 属性
**错误**: `ValidationError: At shape(type = geo).props.opacity: Unexpected property`
**修复**: 将 `opacity` 移到形状的顶级属性

```javascript
// 修复前（错误）
shape = {
  type: 'geo',
  props: {
    opacity: 1  // ❌ 错误：geo 形状不支持 props.opacity
  }
}

// 修复后（正确）
shape = {
  type: 'geo',
  opacity: 1,  // ✅ 正确：opacity 是顶级属性
  props: {
    // 其他属性...
  }
}
```

### 修复 4: 添加调试日志
```javascript
// 确保文本框背景是纯白色，完全不透明
console.log('文本框背景信息:', { backgroundColor, opacity, fillInfo });
```

## 修复效果

### 预期结果
1. **所有文本框都有白色背景**: 文本框类型正确设置为 `textbox`
2. **完全不透明**: 强制使用 `color: 'white'` 和 `opacity: 1`
3. **完全遮挡**: 像白纸一样遮挡后面的图案和图片
4. **调试信息**: 控制台显示文本框背景信息，便于调试

### 技术细节
- **类型识别**: `type: 'textbox'` 触发白色背景创建逻辑
- **背景形状**: 使用 `geo/rectangle` 创建白色矩形背景
- **文字叠加**: 在背景上创建 `text` 形状承载文字
- **层级顺序**: 先创建背景，再创建文字，确保背景在最底层

## 验证方法

1. **导入包含文本框的 Excel 文件**
2. **检查控制台日志**:
   - 应该看到 "类型: textbox" 的日志
   - 应该看到 "文本框背景信息" 的日志
3. **视觉检查**:
   - 文本框应该有白色背景
   - 背景应该完全遮挡后面的图片
   - 文字应该清晰可见

## 相关文件
- `src/utils/excelUtils.js` - 主要修复文件
- `src/utils/DrawingML.js` - 文本框解析逻辑
- `src/utils/textBoxUtils.js` - 工具函数（可选使用）

## 注意事项
- 修复后所有 DrawingML 文本框都会自动获得白色背景
- 不影响普通单元格文字（仍然透明）
- 保持与现有功能的完全兼容性
