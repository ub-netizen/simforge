/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages serves a project site from https://<user>.github.io/simforge/,
// so every asset URL must be prefixed with the repository name. The same base
// is used in development so path bugs show up locally, not after deployment.
export default defineConfig({
  base: '/simforge/',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
