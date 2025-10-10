import React, { useState, useEffect } from 'react';

export default function ResizableSidebar({ children, width, onWidthChange, collapsed, onToggleCollapse }) {
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startWidth, setStartWidth] = useState(0);

  const handleMouseDown = (e) => {
    setIsDragging(true);
    setStartX(e.clientX);
    setStartWidth(width);
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      
      const deltaX = startX - e.clientX; // 向左拖拽增加宽度
      const newWidth = Math.max(200, Math.min(600, startWidth + deltaX));
      onWidthChange(newWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, startX, startWidth, onWidthChange]);

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ 
        width: width, 
        height: '100%', 
        position: 'relative',
        transition: 'width 0.3s ease-in-out',
        overflow: 'hidden'
      }}>
        {!collapsed && children}
        {!collapsed && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: 4,
              height: '100%',
              background: isDragging ? '#007bff' : '#e5e7eb',
              cursor: 'col-resize',
              zIndex: 10,
              transition: isDragging ? 'none' : 'background 0.2s'
            }}
            onMouseDown={handleMouseDown}
          />
        )}
      </div>
      
      {/* 收起/展开按钮 */}
      <div
        style={{
          width: 20,
          height: '100%',
          background: '#f8f9fa',
          borderLeft: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'background 0.2s',
          position: 'relative'
        }}
        onClick={onToggleCollapse}
        onMouseEnter={(e) => e.target.style.background = '#e9ecef'}
        onMouseLeave={(e) => e.target.style.background = '#f8f9fa'}
        title={collapsed ? '展开素材面板' : '收起素材面板'}
      >
        <div
          style={{
            width: 0,
            height: 0,
            borderStyle: 'solid',
            borderWidth: '6px 0 6px 8px',
            borderColor: `transparent transparent transparent ${collapsed ? '#6c757d' : '#6c757d'}`,
            transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)',
            transition: 'transform 0.2s ease-in-out'
          }}
        />
      </div>
    </div>
  );
}
