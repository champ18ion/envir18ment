import { defineConfig } from 'tsup'
import path from 'path'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  external: ['argon2'],
  noExternal: ['@envir18ment/crypto'],
  bundle: true,
  clean: true,
  esbuildOptions(options) {
    options.alias = {
      '@envir18ment/crypto': path.resolve('../../packages/crypto/src/index.ts'),
      '@envir18ment/types': path.resolve('../../packages/types/src/index.ts'),
    }
  },
})
