import React, { useMemo, useRef, useState } from "react";
import { Tldraw, createTLStore, defaultShapeUtils } from "tldraw";
import "tldraw/tldraw.css";

/**
 * 最小可用版（修复 useEditor 报错）：
 * - 按钮放在 <Tldraw> 外层（可见的 HTML 按钮），不调用 useEditor。
 * - 通过 <Tldraw onMount> 拿到 editor 实例，存在 ref 里。
 * - 点击按钮，粘贴图片 URL（局域网共享盘通过 HTTP/WebDAV 暴露的地址），在画布中心插入图片+说明文字。
 */

function insertImage(editor, urlStr) {
  if (!editor) {
    console.log('Editor 未初始化');
    return;
  }
  const u = (urlStr || "").trim();
  if (!u) {
    console.log('URL 为空');
    return;
  }

  console.log('正在插入图片:', u);
  
  try {
    const getMimeTypeFromUrl = (url) => {
      const lower = url.split('?')[0].toLowerCase();
      if (lower.endsWith('.png')) return 'image/png';
      if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
      if (lower.endsWith('.gif')) return 'image/gif';
      if (lower.endsWith('.webp')) return 'image/webp';
      if (lower.endsWith('.bmp')) return 'image/bmp';
      if (lower.endsWith('.svg')) return 'image/svg+xml';
      return 'image/jpeg';
    };

    // 先清空所有现有形状
    const existingShapes = editor.getCurrentPageShapes();
    if (existingShapes.length > 0) {
      const shapeIds = existingShapes.map(shape => shape.id);
      editor.deleteShapes(shapeIds);
    }

    // 预加载图片，使用原始尺寸创建 asset/shape
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const naturalW = img.naturalWidth || 300;
      const naturalH = img.naturalHeight || 300;

      const assetId = `asset:${(globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2))}`;
      editor.createAssets([
        {
          id: assetId,
          type: "image",
          typeName: "asset",
          meta: {},
          props: {
            w: naturalW,
            h: naturalH,
            src: u,
            name: u.split("/").pop() || "image",
            mimeType: getMimeTypeFromUrl(u),
            isAnimated: false
          }
        }
      ]);

      const imageShape = {
        type: "image",
        x: 0,
        y: 0,
        props: {
          w: naturalW,
          h: naturalH,
          assetId
        }
      };

      editor.createShapes([imageShape]);
      editor.zoomToFit();
    };
    img.onerror = () => {
      console.error('图片加载失败:', u);
    };
    img.src = u;
    
  } catch (error) {
    console.error('插入图片时出错:', error);
  }
}

function InsertImageButton({ onInsert }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [pathType, setPathType] = useState("http"); // http, unc, local

  const convertPath = (inputPath, type) => {
    const path = inputPath.trim();
    
    switch(type) {
      case "unc":
        // UNC路径转换为HTTP (需要配置文件服务器)
        // 例如: \\192.168.1.100\shared\image.jpg -> http://192.168.1.100/shared/image.jpg
        if (path.startsWith("\\\\")) {
          return path.replace(/\\\\/g, "/").replace(/^\//g, "http://");
        }
        return path;
      
      case "local":
        // 本地路径转换 (需要本地HTTP服务器)
        // 例如: C:\images\photo.jpg -> http://localhost:8080/images/photo.jpg
        if (path.match(/^[A-Za-z]:\\/)) {
          const relativePath = path.replace(/^[A-Za-z]:\\/g, "").replace(/\\/g, "/");
          return `http://localhost:8080/${relativePath}`;
        }
        return path;
      
      default:
        return path;
    }
  };

  return (
    <div style={{ position: "absolute", top: 8, left: 8, zIndex: 100, display: "flex", gap: 8, flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => setOpen(v => !v)}
          style={{ background: "white", border: "1px solid #ddd", borderRadius: 8, padding: "8px 12px", boxShadow: "0 2px 8px rgba(0,0,0,.06)", cursor: "pointer" }}
        >
          插入网络图片
        </button>
        <button
          onClick={() => {
            const editor = window.editorRef?.current;
            if (editor) {
              const shapes = editor.getCurrentPageShapes();
              if (shapes.length > 0) {
                editor.deleteShapes(shapes.map(s => s.id));
                console.log('已清空画布');
              }
            }
          }}
          style={{ background: "#ff6b6b", color: "white", border: "none", borderRadius: 8, padding: "8px 12px", boxShadow: "0 2px 8px rgba(0,0,0,.06)", cursor: "pointer" }}
        >
          清空画布
        </button>
      </div>
      
      {open && (
        <div style={{ background: "white", border: "1px solid #ddd", borderRadius: 8, padding: 12, boxShadow: "0 2px 8px rgba(0,0,0,.06)", minWidth: 500 }}>
          {/* 路径类型选择 */}
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 14, fontWeight: "bold", marginBottom: 4, display: "block" }}>选择路径类型：</label>
            <div style={{ display: "flex", gap: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input 
                  type="radio" 
                  value="http" 
                  checked={pathType === "http"} 
                  onChange={(e) => setPathType(e.target.value)}
                />
                HTTP网络路径
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input 
                  type="radio" 
                  value="unc" 
                  checked={pathType === "unc"} 
                  onChange={(e) => setPathType(e.target.value)}
                />
                UNC共享路径
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input 
                  type="radio" 
                  value="local" 
                  checked={pathType === "local"} 
                  onChange={(e) => setPathType(e.target.value)}
                />
                本地文件路径
              </label>
            </div>
          </div>
          
          {/* 路径输入框 */}
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <input
                id="image-url-input"
                name="imageUrl"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder={{
                  http: "https://example.com/image.jpg",
                  unc: "\\\\192.168.1.100\\shared\\image.jpg",
                  local: "C:\\\\images\\\\photo.jpg"
                }[pathType]}
                style={{ width: "100%", border: "1px solid #ddd", borderRadius: 6, padding: "8px 12px" }}
              />
              <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                {pathType === "http" && "直接输入HTTP/HTTPS图片链接"}
                {pathType === "unc" && "输入UNC共享路径，需要网络共享服务器支持HTTP访问"}
                {pathType === "local" && "输入本地文件路径，需要启动本地HTTP服务器(如 http-server)"}
              </div>
            </div>
            <button
              onClick={() => { 
                const convertedUrl = convertPath(url, pathType);
                console.log('原始路径:', url);
                console.log('转换后路径:', convertedUrl);
                onInsert(convertedUrl); 
                setOpen(false); 
                setUrl(""); 
              }}
              style={{ padding: "8px 16px", border: "1px solid #ddd", borderRadius: 6, background: "#f7f7f7", cursor: "pointer" }}
            >
              插入
            </button>
          </div>
          
          {/* 快速测试按钮 */}
          <div style={{ marginTop: 12, paddingTop: 8, borderTop: "1px solid #eee" }}>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>快速测试：</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => {
                  const testUrl = "https://picsum.photos/400/300";
                  setUrl(testUrl);
                  setPathType("http");
                }}
                style={{ fontSize: 12, padding: "4px 8px", border: "1px solid #ddd", borderRadius: 4, background: "#f9f9f9", cursor: "pointer" }}
              >
                随机图片
              </button>
              <button
                onClick={() => {
                  const testUrl = "\\\\192.168.1.100\\shared\\test.jpg";
                  setUrl(testUrl);
                  setPathType("unc");
                }}
                style={{ fontSize: 12, padding: "4px 8px", border: "1px solid #ddd", borderRadius: 4, background: "#f9f9f9", cursor: "pointer" }}
              >
                UNC示例
              </button>
              <button
                onClick={() => {
                  const testUrl = "C:\\\\Users\\\\Public\\\\Pictures\\\\sample.jpg";
                  setUrl(testUrl);
                  setPathType("local");
                }}
                style={{ fontSize: 12, padding: "4px 8px", border: "1px solid #ddd", borderRadius: 4, background: "#f9f9f9", cursor: "pointer" }}
              >
                本地示例
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MinimalTldrawInsert() {
  const store = useMemo(() => createTLStore({ shapeUtils: [...defaultShapeUtils] }), []);
  const editorRef = useRef(null);

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      {/* 按钮放在 Tldraw 外层，避免 useEditor 上下文报错 */}
      <InsertImageButton onInsert={(url) => insertImage(editorRef.current, url)} />

      {/* 全屏画布；通过 onMount 拿到 editor 实例 */}
      <Tldraw
        store={store}
        onMount={(editor) => { editorRef.current = editor; }}
      />
    </div>
  );
}
