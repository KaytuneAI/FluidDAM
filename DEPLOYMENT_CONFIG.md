# 云端部署配置说明

## 问题描述
当应用部署到云端时，硬编码的 `localhost:3001` API地址无法访问，导致保存画布功能失败。

## 解决方案
已修复的问题：
1. ✅ 创建了动态API端点检测
2. ✅ 添加了API不可用时的localStorage回退机制
3. ✅ 统一了API调用逻辑

## 配置说明

### 1. API端点配置
在 `src/utils/apiUtils.js` 中的 `getApiBaseUrl()` 函数：

```javascript
export function getApiBaseUrl() {
  // 开发环境
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:3001';
  }
  
  // 生产环境 - 请根据您的实际部署情况修改
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  
  // 选项1: 同域名不同端口
  return `${protocol}//${hostname}:3001`;
  
  // 选项2: 子域名
  // return `${protocol}//api.${hostname}`;
  
  // 选项3: 完全不同的域名
  // return 'https://your-api-domain.com';
}
```

### 2. 根据您的部署情况选择配置

#### 情况A: 后端API部署在同一服务器的不同端口
```javascript
return `${protocol}//${hostname}:3001`;
```

#### 情况B: 后端API部署在子域名
```javascript
return `${protocol}//api.${hostname}`;
```

#### 情况C: 后端API部署在完全不同的域名
```javascript
return 'https://your-api-domain.com';
```

#### 情况D: 使用环境变量（推荐）
```javascript
// 在构建时设置环境变量
const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001';
return apiUrl;
```

### 3. 环境变量配置（推荐方案）

1. 在项目根目录创建 `.env` 文件：
```env
REACT_APP_API_URL=http://localhost:3001
```

2. 在生产环境设置：
```env
REACT_APP_API_URL=https://your-api-domain.com
```

3. 修改 `apiUtils.js`：
```javascript
export function getApiBaseUrl() {
  return process.env.REACT_APP_API_URL || 'http://localhost:3001';
}
```

## 功能特性

### 自动回退机制
- 当API不可用时，自动使用localStorage保存数据
- 保存画布功能不会因为API问题而失败
- 用户体验不受影响

### 错误处理
- 静默处理API连接错误
- 在控制台输出警告信息便于调试
- 不会中断用户操作

## 测试建议

1. **本地测试**：确保localhost:3001正常工作
2. **云端测试**：检查API端点是否正确
3. **离线测试**：断开网络，确保localStorage回退正常工作

## 注意事项

1. 确保您的后端API服务器支持CORS
2. 如果使用HTTPS，确保API也使用HTTPS
3. 检查防火墙设置，确保3001端口可访问
4. 考虑使用CDN或负载均衡器

## 常见问题

### Q: 仍然出现连接错误？
A: 检查 `getApiBaseUrl()` 函数返回的URL是否正确

### Q: localStorage数据丢失？
A: 这是正常的，localStorage是浏览器本地存储，不同设备/浏览器间不共享

### Q: 如何查看API调用状态？
A: 打开浏览器开发者工具的Network标签页查看API请求
