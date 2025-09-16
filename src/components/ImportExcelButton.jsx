import React, { useRef, useState } from "react";
import { importExcelToTLDraw, validateExcelFile } from '../utils/excelUtils.js';

export default function ImportExcelButton({ editor }) {
  const fileInputRef = useRef(null);
  const [isImporting, setIsImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // 处理拖拽
  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    const excelFiles = files.filter(file => validateExcelFile(file));
    
    if (excelFiles.length > 0) {
      await handleFileImport(excelFiles[0]);
    } else {
      alert('请拖拽有效的Excel文件（.xlsx, .xls, .xlsm）');
    }
  };

  // 处理文件选择
  const handleFileSelect = async (event) => {
    const files = event.target.files;
    if (files.length > 0) {
      const file = files[0];
      if (validateExcelFile(file)) {
        await handleFileImport(file);
      } else {
        alert('请选择有效的Excel文件（.xlsx, .xls, .xlsm）');
      }
    }
    // 清空input值，允许重复选择同一文件
    event.target.value = '';
  };

  // 导入Excel文件
  const handleFileImport = async (file) => {
    if (!editor) {
      alert('编辑器未初始化');
      return;
    }

    setIsImporting(true);
    
    try {
      console.log('开始导入Excel文件:', file.name);
      const result = await importExcelToTLDraw(file, editor);
      
      if (result.success) {
        alert(`Excel导入成功！共创建了 ${result.shapesCount} 个元素。`);
      } else {
        alert(`导入失败: ${result.error}`);
      }
    } catch (error) {
      console.error('导入Excel时出错:', error);
      alert(`导入失败: ${error.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  // 打开文件选择对话框
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
        accept=".xlsx,.xls,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      {/* Excel导入按钮 */}
      <button
        onClick={openFileDialog}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        disabled={isImporting}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '8px 12px',
          margin: '4px',
          backgroundColor: isImporting ? '#f0f0f0' : '#4CAF50',
          color: isImporting ? '#999' : 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: isImporting ? 'not-allowed' : 'pointer',
          fontSize: '14px',
          fontWeight: '500',
          minWidth: '120px',
          height: '36px',
          transition: 'all 0.2s ease',
          boxShadow: dragOver ? '0 4px 12px rgba(76, 175, 80, 0.3)' : '0 2px 4px rgba(0,0,0,0.1)',
          transform: dragOver ? 'translateY(-1px)' : 'none',
          opacity: dragOver ? 0.9 : 1
        }}
        onMouseEnter={(e) => {
          if (!isImporting) {
            e.target.style.backgroundColor = '#45a049';
            e.target.style.transform = 'translateY(-1px)';
            e.target.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isImporting) {
            e.target.style.backgroundColor = '#4CAF50';
            e.target.style.transform = 'none';
            e.target.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
          }
        }}
        title={isImporting ? '正在导入Excel文件...' : '点击或拖拽Excel文件到此处导入'}
      >
        {isImporting ? (
          <>
            <div style={{
              width: '16px',
              height: '16px',
              border: '2px solid #999',
              borderTop: '2px solid transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              marginRight: '8px'
            }} />
            导入中...
          </>
        ) : (
          <>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ marginRight: '8px' }}
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14,2 14,8 20,8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10,9 9,9 8,9" />
            </svg>
            导入Excel
          </>
        )}
      </button>

      {/* CSS动画 */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
