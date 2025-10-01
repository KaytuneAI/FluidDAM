import React, { useState, useEffect } from 'react';

export default function ResizableSidebar({ children, width, onWidthChange }) {
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
      <div style={{ width: width, height: '100%', position: 'relative' }}>
        {children}
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
      </div>
    </div>
  );
}
