import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/server.ts'],
  format: 'esm',
  dts: true,
  exports: true,
  external: [
    'better-auth',
    'better-auth/plugins',
    '@playwright/test',
    'zod',
  ],
})
