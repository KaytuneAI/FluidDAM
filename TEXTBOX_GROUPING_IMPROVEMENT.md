# 文本框组合改进说明

## 问题描述
用户反馈文本框的 `text` 形状和 `geo` 背景框没有吸附在一起，而且大小不一致。

## 问题分析
之前的实现存在以下问题：
1. **分离的形状**: `text` 和 `geo` 是两个独立的形状
2. **尺寸不一致**: `text` 形状有 padding，尺寸比 `geo` 背景框小
3. **没有组合**: 两个形状没有关联，拖拽时会分开

## 解决方案

### 1. 尺寸完全一致
**修复前**:
```javascript
// 背景框
w: textW,
h: element.height * this.scale

// 文字框（有 padding）
w: textW - 8,
h: element.height * this.scale - 8
```

**修复后**:
```javascript
// 背景框
w: textW,
h: element.height * this.scale

// 文字框（完全重叠）
w: textW,  // 与背景框完全一样大小
h: element.height * this.scale  // 与背景框完全一样高度
```

### 2. 位置完全重叠
**修复前**:
```javascript
// 背景框
x: textX,
y: textY

// 文字框（有偏移）
x: textX + 4,
y: textY + 4
```

**修复后**:
```javascript
// 背景框
x: textX,
y: textY

// 文字框（完全重叠）
x: textX,  // 与背景框完全重叠
y: textY
```

### 3. 使用 TLDraw Group 组合
**新增功能**: 创建 `group` 形状，将背景和文字组合在一起

```javascript
// 创建组合，让背景和文字吸附在一起
const groupId = `textbox_group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// 为背景和文字形状分配唯一 ID
backgroundShape.id = `${groupId}_bg`;
textShape.id = `${groupId}_text`;

// 创建组合形状
const groupShape = {
  id: groupId,
  type: 'group',
  x: textX,
  y: textY,
  props: {
    children: [backgroundShape.id, textShape.id]
  }
};
```

## 实现效果

### ✅ 改进后的效果
1. **完全重叠**: `text` 和 `geo` 形状位置和尺寸完全一致
2. **组合吸附**: 使用 TLDraw 的 `group` 功能让两个形状吸附在一起
3. **统一操作**: 拖拽时整个文本框作为一个整体移动
4. **视觉一致**: 看起来像一个完整的文本框

### 🎯 技术细节
- **背景层**: `geo/rectangle` 白色背景，完全不透明
- **文字层**: `text` 形状承载文字，与背景完全重叠
- **组合层**: `group` 形状包含背景和文字，提供统一操作

### 📝 创建顺序
1. 创建背景形状 (`geo/rectangle`)
2. 创建文字形状 (`text`)
3. 创建组合形状 (`group`)
4. 按顺序添加到 shapes 数组

## 相关文件
- `src/utils/excelUtils.js` - 主要实现文件
- `src/utils/textBoxUtils.js` - 工具函数（同步更新）

## 使用效果
现在文本框会：
- ✅ 背景和文字完全重叠，尺寸一致
- ✅ 作为一个整体进行拖拽和操作
- ✅ 保持白色背景，完全遮挡后面的图案
- ✅ 在 TLDraw 中显示为一个组合对象

## 注意事项
- 组合功能需要 TLDraw 支持 `group` 形状类型
- 如果 TLDraw 版本不支持 `group`，可以回退到分离形状的方案
- 组合形状的 ID 需要唯一，避免冲突
