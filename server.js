import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = 3001

// CORS中间件
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization')
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200)
  } else {
    next()
  }
})

// 中间件
app.use(express.json({ limit: '50mb' })) // 增加JSON解析限制到50MB
app.use(express.urlencoded({ limit: '50mb', extended: true })) // 增加URL编码限制
app.use(express.static('public'))

// 创建分享文件夹
const sharesDir = path.join(__dirname, 'public', 'shares')
if (!fs.existsSync(sharesDir)) {
  fs.mkdirSync(sharesDir, { recursive: true })
}

// 分享配置
const SHARE_CONFIG = {
  maxFiles: 100,           // 最多100个分享文件
  maxStorageMB: 200,       // 最多200MB存储
  expireHours: 24,         // 24小时过期
  cleanupInterval: 2 * 60 * 60 * 1000 // 每2小时清理一次
};

// 自动清理过期分享文件
function cleanupExpiredShares() {
  try {
    console.log(`[${new Date().toISOString()}] 开始清理分享文件...`);
    
    const files = fs.readdirSync(sharesDir);
    const now = Date.now();
    const expireTime = SHARE_CONFIG.expireHours * 60 * 60 * 1000;
    
    let totalSize = 0;
    let fileCount = 0;
    let deletedCount = 0;
    
    files.forEach(file => {
      if (file.endsWith('.json')) {
        const filePath = path.join(sharesDir, file);
        const stats = fs.statSync(filePath);
        const fileAge = now - stats.mtime.getTime();
        
        // 检查是否过期
        if (fileAge > expireTime) {
          fs.unlinkSync(filePath);
          deletedCount++;
          console.log(`删除过期分享文件: ${file} (创建于 ${new Date(stats.mtime).toISOString()})`);
          return;
        }
        
        totalSize += stats.size;
        fileCount++;
      }
    });
    
    // 如果超过限制，删除最旧的文件
    if (fileCount > SHARE_CONFIG.maxFiles || totalSize > SHARE_CONFIG.maxStorageMB * 1024 * 1024) {
      console.log(`超过限制，开始删除旧文件 (文件数: ${fileCount}/${SHARE_CONFIG.maxFiles}, 大小: ${(totalSize / 1024 / 1024).toFixed(2)}MB/${SHARE_CONFIG.maxStorageMB}MB)`);
      
      const sortedFiles = files
        .filter(file => file.endsWith('.json'))
        .map(file => ({
          name: file,
          path: path.join(sharesDir, file),
          mtime: fs.statSync(path.join(sharesDir, file)).mtime
        }))
        .sort((a, b) => a.mtime - b.mtime);
      
      // 删除最旧的文件直到满足限制
      for (const file of sortedFiles) {
        if (fileCount <= SHARE_CONFIG.maxFiles && totalSize <= SHARE_CONFIG.maxStorageMB * 1024 * 1024) {
          break;
        }
        
        const stats = fs.statSync(file.path);
        fs.unlinkSync(file.path);
        totalSize -= stats.size;
        fileCount--;
        deletedCount++;
        console.log(`删除旧分享文件: ${file.name} (创建于 ${new Date(stats.mtime).toISOString()})`);
      }
    }
    
    console.log(`分享文件清理完成: 删除了${deletedCount}个文件, 剩余${fileCount}个文件, ${(totalSize / 1024 / 1024).toFixed(2)}MB`);
  } catch (error) {
    console.error('清理分享文件时出错:', error);
  }
}

// 启动时清理一次，然后每24小时清理一次
cleanupExpiredShares();
setInterval(cleanupExpiredShares, SHARE_CONFIG.cleanupInterval);

// 保存图片数据到JSON文件
app.post('/api/save-image-data', (req, res) => {
  try {
    const imageData = req.body
    const databasePath = path.join(__dirname, 'public', 'images-database.json')
    
    // 读取现有数据
    let database = { images: [], lastUpdated: "", totalImages: 0 }
    if (fs.existsSync(databasePath)) {
      const fileContent = fs.readFileSync(databasePath, 'utf8')
      database = JSON.parse(fileContent)
    }
    
    // 添加新图片数据
    database.images.push(imageData)
    database.lastUpdated = new Date().toISOString()
    database.totalImages = database.images.length
    
    // 保存到文件
    fs.writeFileSync(databasePath, JSON.stringify(database, null, 2))
    
    console.log('图片数据已保存到文件:', imageData.fileName)
    res.json({ success: true, message: '数据保存成功', totalImages: database.totalImages })
  } catch (error) {
    console.error('保存数据时出错:', error)
    res.status(500).json({ success: false, message: '保存失败', error: error.message })
  }
})

// 获取所有图片数据
app.get('/api/get-image-data', (req, res) => {
  try {
    const databasePath = path.join(__dirname, 'public', 'images-database.json')
    
    if (fs.existsSync(databasePath)) {
      const fileContent = fs.readFileSync(databasePath, 'utf8')
      const database = JSON.parse(fileContent)
      res.json(database)
    } else {
      res.json({ images: [], lastUpdated: "", totalImages: 0 })
    }
  } catch (error) {
    console.error('读取数据时出错:', error)
    res.status(500).json({ success: false, message: '读取失败', error: error.message })
  }
})

// 分享画布 - 上传画布数据并生成分享链接
app.post('/api/share-canvas', (req, res) => {
  try {
    const canvasData = req.body
    
    // 生成唯一ID
    const shareId = `canvas-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const fileName = `${shareId}.json`
    const filePath = path.join(sharesDir, fileName)
    
    // 添加分享元数据
    const shareData = {
      ...canvasData,
      shareId: shareId,
      sharedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + SHARE_CONFIG.expireHours * 60 * 60 * 1000).toISOString()
    }
    
    // 保存分享文件
    fs.writeFileSync(filePath, JSON.stringify(shareData, null, 2))
    
    // 生成分享链接 - 直接指向前端应用
    const protocol = req.protocol;
    const host = req.get('host');
    
    // 动态获取前端端口，优先从请求头获取，否则使用默认5173
    let frontendPort = '5173';
    const referer = req.get('referer');
    if (referer) {
      try {
        const refererUrl = new URL(referer);
        frontendPort = refererUrl.port || '5173';
      } catch (e) {
        // 如果解析失败，使用默认端口
      }
    }
    
    const frontendHost = host.replace(':3001', `:${frontendPort}`);
    const shareUrl = `${protocol}://${frontendHost}/?share=${shareId}`
    
    console.log('画布分享成功:', shareId, '链接:', shareUrl)
    
    res.json({ 
      success: true, 
      shareId: shareId,
      shareUrl: shareUrl,
      message: '分享成功' 
    })
  } catch (error) {
    console.error('分享画布时出错:', error)
    res.status(500).json({ success: false, message: '分享失败', error: error.message })
  }
})

// 获取分享的画布数据
app.get('/api/get-share/:shareId', (req, res) => {
  try {
    const shareId = req.params.shareId
    const fileName = `${shareId}.json`
    const filePath = path.join(sharesDir, fileName)
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: '分享不存在或已过期' })
    }
    
    // 检查是否过期
    const stats = fs.statSync(filePath)
    const now = Date.now()
    const expireTime = SHARE_CONFIG.expireHours * 60 * 60 * 1000
    
    if (now - stats.mtime.getTime() > expireTime) {
      // 删除过期文件
      fs.unlinkSync(filePath)
      return res.status(404).json({ success: false, message: '分享已过期' })
    }
    
    // 读取分享数据
    const fileContent = fs.readFileSync(filePath, 'utf8')
    const shareData = JSON.parse(fileContent)
    
    res.json({ success: true, data: shareData })
  } catch (error) {
    console.error('获取分享数据时出错:', error)
    res.status(500).json({ success: false, message: '获取分享失败', error: error.message })
  }
})

// 手动清理分享文件 (管理员接口)
app.post('/api/cleanup-shares', (req, res) => {
  try {
    console.log('手动触发分享文件清理...');
    cleanupExpiredShares();
    res.json({ success: true, message: '清理任务已执行' });
  } catch (error) {
    console.error('手动清理失败:', error);
    res.status(500).json({ success: false, message: '清理失败', error: error.message });
  }
});

// 获取分享文件统计信息
app.get('/api/shares-stats', (req, res) => {
  try {
    const files = fs.readdirSync(sharesDir);
    const now = Date.now();
    const expireTime = SHARE_CONFIG.expireHours * 60 * 60 * 1000;
    
    let totalSize = 0;
    let fileCount = 0;
    let expiredCount = 0;
    
    files.forEach(file => {
      if (file.endsWith('.json')) {
        const filePath = path.join(sharesDir, file);
        const stats = fs.statSync(filePath);
        const fileAge = now - stats.mtime.getTime();
        
        if (fileAge > expireTime) {
          expiredCount++;
        } else {
          totalSize += stats.size;
          fileCount++;
        }
      }
    });
    
    res.json({
      success: true,
      stats: {
        totalFiles: fileCount + expiredCount,
        activeFiles: fileCount,
        expiredFiles: expiredCount,
        totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
        maxFiles: SHARE_CONFIG.maxFiles,
        maxSizeMB: SHARE_CONFIG.maxStorageMB,
        expireHours: SHARE_CONFIG.expireHours,
        cleanupIntervalHours: SHARE_CONFIG.cleanupInterval / (60 * 60 * 1000)
      }
    });
  } catch (error) {
    console.error('获取统计信息失败:', error);
    res.status(500).json({ success: false, message: '获取统计信息失败', error: error.message });
  }
});

// 注意：分享链接现在直接指向前端应用，不再需要重定向路由



app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`)
})
