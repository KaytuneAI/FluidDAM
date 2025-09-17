// DrawingML.js
// 负责解析 Excel .xlsx 中的 DrawingML (xl/drawings/drawing*.xml)
// 提取文本框、形状、图片的锚点和文字，返回可以直接生成 TLDraw shape 的数据

import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

// EMU → 像素换算 (1 px = 9525 EMU at 96dpi)
const EMU_PER_PIXEL = 9525;

function emuToPx(value) {
  return Math.round(value / EMU_PER_PIXEL);
}

/**
 * 把 anchor (from/to + offset 或 ext) 转换成像素矩形
 */
export function anchorToPixels(anchor, dims) {
  if (!anchor) return null;

  if (anchor['xdr:from'] && anchor['xdr:to']) {
    const from = anchor['xdr:from'];
    const to = anchor['xdr:to'];

    const colFrom = parseInt(from['xdr:col'], 10);
    const rowFrom = parseInt(from['xdr:row'], 10);
    const colTo = parseInt(to['xdr:col'], 10);
    const rowTo = parseInt(to['xdr:row'], 10);

    const x = dims.colOffsets[colFrom] + (parseInt(from['xdr:colOff'] || 0, 10) / EMU_PER_PIXEL);
    const y = dims.rowOffsets[rowFrom] + (parseInt(from['xdr:rowOff'] || 0, 10) / EMU_PER_PIXEL);
    const w = (dims.colOffsets[colTo] - dims.colOffsets[colFrom]) + (parseInt(to['xdr:colOff'] || 0, 10) / EMU_PER_PIXEL);
    const h = (dims.rowOffsets[rowTo] - dims.rowOffsets[rowFrom]) + (parseInt(to['xdr:rowOff'] || 0, 10) / EMU_PER_PIXEL);

    return { x, y, w, h };
  }

  if (anchor['xdr:from'] && anchor['xdr:ext']) {
    const from = anchor['xdr:from'];
    const col = parseInt(from['xdr:col'], 10);
    const row = parseInt(from['xdr:row'], 10);
    const x = dims.colOffsets[col] + (parseInt(from['xdr:colOff'] || 0, 10) / EMU_PER_PIXEL);
    const y = dims.rowOffsets[row] + (parseInt(from['xdr:rowOff'] || 0, 10) / EMU_PER_PIXEL);

    const ext = anchor['xdr:ext'];
    const w = emuToPx(parseInt(ext['@_cx'], 10));
    const h = emuToPx(parseInt(ext['@_cy'], 10));

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
 * 解析某个工作表关联的 DrawingML
 * @param {JSZip} zip 解压后的 xlsx zip
 * @param {string} drawingPath 相对路径，比如 "xl/drawings/drawing1.xml"
 * @param {Object} dims { colOffsets:[], rowOffsets:[] } 来自 excelUtils 的换算
 * @returns {Object} { texts:[], images:[], shapes:[] }
 */
async function parseDrawingML(zip, drawingPath, dims) {
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

  const results = { texts: [], images: [], shapes: [] };

  for (const a of anchors) {
    const rect = anchorToPixels(a, dims);
    if (!rect) continue;

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
      if (text) results.texts.push({ rect, text });
      continue;
    }

    // 其它形状（可选）
    results.shapes.push({ rect, kind: 'rect' });
  }

  return results;
}

// 默认导出
export default {
  parseDrawingML,
  anchorToPixels,
  extractPlainText
};