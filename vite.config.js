import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    allowedHosts: ['liquora.cn']
  },
  build: {
    chunkSizeWarningLimit: 1500, // 临时放宽限制
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('tldraw')) return 'vendor-tldraw'
            if (id.includes('xlsx') || id.includes('exceljs')) return 'vendor-excel'
            if (id.includes('react') || id.includes('react-dom') || id.includes('scheduler')) return 'vendor-react'
            return 'vendor'
          }
          if (id.includes('/src/utils/')) return 'utils'
        },
      },
    },
  },
  resolve: {
    alias: {
      'react': 'react',
      'react-dom': 'react-dom'
    }
  },
})
