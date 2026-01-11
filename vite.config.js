import { defineConfig } from 'vite';
import webExtension from 'vite-plugin-web-extension';

export default defineConfig({
  plugins: [
    webExtension({
      manifest: 'manifest.json',
      watchFilePaths: ['src/**/*'],
    }),
  ],
  build: {
    outDir: 'dist',
    emptyDirFirst: true,
    sourcemap: process.env.NODE_ENV === 'development',
  },
});
