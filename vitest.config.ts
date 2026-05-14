import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@app': path.resolve(__dirname, './src/app'),
      '@shared': path.resolve(__dirname, './src/shared'),
      '@kernel': path.resolve(__dirname, './src/kernel'),
      '@features': path.resolve(__dirname, './src/features'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/shared/lib/test/setup.ts',
    css: true,
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/shared/lib/test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/index.ts',
      ],
    },
  },
});
