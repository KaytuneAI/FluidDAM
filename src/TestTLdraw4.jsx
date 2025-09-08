import React, { useMemo, useRef, useState } from "react";
import { Tldraw, createTLStore, defaultShapeUtils } from "tldraw";
import "tldraw/tldraw.css";

function InsertImageButton({ editor }) {
  const fileInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  // 处理拖拽文件夹
  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    
    const items = e.dataTransfer.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry();
          if (entry && entry.isFile) {
            entry.file((file) => {
              if (file.type.startsWith('image/')) {
                // 直接插入图片
                insertImage(file);
              }
            });
          }
        }
      }
    }
  };

  // 删除图片信息从JSON文件
  const deleteImageInfo = async (shapeId) => {
    try {
      const response = await fetch('http://localhost:3001/api/delete-image-data', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ shapeId })
      });

      const result = await response.json();
      
      if (result.success) {
        console.log('图片信息已从服务器删除:', shapeId);
        console.log('剩余图片数量:', result.totalImages);
      } else {
        console.error('删除失败:', result.message);
      }
      
    } catch (error) {
      console.error('删除图片信息时出错:', error);
    }
  };

  // 保存图片信息到JSON文件
  const saveImageInfo = async (file, assetId, shapeId, dataUrl, width, height) => {
    try {
      const imageInfo = {
        id: shapeId,
        assetId: assetId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        dataUrl: dataUrl.substring(0, 100) + '...', // 只保存前100个字符作为预览
        width: width,
        height: height,
        insertedAt: new Date().toISOString(),
        tags: []
      };

      // 使用后端API保存数据
      const response = await fetch('http://localhost:3001/api/save-image-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(imageInfo)
      });

      const result = await response.json();
      
      if (result.success) {
        console.log('图片信息已保存到服务器:', imageInfo.fileName);
        console.log('总图片数量:', result.totalImages);
        
        // 更新localStorage中的图片ID列表
        const currentImageIds = JSON.parse(localStorage.getItem('currentImageIds') || '[]');
        currentImageIds.push(shapeId);
        localStorage.setItem('currentImageIds', JSON.stringify(currentImageIds));
      } else {
        console.error('保存失败:', result.message);
        // 如果API失败，回退到localStorage
        const savedData = localStorage.getItem('imagesDatabase') || '{"images":[],"lastUpdated":"","totalImages":0}';
        const database = JSON.parse(savedData);
        database.images.push(imageInfo);
        database.lastUpdated = new Date().toISOString();
        database.totalImages = database.images.length;
        localStorage.setItem('imagesDatabase', JSON.stringify(database));
        console.log('已保存到localStorage作为备份');
      }
      
    } catch (error) {
      console.error('保存图片信息时出错:', error);
      // 如果API不可用，回退到localStorage
      try {
        const savedData = localStorage.getItem('imagesDatabase') || '{"images":[],"lastUpdated":"","totalImages":0}';
        const database = JSON.parse(savedData);
        database.images.push(imageInfo);
        database.lastUpdated = new Date().toISOString();
        database.totalImages = database.images.length;
        localStorage.setItem('imagesDatabase', JSON.stringify(database));
        console.log('API不可用，已保存到localStorage作为备份');
      } catch (localStorageError) {
        console.error('localStorage保存也失败:', localStorageError);
      }
    }
  };

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

      // 不再清空现有形状，允许插入多张图片

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
                
                // 将图片移到画布中心，稍微错开位置避免完全重叠
                const viewport = editor.getViewportScreenBounds();
                const centerX = viewport.width / 2;
                const centerY = viewport.height / 2;
                
                // 获取当前图片形状的数量，用于错开位置
                const imageCount = imageShapes.length;
                
                // 每张图片稍微错开一些位置
                const offsetX = (imageCount - 1) * 20;
                const offsetY = (imageCount - 1) * 20;
                
                editor.updateShape({
                  id: shapeId,
                  x: centerX - (naturalW / 2) + offsetX,
                  y: centerY - (naturalH / 2) + offsetY
                });
                
                // 保存图片信息到JSON文件
                saveImageInfo(file, assetId, shapeId, dataUrl, naturalW, naturalH);
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
              
              // 将图片移到画布中心，稍微错开位置避免完全重叠
              const viewport = editor.getViewportScreenBounds();
              const centerX = viewport.width / 2;
              const centerY = viewport.height / 2;
              
              // 获取当前图片形状的数量，用于错开位置
              const currentShapes2 = editor.getCurrentPageShapes();
              const imageShapes2 = currentShapes2.filter(shape => shape.type === 'image');
              const imageCount = imageShapes2.length;
              
              // 每张图片稍微错开一些位置
              const offsetX = (imageCount - 1) * 20;
              const offsetY = (imageCount - 1) * 20;
              
              editor.updateShape({
                id: shapeId,
                x: centerX - (naturalW / 2) + offsetX,
                y: centerY - (naturalH / 2) + offsetY
              });
              
              // 保存图片信息到JSON文件
              saveImageInfo(file, assetId, shapeId, dataUrl, naturalW, naturalH);
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
    const files = event.target.files;
    if (files.length > 0) {
      // 直接插入图片
      const file = files[0];
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





      {/* 拖拽区域 */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: dragOver ? 'rgba(0,123,255,0.1)' : 'transparent',
          border: dragOver ? '2px dashed #007bff' : 'none',
          display: dragOver ? 'flex' : 'none',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1500,
          pointerEvents: dragOver ? 'auto' : 'none'
        }}
      >
        <div style={{
          background: 'white',
          padding: '20px',
          borderRadius: '8px',
          textAlign: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
        }}>
          <h3>拖拽图片文件到这里</h3>
          <p>支持从文件夹中拖拽图片文件</p>
        </div>
      </div>




    </>
  );
}

function SaveCanvasButton({ editor }) {
  const saveCanvas = async () => {
    if (!editor) {
      console.log('编辑器未初始化');
      return;
    }

    try {
      console.log('开始保存画布...');
      
      // 获取当前画布的所有形状
      const currentShapes = editor.getCurrentPageShapes();
      const imageShapes = currentShapes.filter(shape => shape.type === 'image');
      
      // 获取图片信息
      const imageInfo = [];
      for (const shape of imageShapes) {
        try {
          // 直接从shape中获取图片信息
          const assetId = shape.props.assetId;
          
          // 尝试从后端API获取文件名
          let fileName = `image_${shape.id}`;
          try {
            const response = await fetch('http://localhost:3001/api/get-image-data');
            const database = await response.json();
            
            const imageData = database.images.find(img => img.id === shape.id);
            if (imageData) {
              fileName = imageData.fileName;
            }
          } catch (error) {
            console.warn('无法从API获取文件名，使用默认名称');
          }
          
          imageInfo.push({
            shapeId: shape.id,
            assetId: assetId,
            fileName: fileName,
            fileType: 'image/jpeg', // 默认类型
            width: shape.props.w,
            height: shape.props.h,
            x: shape.x,
            y: shape.y,
            rotation: shape.rotation || 0,
            scale: shape.props.scale || { x: 1, y: 1 }
          });
          
          console.log('保存图片信息:', fileName, shape.id);
        } catch (error) {
          console.error('处理图片信息失败:', error);
        }
      }
      
      // 导出画布状态（包含完整的图片数据）
      const canvasData = editor.store.getSnapshot ? editor.store.getSnapshot() : editor.getSnapshot();
      
      // 创建保存文件的内容
      const saveData = {
        version: '1.0',
        savedAt: new Date().toISOString(),
        canvasData: canvasData,
        imageInfo: imageInfo,
        totalImages: imageInfo.length
      };
      
      console.log('准备保存的数据结构:', {
        version: saveData.version,
        savedAt: saveData.savedAt,
        canvasDataKeys: canvasData ? Object.keys(canvasData) : 'null',
        imageInfoCount: imageInfo.length,
        totalImages: saveData.totalImages
      });
      
      // 创建并下载文件
      const blob = new Blob([JSON.stringify(saveData, null, 2)], { 
        type: 'application/json' 
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `canvas_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      console.log('画布保存成功！');
      console.log('保存的图片数量:', imageInfo.length);
      
    } catch (error) {
      console.error('保存画布时出错:', error);
      alert('保存失败，请重试');
    }
  };

  return (
    <button
      onClick={saveCanvas}
      title="保存画布"
      style={{
        fontSize: 14,
        padding: "8px 16px",
        border: "1px solid #28a745",
        borderRadius: 6,
        background: "#28a745",
        color: "white",
        cursor: "pointer",
        fontWeight: "bold"
      }}
    >
      保存画布
    </button>
  );
}

function LoadCanvasButton({ editor }) {
  const fileInputRef = useRef(null);

  const loadCanvas = async (file) => {
    if (!editor) {
      console.log('编辑器未初始化');
      return;
    }

    try {
      console.log('开始加载画布...');
      
      // 显示加载提示
      const loadingMessage = document.createElement('div');
      loadingMessage.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 20px;
        border-radius: 8px;
        z-index: 3000;
        font-size: 16px;
      `;
      loadingMessage.textContent = '正在加载画布...';
      document.body.appendChild(loadingMessage);
      
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          console.log('开始解析文件内容...');
          console.log('文件内容长度:', e.target.result.length);
          console.log('文件内容前100个字符:', e.target.result.substring(0, 100));
          
          const saveData = JSON.parse(e.target.result);
          console.log('加载的保存数据:', saveData);
          
          // 1. 重置当前画布 - 使用更安全的方法
          try {
            console.log('尝试清空画布...');
            
            // 尝试删除所有形状而不是清空store
            const currentShapes = editor.getCurrentPageShapes();
            if (currentShapes.length > 0) {
              const shapeIds = currentShapes.map(shape => shape.id);
              editor.deleteShapes(shapeIds);
              console.log('已删除所有现有形状');
            }
            
            // 等待删除操作完成
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (clearError) {
            console.warn('清空画布时出错:', clearError);
          }
          
          // 2. 直接使用loadSnapshot加载完整状态
          if (saveData.canvasData) {
            try {
              console.log('尝试加载画布状态...');
              console.log('canvasData结构:', Object.keys(saveData.canvasData));
              
              // 直接使用loadSnapshot加载完整状态
              if (editor.loadSnapshot) {
                console.log('使用 editor.loadSnapshot');
                editor.loadSnapshot(saveData.canvasData);
                console.log('画布状态已加载');
              } else {
                console.warn('找不到loadSnapshot方法');
              }
              
              // 等待加载完成
              await new Promise(resolve => setTimeout(resolve, 200));
            } catch (error) {
              console.warn('加载画布状态时出错:', error);
              console.log('错误详情:', error.message);
            }
          } else {
            console.warn('保存数据中没有canvasData');
          }
          
                    // 3. 检查加载结果
          console.log('检查加载结果...');
          const loadedShapes = editor.getCurrentPageShapes();
          console.log('加载后的形状数量:', loadedShapes.length);
          
          const imageShapes = loadedShapes.filter(shape => shape.type === 'image');
          console.log('加载后的图片形状数量:', imageShapes.length);
          
          if (imageShapes.length === 0 && saveData.imageInfo && saveData.imageInfo.length > 0) {
            console.log('图片没有加载成功，尝试手动重新创建...');
            // 这里可以添加手动重新创建图片的逻辑
          }
          
          // 4. 更新localStorage中的图片ID列表
          if (saveData.imageInfo) {
            const currentImageIds = saveData.imageInfo.map(img => img.shapeId);
            localStorage.setItem('currentImageIds', JSON.stringify(currentImageIds));
            console.log('localStorage已更新，图片ID数量:', currentImageIds.length);
          }
          
          // 5. 调整视图（暂时跳过，避免状态问题）
          console.log('跳过视图调整，避免状态冲突');
          
          // 移除加载提示
          document.body.removeChild(loadingMessage);
          
          console.log('画布加载完成！');
          
        } catch (error) {
          console.error('解析保存文件时出错:', error);
          document.body.removeChild(loadingMessage);
          alert('加载失败：文件格式错误');
        }
      };
      
      reader.onerror = (error) => {
        console.error('读取文件失败:', error);
        document.body.removeChild(loadingMessage);
        alert('加载失败：无法读取文件');
      };
      
      reader.readAsText(file);
      
    } catch (error) {
      console.error('加载画布时出错:', error);
      if (document.body.contains(loadingMessage)) {
        document.body.removeChild(loadingMessage);
      }
      alert('加载失败，请重试');
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      console.log('选择的文件:', file.name);
      console.log('文件类型:', file.type);
      console.log('文件大小:', file.size);
      
      if (file.type === 'application/json' || file.name.endsWith('.json')) {
        loadCanvas(file);
      } else {
        alert('请选择有效的JSON文件');
      }
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
        accept=".json"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />
      
      {/* 加载画布按钮 */}
      <button
        onClick={openFileDialog}
        title="加载保存的画布"
        style={{
          fontSize: 14,
          padding: "8px 16px",
          border: "1px solid #ffc107",
          borderRadius: 6,
          background: "#ffc107",
          color: "white",
          cursor: "pointer",
          fontWeight: "bold"
        }}
      >
        加载画布
      </button>
    </>
  );
}

export default function MinimalTldrawInsert() {
  const store = useMemo(() => createTLStore({ shapeUtils: [...defaultShapeUtils] }), []);
  const editorRef = useRef(null);
  const [editorReady, setEditorReady] = useState(false);



  // 监听删除事件
  const handleDeleteEvent = async (deletedShapes) => {
    if (deletedShapes && deletedShapes.length > 0) {
      for (const shape of deletedShapes) {
        if (shape.type === 'image') {
          console.log('检测到图片删除:', shape.id);
          // 调用删除API
          try {
            const response = await fetch('http://localhost:3001/api/delete-image-data', {
              method: 'DELETE',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ shapeId: shape.id })
            });

            const result = await response.json();
            
            if (result.success) {
              console.log('图片信息已从服务器删除:', shape.id);
              console.log('剩余图片数量:', result.totalImages);
            } else {
              console.error('删除失败:', result.message);
            }
          } catch (error) {
            console.error('删除图片信息时出错:', error);
          }
        }
      }
    }
  };

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <Tldraw
        store={store}
        onMount={(editor) => {
          editorRef.current = editor;
          setEditorReady(true);
          
          // 监听删除事件
          editor.store.listen(() => {
            const currentShapes = editor.getCurrentPageShapes();
            const imageShapes = currentShapes.filter(shape => shape.type === 'image');
            
            // 获取之前保存的图片ID列表
            const previousImageIds = JSON.parse(localStorage.getItem('currentImageIds') || '[]');
            const currentImageIds = imageShapes.map(shape => shape.id);
            
            // 找出被删除的图片
            const deletedImageIds = previousImageIds.filter(id => !currentImageIds.includes(id));
            
            if (deletedImageIds.length > 0) {
              console.log('检测到删除的图片:', deletedImageIds);
              handleDeleteEvent(deletedImageIds.map(id => ({ id, type: 'image' })));
            }
            

            
            // 更新当前图片ID列表
            localStorage.setItem('currentImageIds', JSON.stringify(currentImageIds));
          });
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
          gap: 8,
          background: 'white',
          border: '1px solid #ddd',
          borderRadius: 8,
          padding: '8px',
          boxShadow: '0 1px 4px rgba(0,0,0,.1)',
          pointerEvents: 'auto',
          flexWrap: 'wrap',
          maxWidth: '90vw'
        }}>
          <InsertImageButton editor={editorRef.current} />
          <SaveCanvasButton editor={editorRef.current} />
          <LoadCanvasButton editor={editorRef.current} />
        </div>
      )}
    </div>
  );
}
