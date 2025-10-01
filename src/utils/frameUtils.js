// Frame相关工具函数

// 选择最小的包含frame
export function findTargetFrame(editor) {
  // 1) If user explicitly selected a frame, honor that selection
  try {
    const selected = editor.getSelectedShapes?.() || []
    const selectedFrame = selected.find((s) => s.type === 'frame')
    if (selectedFrame) return selectedFrame
  } catch {}

  // 2) Otherwise, use pointer page point (or viewport center)
  let focus
  try {
    const vb = editor.getViewportPageBounds?.()
    const center = vb ? { x: (vb.minX + vb.maxX) / 2, y: (vb.minY + vb.maxY) / 2 } : { x: 0, y: 0 }
    const inp = editor.inputs
    focus = (inp && inp.currentPagePoint) ? inp.currentPagePoint : center
  } catch {
    focus = { x: 0, y: 0 }
  }

  // Collect frames on current page
  const frames = editor.getCurrentPageShapes?.().filter((s) => s.type === 'frame') || []
  if (!frames.length) return null

  // 2a) Prefer frames that CONTAIN the focus point; among them choose the smallest by area
  const containing = frames.filter((f) => {
    try { return editor.isPointInShape(f, focus, { hitInside: true }) } catch { return false }
  })
  if (containing.length) {
    return containing.sort((a, b) => (a.props.w * a.props.h) - (b.props.w * b.props.h))[0]
  }

  // 3) Fallback: nearest-by-center
  let best = null, bestD = Infinity
  for (const f of frames) {
    const b = editor.getShapeBounds(f)
    const cx = (b.minX + b.maxX) / 2
    const cy = (b.minY + b.maxY) / 2
    const dx = cx - focus.x, dy = cy - focus.y
    const d = dx*dx + dy*dy
    if (d < bestD) { best = f; bestD = d }
  }
  return best
}

// 获取frame下方的SKU文字
export function getSKUFromFrame(editor, frame) {
  try {
    // 使用frame的坐标和尺寸计算边界
    const frameX = frame.x;
    const frameY = frame.y;
    const frameW = frame.props.w;
    const frameH = frame.props.h;
    const frameBottom = frameY + frameH;
    
    // 获取所有文字形状
    const allShapes = editor.getCurrentPageShapes();
    const textShapes = allShapes.filter(shape => shape.type === 'text');
    
    // 找到frame下方最近的文字（SKU）
    let closestText = null;
    let minDistance = Infinity;
    
    for (const textShape of textShapes) {
      const textX = textShape.x;
      const textY = textShape.y;
      const textW = textShape.props.w;
      const textH = textShape.props.h;
      const textTop = textY;
      
      // 检查文字是否在frame下方且水平位置相近
      if (textTop > frameBottom && 
          textX >= frameX - 50 && 
          textX <= frameX + frameW + 50) {
        const distance = textTop - frameBottom;
        if (distance < minDistance && distance < 100) { // 限制在100px范围内
          minDistance = distance;
          closestText = textShape;
        }
      }
    }
    
    if (closestText) {
      // 提取SKU代码（假设SKU是文字的最后部分）
      const textContent = closestText.props.richText || '';
      let textString = '';
      
      // 处理Tldraw v3的richText格式
      if (typeof textContent === 'string') {
        textString = textContent;
      } else if (Array.isArray(textContent)) {
        textString = textContent.map(item => item.text || '').join('');
      } else if (textContent && typeof textContent === 'object') {
        // 如果是对象，尝试提取text属性
        textString = textContent.text || JSON.stringify(textContent);
      } else {
        textString = String(textContent);
      }
      
      // 提取SKU（匹配类似S012、DC15、Art B等格式）
      const skuMatch = textString.match(/([A-Z]{1,3}\d{2,3}|[A-Za-z]{2,4}\s+[A-Z])/);
      return skuMatch ? skuMatch[1] : null;
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

// 健壮的获取Frame边界方法
export function getFrameBounds(editor, frame) {
  try {
    // 依次尝试不同的方法
    if (typeof editor.getShapePageBounds === 'function') {
      return editor.getShapePageBounds(frame.id);
    }
    if (typeof editor.getPageBounds === 'function') {
      return editor.getPageBounds(frame.id);
    }
    if (typeof editor.getBounds === 'function') {
      return editor.getBounds(frame.id);
    }
  } catch (error) {
    // 如果所有方法都失败，回退到手动计算
  }
  
  // 回退方案：使用shape自带的属性计算边界
  return {
    minX: frame.x,
    minY: frame.y,
    maxX: frame.x + frame.props.w,
    maxY: frame.y + frame.props.h,
    width: frame.props.w,
    height: frame.props.h
  };
}

// center-fit into frame (contain)
export function fitContain(imgW, imgH, frameW, frameH, padding=0) {
  // 参考插入图片的逻辑：90%缩放 + 垂直偏上定位
  const scale = Math.min(frameW / imgW, frameH / imgH) * 0.9;
  const w = Math.max(1, Math.round(imgW * scale));
  const h = Math.max(1, Math.round(imgH * scale));
  const ox = Math.round((frameW - w) / 2);  // 水平居中
  const oy = Math.round((frameH - h) * 0.25);  // 垂直偏上（从25%位置开始）
  return { w, h, ox, oy };
}
