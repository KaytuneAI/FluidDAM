# 交互式画布演示项目 (Interactive Canvas Demo)

一个基于React + Vite + Tldraw的交互式画布应用，用于创建和编辑各种推广内容。

## 项目特性

- 🎨 **交互式画布**: 基于Tldraw的绘图和编辑功能
- 📱 **响应式设计**: 适配不同设备和屏幕尺寸
- 🖼️ **图像处理**: 支持图像上传、编辑和导出
- 📄 **PDF导出**: 将画布内容导出为PDF格式
- 🎯 **产品展示**: 支持各种产品推广设计

## 技术栈

- **前端框架**: React 19.1.1
- **构建工具**: Vite 7.1.2
- **绘图库**: Tldraw 3.15.3
- **PDF处理**: jsPDF, PDF-lib
- **图像处理**: html2canvas
- **后端服务**: Express.js

## 快速开始

### 环境要求

- Node.js >= 16.0.0
- npm >= 8.0.0

### 安装依赖

```bash
npm install
```

### 开发模式

启动开发服务器：

```bash
# 仅启动前端开发服务器
npm run dev

# 启动后端服务器
npm run server

# 同时启动前端和后端服务器
npm run dev:full
```

访问 http://localhost:5173 查看应用。

### 构建生产版本

```bash
npm run build
```

构建完成后，文件将输出到 `dist` 目录。

### 预览生产版本

```bash
npm run preview
```

## 项目结构

```
src/
├── App.jsx                 # 主应用组件
├── TestTLdraw7.jsx        # 主要的Tldraw画布组件
├── ErrorBoundary.jsx      # 错误边界组件
├── assets/                # 静态资源
└── main.jsx              # 应用入口点

public/
├── images-database.json   # 图像数据库
├── manifest.json         # PWA配置
└── vite.svg             # 图标文件
```

## 主要功能

### 画布编辑
- 绘制和编辑各种图形
- 添加文本和图像
- 图层管理和排序
- 撤销/重做操作

### 图像处理
- 上传本地图像
- 图像缩放和旋转
- 图像滤镜和效果
- 批量图像处理

### 导出功能
- 导出为PNG/JPG图像
- 导出为PDF文档
- 保存项目文件

## 开发指南

### 代码规范

项目使用ESLint进行代码检查：

```bash
npm run lint
```

### 添加新功能

1. 在 `src/` 目录下创建新组件
2. 更新 `App.jsx` 引入新组件
3. 添加相应的样式和功能
4. 更新文档

## 部署

### 静态部署

构建完成后，将 `dist` 目录部署到任何静态文件服务器。

### 服务器部署

```bash
# 安装PM2 (推荐)
npm install -g pm2

# 启动应用
pm2 start server.js --name canvas-demo
```

## 贡献指南

请查看 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解如何参与项目开发。

## 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](./LICENSE) 文件了解详情。

## 更新日志

查看 [CHANGELOG.md](./CHANGELOG.md) 了解版本更新历史。

## 支持

如有问题或建议，请提交 Issue 或联系开发团队。
