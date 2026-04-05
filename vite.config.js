const { defineConfig } = require('vite');

module.exports = defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }
          if (id.includes('bootstrap') || id.includes('@popperjs/core')) {
            return 'bootstrap-vendor';
          }
          if (id.includes('markdown-it')) {
            return 'markdown-vendor';
          }
          if (id.includes('@xterm/')) {
            return 'terminal-vendor';
          }
          if (id.includes('@huggingface/transformers')) {
            return 'transformers.web';
          }
          return undefined;
        },
      },
    },
  },
  worker: {
    format: 'es',
  },
});
