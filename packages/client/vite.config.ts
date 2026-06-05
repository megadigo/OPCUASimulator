import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';
import { resolve } from 'path';

function getServerPort(): number {
  try {
    const cfg = JSON.parse(readFileSync(resolve(__dirname, '../server/config.json'), 'utf-8'));
    return Number(cfg.port) || 3000;
  } catch {
    return 3000;
  }
}

const serverPort = getServerPort();

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${serverPort}`,
        changeOrigin: true,
      },
      '/socket.io': {
        target: `http://localhost:${serverPort}`,
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
