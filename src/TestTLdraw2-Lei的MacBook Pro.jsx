import React, { useMemo, useRef, useState } from "react";
import { Tldraw, createTLStore, defaultShapeUtils } from "tldraw";
import "tldraw/tldraw.css";

function InsertImageButton({ editor }) {
  const fileInputRef = useRef(null);

  // 验证编辑器是否有效
  const isEditorValid = () => {
    console.log('=== 编辑器有效性检查开始 ===');
    console.log('编辑器对象:', editor);
    console.log('编辑器类型:', typeof editor);
    console.log('编辑器是否为null:', editor === null);
    console.log('编辑器是否为undefined:', editor === undefined);
    
    if (editor) {
      console.log('编辑器方法检查:');
      console.log('- addShape:', typeof editor.addShape);
      console.log('- createAssets:', typeof editor.createAssets);
      console.log('- getCurrentPageShapes:', typeof editor.getCurrentPageShapes);
      console.log('- createShapes:', typeof editor.createShapes);
      console.log('- put:', typeof editor.put);
      console.log('- store:', editor.store);
      
      // 列出所有方法
      console.log('编辑器所有方法:', Object.getOwnPropertyNames(editor).filter(name => typeof editor[name] === 'function'));
    }
    
    const isValid = editor && 
           typeof editor.addShape === 'function' && 
           typeof editor.createAssets === 'function' &&
           typeof editor.getCurrentPageShapes === 'function';
    
    console.log('最终验证结果:', isValid);
    console.log('=== 编辑器有效性检查结束 ===');
    
    return isValid;
  };

  const insertImage = (file) => {
    if (!isEditorValid()) {
      console.log('编辑器无效或未正确初始化');
      return;
    }
    
    // 检查编辑器是否准备就绪
    if (editor.isReady && !editor.isReady()) {
      console.log('编辑器尚未准备就绪，请稍后再试');
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
      console.log('清空前的形状数量:', existingShapes.length);
      if (existingShapes.length > 0) {
        const shapeIds = existingShapes.map(shape => shape.id);
        editor.deleteShapes(shapeIds);
        console.log('已清空所有形状');
      }

      // 创建文件URL
      const fileUrl = URL.createObjectURL(file);
      console.log('文件URL已创建:', fileUrl);

      // 预加载图片，使用原始尺寸创建 asset/shape
      console.log('开始创建图片对象...');
      const img = new Image();
      
      img.onload = () => {
        console.log('图片加载成功，尺寸:', img.naturalWidth, 'x', img.naturalHeight);
        const naturalW = img.naturalWidth || 300;
        const naturalH = img.naturalHeight || 300;

        const assetId = `asset:${(globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2))}`;
        console.log('准备创建资产，资产ID:', assetId);
        
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
                src: fileUrl,
                name: file.name,
                mimeType: getMimeTypeFromFile(file),
                isAnimated: false
              }
            }
          ]);
          console.log('资产创建成功，资产ID:', assetId);
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

        // 创建图片形状
        console.log('准备创建形状，形状对象:', imageShape);
        
        try {
          // 使用 addShape 方法
          console.log('尝试使用 addShape 方法...');
          const shapeId = editor.addShape(imageShape);
          console.log('addShape 返回的ID:', shapeId);
          
          if (shapeId) {
            // 确保图片可见
            editor.setSelectedTool('select');
            editor.setSelectedShapes([shapeId]);
            
            // 将图片移到画布中心
            const viewport = editor.getViewportScreenBounds();
            const centerX = viewport.width / 2;
            const centerY = viewport.height / 2;
            
            editor.updateShape({
              id: shapeId,
              x: centerX - (naturalW / 2),
              y: centerY - (naturalH / 2)
            });
            
            console.log('图片插入成功，形状ID:', shapeId);
          } else {
            console.error('addShape 失败，没有返回ID');
          }
          
          editor.zoomToFit();
        } catch (shapeError) {
          console.error('创建形状时发生错误:', shapeError);
        }
      };
      
      img.onerror = (error) => {
        console.error('图片加载失败:', file.name);
        console.error('错误详情:', error);
      };
      
      console.log('设置图片源:', fileUrl);
      img.src = fileUrl;
      console.log('图片对象状态:', {
        src: img.src,
        complete: img.complete,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        readyState: img.readyState
      });
      
      // 添加超时检查
      setTimeout(() => {
        console.log('5秒后图片状态检查:', {
          complete: img.complete,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          readyState: img.readyState
        });
        if (!img.complete) {
          console.error('图片加载超时或失败');
        }
      }, 5000);
      
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
       
       {/* 测试按钮 */}
       <button
         onClick={() => {
           console.log('=== 测试按钮点击 ===');
           console.log('editor参数:', editor);
           console.log('editor类型:', typeof editor);
           console.log('editor是否为null:', editor === null);
           console.log('editor是否为undefined:', editor === undefined);
           
           if (!editor) {
             console.error('编辑器对象为空');
             return;
           }
           
           console.log('编辑器对象存在，检查方法...');
           console.log('addShape方法:', typeof editor.addShape);
           console.log('createAssets方法:', typeof editor.createAssets);
           console.log('getCurrentPageShapes方法:', typeof editor.getCurrentPageShapes);
           
           // 尝试直接调用方法
           try {
             console.log('尝试获取当前页面形状...');
             const shapes = editor.getCurrentPageShapes();
             console.log('当前页面形状:', shapes);
             
             console.log('尝试创建测试形状...');
             const testShape = {
               type: "geo",
               x: 100,
               y: 100,
               props: {
                 w: 100,
                 h: 100,
                 fill: "red",
                 geo: "rectangle"
               }
             };
             
             const result = editor.addShape(testShape);
             console.log('测试形状创建结果:', result);
             
             if (result) {
               console.log('测试形状创建成功，ID:', result);
             } else {
               console.error('测试形状创建失败');
             }
           } catch (error) {
             console.error('测试过程中出错:', error);
           }
         }}
         style={{
           fontSize: 12,
           padding: "6px 12px",
           border: "1px solid #28a745",
           borderRadius: 6,
           background: "#28a745",
           color: "white",
           cursor: "pointer",
           marginLeft: "8px"
         }}
       >
         测试矩形
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
          console.log('=== Tldraw onMount 开始 ===');
          console.log('传入的editor对象:', editor);
          console.log('editor类型:', typeof editor);
          
          editorRef.current = editor;
          setEditorReady(true);
          
          console.log('editorRef.current 已设置:', editorRef.current);
          console.log('editorRef.current 类型:', typeof editorRef.current);
          
          if (editor) {
            console.log('编辑器方法检查:');
            console.log('- addShape:', typeof editor.addShape);
            console.log('- createAssets:', typeof editor.createAssets);
            console.log('- getCurrentPageShapes:', typeof editor.getCurrentPageShapes);
            console.log('- createShapes:', typeof editor.createShapes);
            
            // 列出所有方法
            console.log('编辑器所有方法:', Object.getOwnPropertyNames(editor).filter(name => typeof editor[name] === 'function'));
          }
          
          console.log('=== Tldraw onMount 结束 ===');
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
          {console.log('渲染InsertImageButton时editorRef.current:', editorRef.current)}
        </div>
      )}
      
      {/* 调试信息 */}
      <div style={{
        position: 'absolute',
        top: 60,
        left: 10,
        background: 'rgba(0,0,0,0.8)',
        color: 'white',
        padding: '8px',
        borderRadius: '4px',
        fontSize: '12px',
        zIndex: 1000
      }}>
        <div>Editor Ready: {editorReady ? 'Yes' : 'No'}</div>
        <div>Editor Ref: {editorRef.current ? 'Set' : 'Null'}</div>
        <div>AddShape: {typeof editorRef.current?.addShape === 'function' ? 'Yes' : 'No'}</div>
      </div>
    </div>
  );
}
