import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/api': {
        // BACK_URL permet de viser une autre instance du back (par défaut le port 8080).
        target: process.env.BACK_URL || 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
});
