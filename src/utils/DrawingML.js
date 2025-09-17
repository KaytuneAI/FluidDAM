// DrawingML.js
// 负责解析 Excel .xlsx 中的 DrawingML (xl/drawings/drawing*.xml)
// 提取文本框、形状、图片的锚点和文字，返回可以直接生成 TLDraw shape 的数据

import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

// EMU → 像素换算 (1 px = 9525 EMU at 96dpi)
const EMU_PER_PIXEL = 9525;

function emuToPx(value) {
  if (isNaN(value) || value === null || value === undefined) {
    return 0;
  }
  return Math.round(value / EMU_PER_PIXEL);
}

/**
 * 把 anchor (from/to + offset 或 ext) 转换成像素矩形
 */
export function anchorToPixels(anchor, dims) {
  if (!anchor || !dims || !dims.colOffsets || !dims.rowOffsets) return null;

  if (anchor['xdr:from'] && anchor['xdr:to']) {
    const from = anchor['xdr:from'];
    const to = anchor['xdr:to'];

    const colFrom = parseInt(from['xdr:col'], 10);
    const rowFrom = parseInt(from['xdr:row'], 10);
    const colTo = parseInt(to['xdr:col'], 10);
    const rowTo = parseInt(to['xdr:row'], 10);

    // 检查索引是否有效
    if (isNaN(colFrom) || isNaN(rowFrom) || isNaN(colTo) || isNaN(rowTo)) {
      console.warn('无效的行列索引:', { colFrom, rowFrom, colTo, rowTo });
      return null;
    }

    // 检查数组边界
    if (colFrom >= dims.colOffsets.length || rowFrom >= dims.rowOffsets.length ||
        colTo >= dims.colOffsets.length || rowTo >= dims.rowOffsets.length) {
      console.warn('行列索引超出范围:', { colFrom, rowFrom, colTo, rowTo, 
        colOffsetsLength: dims.colOffsets.length, rowOffsetsLength: dims.rowOffsets.length });
      return null;
    }

    const colOffFrom = parseInt(from['xdr:colOff'] || 0, 10);
    const rowOffFrom = parseInt(from['xdr:rowOff'] || 0, 10);
    const colOffTo = parseInt(to['xdr:colOff'] || 0, 10);
    const rowOffTo = parseInt(to['xdr:rowOff'] || 0, 10);

    const x = (dims.colOffsets[colFrom] || 0) + (isNaN(colOffFrom) ? 0 : colOffFrom / EMU_PER_PIXEL);
    const y = (dims.rowOffsets[rowFrom] || 0) + (isNaN(rowOffFrom) ? 0 : rowOffFrom / EMU_PER_PIXEL);
    const w = ((dims.colOffsets[colTo] || 0) - (dims.colOffsets[colFrom] || 0)) + (isNaN(colOffTo) ? 0 : colOffTo / EMU_PER_PIXEL);
    const h = ((dims.rowOffsets[rowTo] || 0) - (dims.rowOffsets[rowFrom] || 0)) + (isNaN(rowOffTo) ? 0 : rowOffTo / EMU_PER_PIXEL);

    // 检查计算结果是否为有效数字
    if (isNaN(x) || isNaN(y) || isNaN(w) || isNaN(h)) {
      console.warn('计算结果包含NaN:', { x, y, w, h });
      return null;
    }

    return { x, y, w, h };
  }

  if (anchor['xdr:from'] && anchor['xdr:ext']) {
    const from = anchor['xdr:from'];
    const col = parseInt(from['xdr:col'], 10);
    const row = parseInt(from['xdr:row'], 10);

    // 检查索引是否有效
    if (isNaN(col) || isNaN(row)) {
      console.warn('无效的行列索引:', { col, row });
      return null;
    }

    // 检查数组边界
    if (col >= dims.colOffsets.length || row >= dims.rowOffsets.length) {
      console.warn('行列索引超出范围:', { col, row, 
        colOffsetsLength: dims.colOffsets.length, rowOffsetsLength: dims.rowOffsets.length });
      return null;
    }

    const colOff = parseInt(from['xdr:colOff'] || 0, 10);
    const rowOff = parseInt(from['xdr:rowOff'] || 0, 10);

    const x = (dims.colOffsets[col] || 0) + (isNaN(colOff) ? 0 : colOff / EMU_PER_PIXEL);
    const y = (dims.rowOffsets[row] || 0) + (isNaN(rowOff) ? 0 : rowOff / EMU_PER_PIXEL);

    const ext = anchor['xdr:ext'];
    const w = emuToPx(parseInt(ext['@_cx'], 10));
    const h = emuToPx(parseInt(ext['@_cy'], 10));

    // 检查计算结果是否为有效数字
    if (isNaN(x) || isNaN(y) || isNaN(w) || isNaN(h)) {
      console.warn('计算结果包含NaN:', { x, y, w, h });
      return null;
    }

    return { x, y, w, h };
  }

  return null;
}

/**
 * 提取文本框的纯文本 (拼接所有 a:t)
 */
export function extractPlainText(spNode) {
  if (!spNode || !spNode['xdr:txBody']) return '';
  const paragraphs = spNode['xdr:txBody']['a:p'];
  if (!paragraphs) return '';

  let text = '';
  const ps = Array.isArray(paragraphs) ? paragraphs : [paragraphs];
  for (const p of ps) {
    if (p['a:r']) {
      const runs = Array.isArray(p['a:r']) ? p['a:r'] : [p['a:r']];
      for (const r of runs) {
        if (r['a:t']) text += r['a:t'];
      }
    } else if (p['a:t']) {
      text += p['a:t'];
    }
    text += '\n';
  }

  return text.trim();
}

/**
 * 检查形状是否应该被跳过（过滤幽灵元素）
 * @param {Object} anchor - 锚点对象
 * @param {Object} rect - 计算出的矩形 {x, y, w, h}
 * @param {Object} opts - 过滤选项
 * @returns {Object} { skip: boolean, reason: string }
 */
function shouldSkipElement(anchor, rect, opts = {}) {
  const defaultOpts = {
    includeHidden: false,
    includeVML: false,
    includePrintOnly: false,
    minPixelSize: 1,
    clipToSheetBounds: true
  };
  const options = { ...defaultOpts, ...opts };

  // 1. 检查是否被隐藏
  if (anchor['xdr:sp']) {
    const sp = anchor['xdr:sp'];
    const nvSpPr = sp['xdr:nvSpPr'];
    if (nvSpPr && nvSpPr['xdr:cNvPr'] && nvSpPr['xdr:cNvPr']['@_hidden'] === '1') {
      return { skip: true, reason: 'hidden' };
    }
  }
  
  if (anchor['xdr:pic']) {
    const pic = anchor['xdr:pic'];
    const nvPicPr = pic['xdr:nvPicPr'];
    if (nvPicPr && nvPicPr['xdr:cNvPr'] && nvPicPr['xdr:cNvPr']['@_hidden'] === '1') {
      return { skip: true, reason: 'hidden' };
    }
  }

  // 2. 检查尺寸是否过小
  if (rect.w < options.minPixelSize || rect.h < options.minPixelSize) {
    return { skip: true, reason: 'too_small' };
  }

  // 3. 检查是否在画布外
  if (options.clipToSheetBounds) {
    // 这里可以添加画布边界检查，暂时跳过
    if (rect.x < -1000 || rect.y < -1000 || rect.x > 10000 || rect.y > 10000) {
      return { skip: true, reason: 'off_canvas' };
    }
  }

  // 4. 检查透明形状（无填充、无线框、无文字）
  if (anchor['xdr:sp']) {
    const sp = anchor['xdr:sp'];
    const spPr = sp['xdr:spPr'];
    const hasText = sp['xdr:txBody'] && extractPlainText(sp).trim().length > 0;
    
    if (spPr) {
      const hasFill = spPr['a:solidFill'] || spPr['a:gradFill'] || spPr['a:pattFill'] || spPr['a:blipFill'];
      const hasLine = spPr['a:ln'];
      
      // 如果既没有填充，也没有线条，也没有文字，则跳过
      if (!hasFill && !hasLine && !hasText) {
        return { skip: true, reason: 'transparent' };
      }
    }
  }

  return { skip: false, reason: 'visible' };
}

/**
 * 解析某个工作表关联的 DrawingML
 * @param {JSZip} zip 解压后的 xlsx zip
 * @param {string} drawingPath 相对路径，比如 "xl/drawings/drawing1.xml"
 * @param {Object} dims { colOffsets:[], rowOffsets:[] } 来自 excelUtils 的换算
 * @param {Object} opts - 过滤选项
 * @returns {Object} { texts:[], images:[], shapes:[], skipped:[] }
 */
async function parseDrawingML(zip, drawingPath, dims, opts = {}) {
  const parser = new XMLParser({ ignoreAttributes: false });
  const xml = await zip.file(drawingPath).async('string');
  const doc = parser.parse(xml);

  // 加载 drawing 的关系文件
  const relsPath = `xl/drawings/_rels/${drawingPath.split('/').pop()}.rels`;
  let rels = {};
  if (zip.file(relsPath)) {
    const relsXml = await zip.file(relsPath).async('string');
    const relsDoc = parser.parse(relsXml);
    rels = relsDoc.Relationships.Relationship;
  }

  const anchors = [];
  const wsDr = doc['xdr:wsDr'];
  if (wsDr['xdr:twoCellAnchor']) anchors.push(...[].concat(wsDr['xdr:twoCellAnchor']));
  if (wsDr['xdr:oneCellAnchor']) anchors.push(...[].concat(wsDr['xdr:oneCellAnchor']));

  const results = { texts: [], images: [], shapes: [], skipped: [] };

  for (const a of anchors) {
    const rect = anchorToPixels(a, dims);
    if (!rect) {
      results.skipped.push({ reason: 'invalid_anchor', anchor: a });
      continue;
    }

    // 应用过滤规则
    const filterResult = shouldSkipElement(a, rect, opts);
    if (filterResult.skip) {
      results.skipped.push({ 
        reason: filterResult.reason, 
        anchor: a, 
        rect: rect,
        type: a['xdr:pic'] ? 'image' : a['xdr:sp'] ? 'text' : 'shape'
      });
      console.log(`跳过${a['xdr:pic'] ? '图片' : a['xdr:sp'] ? '文本框' : '形状'}: ${filterResult.reason}`, rect);
      continue;
    }

    // 图片
    if (a['xdr:pic']) {
      const blip = a['xdr:pic']['xdr:blipFill']['a:blip'];
      const rId = blip['@_r:embed'];
      const rel = Array.isArray(rels)
        ? rels.find(r => r['@_Id'] === rId)
        : rels;
      const target = rel?.['@_Target'];
      results.images.push({ rect, rId, target });
      continue;
    }

    // 文本框
    if (a['xdr:sp']) {
      const text = extractPlainText(a['xdr:sp']);
      if (text) {
        results.texts.push({ rect, text });
      } else {
        // 没有文字内容的形状，但仍然可见
        results.shapes.push({ rect, kind: 'shape' });
      }
      continue;
    }

    // 其它形状（可选）
    results.shapes.push({ rect, kind: 'rect' });
  }

  console.log(`DrawingML解析完成: ${results.texts.length}个文本框, ${results.images.length}个图片, ${results.shapes.length}个形状, ${results.skipped.length}个被跳过`);
  
  // 显示跳过的元素统计
  const skipStats = {};
  results.skipped.forEach(item => {
    skipStats[item.reason] = (skipStats[item.reason] || 0) + 1;
  });
  console.log('跳过统计:', skipStats);

  return results;
}

// 默认导出
export default {
  parseDrawingML,
  anchorToPixels,
  extractPlainText
};