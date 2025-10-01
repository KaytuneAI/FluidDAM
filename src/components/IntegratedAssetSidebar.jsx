import React, { useState, useEffect, useCallback, useRef } from 'react';
import { sidebarStyles } from '../styles/sidebarStyles.js';
import { placeAssetIntoSelectedFrame } from '../utils/assetUtils.js';
import InsertImageButton from './InsertImageButton.jsx';
import LoadCanvasButton from './LoadCanvasButton.jsx';
import SaveCanvasButton from './SaveCanvasButton.jsx';
import ShareCanvasButton from './ShareCanvasButton.jsx';

export default function IntegratedAssetSidebar({ editor, selectedFrame, setIsLoading, platform = "TM", width, onReset }) {
  const [usedAssetIds, setUsedAssetIds] = useState(new Set());
  const [assets, setAssets] = useState([]);
  const [forceUpdate, setForceUpdate] = useState(0);
  
  // 去抖定时器引用
  const debounceTimerRef = useRef(null);

  // 更新已使用的资产ID
  const updateUsedAssetIds = useCallback(() => {
    if (!editor) return;
    try {
      const imgs = editor.getCurrentPageShapes().filter(s => s.type === "image");
      const setA = new Set(imgs.map(s => s?.props?.assetId).filter(Boolean));
      setUsedAssetIds(setA);
    } catch (error) {
      // 静默处理错误
    }
  }, [editor]);

  // 高亮画布中的素材
  const highlightAssetOnCanvas = useCallback((assetId) => {
    if (!editor) return;
    
    try {
      // 查找画布中所有使用该素材的图片形状
      const shapes = editor.getCurrentPageShapes();
      const targetShapes = shapes.filter(shape => 
        shape.type === "image" && shape.props.assetId === assetId
      );
      
      if (targetShapes.length > 0) {
        // 先清除之前的高亮效果
        document.querySelectorAll('.asset-highlight').forEach(el => {
          el.classList.remove('asset-highlight');
        });
        
        // 使用临时高亮效果，不移动视图，不改变选中状态
        targetShapes.forEach(shape => {
          // 尝试多种选择器来找到元素
          const selectors = [
            `[data-shape-id="${shape.id}"]`,
            `[data-tl-shape-id="${shape.id}"]`,
            `[data-id="${shape.id}"]`,
            `#shape-${shape.id}`
          ];
          
          let element = null;
          for (const selector of selectors) {
            element = document.querySelector(selector);
            if (element) break;
          }
          
          if (element) {
            // 添加高亮类名
            element.classList.add('asset-highlight');
            
            // 3秒后移除高亮效果
            setTimeout(() => {
              if (element) {
                element.classList.remove('asset-highlight');
              }
            }, 3000);
          }
        });
        
        // 已高亮显示素材
      }
    } catch (error) {
      // 静默处理错误
    }
  }, [editor]);

  // 更新资产列表 - 从当前页面的image形状反查资产（带去抖）
  const updateAssets = useCallback(() => {
    if (!editor) return;
    
    // 清除之前的定时器
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    // 设置新的去抖定时器
    debounceTimerRef.current = setTimeout(() => {
      try {
        // 1. 获取当前页面的所有image形状
        const currentShapes = editor.getCurrentPageShapes();
        const imageShapes = currentShapes.filter(shape => shape.type === 'image');
        
        // 2. 从image形状中提取assetId，然后获取对应的资产
        const assets = [];
        const seenAssetIds = new Set();
        
        for (const imageShape of imageShapes) {
          const assetId = imageShape.props?.assetId;
          if (assetId && !seenAssetIds.has(assetId)) {
            try {
              const asset = editor.getAsset(assetId);
              if (asset && asset.type === 'image') {
                assets.push(asset);
                seenAssetIds.add(assetId);
              }
            } catch (error) {
              // 资产不存在，跳过
            }
          }
        }
        
        console.log('更新资产列表:', assets.length, '个图片资产');
        console.log('从', imageShapes.length, '个图片形状中提取');
        setAssets(assets);
      } catch (error) {
        console.error('更新资产列表时出错:', error);
      }
    }, 300); // 300ms 去抖延迟
  }, [editor]);

  // 监听编辑器变化
  useEffect(() => {
    if (!editor) return;

    const updateAll = () => {
      updateUsedAssetIds();
      updateAssets();
    };

    // 初始更新
    updateAll();

    // 监听变化 - 监听形状和资产的变化
    const unsubscribe = editor.store.listen((record, prevRecord) => {
      // 监听形状变化（特别是图片形状）
      if (record && record.typeName === 'shape') {
        if (record.type === 'image') {
          console.log('检测到图片形状变化:', record.id);
          updateAll();
        }
      }
      // 监听资产变化
      if (record && record.typeName === 'asset') {
        console.log('检测到资产变化:', record.typeName, record.type, record.id);
        updateAll();
      }
    }, { scope: "document" });

    // 添加定期检查作为备用方案
    const interval = setInterval(updateAll, 2000);

    return () => {
      unsubscribe();
      clearInterval(interval);
      // 清理去抖定时器
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [editor, updateUsedAssetIds, updateAssets]);

  // 放置资产到选中的Frame
  const onPlace = useCallback((assetId) => {
    if (!editor) return;
    placeAssetIntoSelectedFrame(editor, assetId, platform);
  }, [editor, platform]);


  return (
    <div style={{
      ...sidebarStyles.container,
      width: width,
      borderLeft: `2px solid #007bff`
    }}>
      {/* 顶部操作按钮区域 */}
      <div style={{
        padding: "12px",
        borderBottom: "1px solid #e5e7eb",
        display: "flex",
        flexDirection: "column",
        gap: 8
      }}>
        <div style={{fontWeight: 600, fontSize: 14}}>素材管理</div>
        <div style={{display: 'flex', gap: 4, flexWrap: 'nowrap', alignItems: 'center'}}>
          <InsertImageButton editor={editor} selectedFrame={selectedFrame} />
          <LoadCanvasButton editor={editor} setIsLoading={setIsLoading} />
          <SaveCanvasButton editor={editor} />
          <ShareCanvasButton editor={editor} />
          <button 
            onClick={onReset}
            style={{
              fontSize: 12,
              padding: "2px",
              border: "0.5px solid #dee2e6",
              borderRadius: 2,
              background: "#dee2e6",
              color: "white",
              cursor: "pointer",
              fontWeight: "bold",
              whiteSpace: "nowrap",
              width: 40,
              height: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
            title="重置画布 (Ctrl+R)"
          >
            <img src="/src/assets/reset.png" alt="重置画布" style={{width: 32, height: 32}} />
          </button>
        </div>
      </div>

      {/* 素材预览区域 */}
      <div style={sidebarStyles.list}>
        {assets.map((a) => {
          const name = a?.props?.name || a?.props?.src?.split("/").slice(-1)[0] || a.id;
          const isUsed = usedAssetIds.has(a.id);
          return (
            <div key={a.id} style={sidebarStyles.card(isUsed)}>
              <div style={sidebarStyles.thumbWrap}>
                <img 
                  src={a?.props?.src} 
                  alt={name} 
                  style={{
                    ...sidebarStyles.thumb,
                    cursor: 'pointer'
                  }}
                  onClick={() => highlightAssetOnCanvas(a.id)}
                  title="点击高亮画布中的相同素材"
                />
              </div>
              <div>
                <div title={name} style={sidebarStyles.name}>{name}</div>
                <button style={sidebarStyles.btn} onClick={() => onPlace(a.id)}>放置到选中 Frame</button>
              </div>
            </div>
          );
        })}
        {assets.length === 0 && (
          <div style={{ color: "#6b7280", fontSize: 12, padding: "12px" }}>拖入图片或粘贴即可出现数字资产</div>
        )}
      </div>
    </div>
  );
}
