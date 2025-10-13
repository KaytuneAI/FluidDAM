# FluidDAM 生产环境服务器管理脚本

## 📁 文件说明

### 🔧 分离管理脚本（推荐）
- `start_nginx.bat` - 只启动 Nginx
- `stop_nginx.bat` - 只停止 Nginx
- `start_fluidDAM.bat` - 只启动 FluidDAM
- `stop_fluidDAM.bat` - 只停止 FluidDAM
- `restart_fluidDAM.bat` - 重启 FluidDAM（简化可靠版本）

### 🔄 统一管理脚本（备用）
- `startup.bat` - 同时启动 Nginx + FluidDAM
- `stop_all.bat` - 同时停止 Nginx + FluidDAM

## 🚀 生产环境最佳实践

### 推荐工作流程
```bash
# 1. 启动基础设施（通常只需要一次）
start_nginx.bat

# 2. 启动应用（可以频繁操作）
start_fluidDAM.bat

# 3. 应用更新时重启
restart_fluidDAM.bat

# 4. 停止应用（保持Nginx运行）
stop_fluidDAM.bat
```

### 运维场景
- **服务器重启后**：`start_nginx.bat` → `start_fluidDAM.bat`
- **代码更新**：`restart_fluidDAM.bat`
- **应用调试**：`stop_fluidDAM.bat` → `start_fluidDAM.bat`
- **完全停机**：`stop_fluidDAM.bat` → `stop_nginx.bat`

## ⚙️ 配置要求

- ✅ Nginx 安装在 `C:\nginx-1.28.0`
- ✅ FluidDAM 项目在 `C:\FluidDAM`
- ✅ nginx.conf 配置正确
- ✅ 端口 3001 和 Nginx 端口可用

## 💡 生产环境建议

### 为什么分离管理？
1. **Nginx 7x24 运行** - 作为Web服务器基础设施
2. **FluidDAM 频繁重启** - 代码更新、调试等
3. **故障隔离** - 一个服务出问题不影响另一个
4. **运维灵活性** - 独立维护各个服务

### 典型运维流程
- **日常维护**：只操作 FluidDAM
- **系统维护**：操作 Nginx
- **紧急情况**：使用 `stop_all.bat` 快速停机
