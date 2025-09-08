import React, { useMemo, useRef, useState } from "react";
import { Tldraw, createTLStore, defaultShapeUtils } from "tldraw";
import "tldraw/tldraw.css";

function InsertImageButton({ editor }) {
  const fileInputRef = useRef(null);

  const insertImage = (file) => {
    if (!editor) {
      console.log('编辑器未初始化');
      return;
    }

    if (!file) {
      console.log('没有选择文件');
      return;
    }

    console.log('正在插入图片:', file.name);
    
    try {
      const getMimeTypeFromFile = (file) => {
        return file.type || 'image/jpeg';
      };

      // 先清空所有现有形状
      const existingShapes = editor.getCurrentPageShapes();
      if (existingShapes.length > 0) {
        const shapeIds = existingShapes.map(shape => shape.id);
        editor.deleteShapes(shapeIds);
      }

      // 将文件转换为 data URL
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        
        // 预加载图片，使用原始尺寸创建 asset/shape
        const img = new Image();
        
        img.onload = () => {
          const naturalW = img.naturalWidth || 300;
          const naturalH = img.naturalHeight || 300;

          const assetId = `asset:${(globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2))}`;
          
          try {
            editor.createAssets([
              {
                id: assetId,
                type: "image",
                typeName: "asset",
                meta: {},
                props: {
                  w: naturalW,
                  h: naturalH,
                  src: dataUrl,
                  name: file.name,
                  mimeType: getMimeTypeFromFile(file),
                  isAnimated: false
                }
              }
            ]);
          } catch (assetError) {
            console.error('创建资产时发生错误:', assetError);
            return;
          }

          const imageShape = {
            id: `shape:${(globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2))}`,
            type: "image",
            x: 0,
            y: 0,
            props: {
              w: naturalW,
              h: naturalH,
              assetId
            }
          };

          try {
            let createdShapes = null;
            
            if (typeof editor.insertShapes === 'function') {
              createdShapes = editor.insertShapes([imageShape]);
            } else if (typeof editor.createShapes === 'function') {
              createdShapes = editor.createShapes([imageShape]);
            } else {
              console.error('没有找到可用的形状插入方法');
              return;
            }
            
            // 如果返回的是编辑器对象，尝试从当前页面获取形状
            if (createdShapes && !Array.isArray(createdShapes)) {
              const currentShapes = editor.getCurrentPageShapes();
              const imageShapes = currentShapes.filter(shape => shape.type === 'image');
              
              if (imageShapes.length > 0) {
                const shapeId = imageShapes[imageShapes.length - 1].id;
                
                // 尝试不同的选择工具方法
                if (typeof editor.setSelectedTool === 'function') {
                  editor.setSelectedTool('select');
                } else if (typeof editor.setTool === 'function') {
                  editor.setTool('select');
                } else if (typeof editor.selectTool === 'function') {
                  editor.selectTool('select');
                }
                
                // 尝试不同的选择形状方法
                if (typeof editor.setSelectedShapes === 'function') {
                  editor.setSelectedShapes([shapeId]);
                } else if (typeof editor.selectShapes === 'function') {
                  editor.selectShapes([shapeId]);
                } else if (typeof editor.select === 'function') {
                  editor.select(shapeId);
                }
                
                // 将图片移到画布中心
                const viewport = editor.getViewportScreenBounds();
                const centerX = viewport.width / 2;
                const centerY = viewport.height / 2;
                
                editor.updateShape({
                  id: shapeId,
                  x: centerX - (naturalW / 2),
                  y: centerY - (naturalH / 2)
                });
              }
            } else if (createdShapes && createdShapes.length > 0) {
              const shapeId = createdShapes[0].id;
              
              // 尝试不同的选择工具方法
              if (typeof editor.setSelectedTool === 'function') {
                editor.setSelectedTool('select');
              } else if (typeof editor.setTool === 'function') {
                editor.setTool('select');
              } else if (typeof editor.selectTool === 'function') {
                editor.selectTool('select');
              }
              
              // 尝试不同的选择形状方法
              if (typeof editor.setSelectedShapes === 'function') {
                editor.setSelectedShapes([shapeId]);
              } else if (typeof editor.selectShapes === 'function') {
                editor.selectShapes([shapeId]);
              } else if (typeof editor.select === 'function') {
                editor.select(shapeId);
              }
              
              // 将图片移到画布中心
              const viewport = editor.getViewportScreenBounds();
              const centerX = viewport.width / 2;
              const centerY = viewport.height / 2;
              
              editor.updateShape({
                id: shapeId,
                x: centerX - (naturalW / 2),
                y: centerY - (naturalH / 2)
              });
            }
            
            editor.zoomToFit();
          } catch (shapeError) {
            console.error('创建形状时发生错误:', shapeError);
          }
        };
        
        img.onerror = (error) => {
          console.error('图片加载失败:', file.name);
        };
        
        img.src = dataUrl;
      };
      
      reader.onerror = (error) => {
        console.error('文件读取失败:', error);
      };
      
      // 开始读取文件
      reader.readAsDataURL(file);
      
    } catch (error) {
      console.error('插入图片时出错:', error);
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      insertImage(file);
    }
    // 清空input值，允许重复选择同一文件
    event.target.value = '';
  };

  const openFileDialog = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <>
      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />
      
      {/* 插入图片按钮 */}
      <button
        onClick={openFileDialog}
        title="插入本地图片"
        style={{
          fontSize: 14,
          padding: "8px 16px",
          border: "1px solid #007bff",
          borderRadius: 6,
          background: "#007bff",
          color: "white",
          cursor: "pointer",
          fontWeight: "bold"
        }}
      >
        插入图片
      </button>
    </>
  );
}

export default function MinimalTldrawInsert() {
  const store = useMemo(() => createTLStore({ shapeUtils: [...defaultShapeUtils] }), []);
  const editorRef = useRef(null);
  const [editorReady, setEditorReady] = useState(false);

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <Tldraw
        store={store}
        onMount={(editor) => {
          editorRef.current = editor;
          setEditorReady(true);
        }}
      />
      
      {/* 按钮放在画布中间上方 - 只有editor准备好时才显示 */}
      {editorReady && (
        <div style={{
          position: 'absolute',
          top: 10,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: 'white',
          border: '1px solid #ddd',
          borderRadius: 8,
          padding: '8px',
          boxShadow: '0 1px 4px rgba(0,0,0,.1)',
          pointerEvents: 'auto'
        }}>
          <InsertImageButton editor={editorRef.current} />
        </div>
      )}
    </div>
  );
}
