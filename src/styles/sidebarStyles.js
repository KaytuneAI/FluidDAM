// 侧边栏样式定义
export const sidebarStyles = {
  container: {
    height: "100%",
    overflow: "auto",
    fontFamily: "Arial, Helvetica, Microsoft YaHei, 微软雅黑, PingFang SC, Hiragino Sans GB, WenQuanYi Micro Hei, sans-serif"
  },
  header: { 
    padding: "10px 12px", 
    borderBottom: "1px solid #e5e7eb", 
    display: "flex", 
    justifyContent: "space-between", 
    alignItems: "center"
  },
  list: { 
    padding: 12, 
    display: "grid", 
    gridTemplateColumns: "1fr", 
    gap: 8 
  },
  card: (used) => ({
    border: used ? "2px solid #3b82f6" : "1px solid #e5e7eb",
    borderRadius: 10,
    padding: 8,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    alignItems: "flex-start",
    background: used ? "#f0f7ff" : "#fff"
  }),
  thumbWrap: { 
    width: "100%", 
    minHeight: 40, 
    maxHeight: 120, 
    overflow: "hidden", 
    borderRadius: 2, 
    background: "#f9fafb", 
    display: "flex", 
    alignItems: "center", 
    justifyContent: "center" 
  },
  thumb: { 
    width: "100%", 
    height: "auto", 
    objectFit: "contain" 
  },
  name: { 
    fontSize: 12, 
    color: "#111827", 
    textAlign: "left", 
    wordBreak: "break-word" 
  },
  btn: { 
    display: "inline-block", 
    fontSize: 12, 
    padding: "6px 10px", 
    borderRadius: 2, 
    border: "1px solid #d1d5db", 
    background: "#fff", 
    cursor: "pointer" 
  },
  plat: { 
    display: "inline-flex", 
    gap: 6 
  }
};

// 高亮样式
export const highlightStyle = `
  .asset-highlight::before {
    content: '';
    position: absolute;
    top: -6px;
    left: -6px;
    right: -6px;
    bottom: -6px;
    border: 3px solid #ff0000;
    border-radius: 6px;
    pointer-events: none;
    z-index: 1000;
    animation: pulse 1s ease-in-out infinite alternate;
  }
  
  @keyframes pulse {
    0% { opacity: 0.6; transform: scale(1); }
    100% { opacity: 1; transform: scale(1.05); }
  }
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
