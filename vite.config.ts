import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          editor: ['@uiw/react-codemirror', '@codemirror/lang-javascript', '@codemirror/language', '@codemirror/state', '@codemirror/view'],
          motion: ['framer-motion'],
        },
      },
    },
  },
});
