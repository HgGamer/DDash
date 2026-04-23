import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
    build: {
      rollupOptions: {
        input: resolve('src/main/index.ts'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
    build: {
      rollupOptions: {
        input: resolve('src/preload/index.ts'),
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve('src/renderer/index.html'),
      },
    },
  },
});
