import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 개발 서버가 세 백엔드로 요청을 넘겨준다 (CORS 설정 불필요)
//   /proxy/ft   → eTicket 서버 (8080)
//   /proxy/star → 별티켓 서버 (8081)
//   /proxy/moon → 달티켓 서버 (8082)
const backend = (port, prefix) => ({
  target: `http://localhost:${port}`,
  changeOrigin: true,
  rewrite: (path) => path.replace(new RegExp(`^${prefix}`), ''),
})

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/proxy/ft': backend(8080, '/proxy/ft'),
      '/proxy/star': backend(8081, '/proxy/star'),
      '/proxy/moon': backend(8082, '/proxy/moon'),
    },
  },
})
