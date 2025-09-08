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
app.use(express.json())
app.use(express.static('public'))

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



app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`)
})
