import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  base: '/', 
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    allowedHosts: ['liquora.cn']
  },
  build: {
    chunkSizeWarningLimit: 2000, // 放宽限制
    rollupOptions: {
      output: {
        manualChunks: undefined // 禁用chunk分割，确保React正常工作
      },
    },
  },
  resolve: {
    alias: {
      'react': 'react',
      'react-dom': 'react-dom'
    },
    dedupe: ['react', 'react-dom']
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react/jsx-runtime']
  },
  define: {
    'process.env.NODE_ENV': '"production"'
  },
})
