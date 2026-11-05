import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    port: 5173,
    // 后端还是原生版的 node src/server.js（默认 7788），这里只做代理，
    // 所以 Vue 版不需要重写任何接口逻辑
    proxy: {
      '/api': { target: 'http://127.0.0.1:7788', changeOrigin: true },
    },
  },
});
