// textBoxUtils.js
// 专门处理 TextBox 背景和文字组合的工具函数

/**
 * 为 TextBox 创建带背景的 TLDraw 形状组合
 * @param {Object} textItem - 文本框数据 { text, rect: {x,y,w,h}, fill: {...} }
 * @param {number} scale - 缩放比例
 * @param {Object} options - 选项 { padding: 4, strokeColor: 'black', strokeWidth: 1 }
 * @returns {Array} [rectShape, textShape] 两个 TLDraw 形状
 */
export function createTextBoxWithBackground(textItem, scale = 1, options = {}) {
  const {
    padding = 4,
    strokeColor = 'black',
    strokeWidth = 1,
    backgroundColor = '#FFFFFF',
    opacity = 1
  } = options;

  const { text, rect, fill } = textItem;
  
  // 计算缩放后的坐标和尺寸
  const x = rect.x * scale;
  const y = rect.y * scale;
  const width = rect.w * scale;
  const height = rect.h * scale;
  
  // 使用 DrawingML 解析的填充信息，如果没有则使用默认值
  const fillInfo = fill || { fill: 'solid', color: backgroundColor, opacity };
  const bgColor = fillInfo.color || backgroundColor;
  const bgOpacity = fillInfo.opacity !== undefined ? fillInfo.opacity : opacity;
  
  // 生成唯一 ID
  const baseId = `textbox_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // 1. 创建背景矩形
  const rectShape = {
    id: `${baseId}_rect`,
    type: 'geo',
    x: x,
    y: y,
    opacity: bgOpacity,  // 透明度设置在顶级
    props: {
      geo: 'rectangle',
      w: width,
      h: height,
      fill: 'solid',
      color: bgColor,
      // 可选描边
      ...(strokeWidth > 0 && {
        stroke: 'solid',
        strokeColor: strokeColor,
        strokeWidth: strokeWidth
      })
    }
  };
  
  // 2. 创建文字形状，与背景框完全重叠
  const textShape = {
    id: `${baseId}_text`,
    type: 'text',
    x: x,  // 与背景框完全重叠
    y: y,
    props: {
      richText: toRichText(text),
      w: width,  // 与背景框完全一样大小
      h: height,  // 与背景框完全一样高度
      size: 's',
      color: 'black',
      align: 'start',
      justify: 'start'
    }
  };
  
  // 创建组合，让背景和文字吸附在一起
  const groupShape = {
    id: `${baseId}_group`,
    type: 'group',
    x: x,
    y: y,
    props: {
      children: [rectShape.id, textShape.id]
    }
  };
  
  return [rectShape, textShape, groupShape];
}

/**
 * 将富文本转换为 TLDraw 格式
 * @param {string} text - 原始文本
 * @returns {Object} TLDraw 富文本格式
 */
function toRichText(text) {
  if (!text) return { text: '', type: 'text' };
  
  return {
    text: text,
    type: 'text'
  };
}

/**
 * 创建 TextBox 组合（包含背景和文字）
 * @param {Object} textItem - 文本框数据
 * @param {number} scale - 缩放比例
 * @param {Object} options - 选项
 * @returns {Object} 包含 rectShape、textShape 和 groupShape 的对象
 */
export function createTextBoxGroup(textItem, scale = 1, options = {}) {
  const [rectShape, textShape, groupShape] = createTextBoxWithBackground(textItem, scale, options);
  
  return {
    rectShape,
    textShape,
    groupShape
  };
}
