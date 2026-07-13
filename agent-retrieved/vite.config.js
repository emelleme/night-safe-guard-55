/** @type {import('vite').UserConfig} */
export default {
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      buffer: 'buffer/'
    }
  },
  build: {
    outDir: './dist/assets',
    assetsDir: '',
    rollupOptions: {
      input: [
        './src/_scripts/polyfills.js',
        './src/_scripts/_main.js',
        './src/_scripts/realityCoinDetail.ts',
        './src/_styles/_main.pcss',
        './src/_styles/coin-detail.pcss',
        './src/_scripts/jupiterTerminal.js',
        './src/_scripts/treedec.js',
        './src/_scripts/octopusGame.js',
        './src/_scripts/onboard/journey.js'
      ],
      output: {
        entryFileNames: `[name].js`,
        chunkFileNames: `[name].js`,
        assetFileNames: `[name].[ext]`
      }
    },
    // Add sourcemaps for better debugging
    sourcemap: true,
    // Ensure proper JSON handling
    json: {
      stringify: true
    },
    // Optimize dependencies
   commonjsOptions: {
      include: [/node_modules/, '@solana/web3.js'],
      transformMixedEsModules: true,
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      // Allow serving files from node_modules
      allow: ['..']
    }
  },
  // Add proper TypeScript handling
  esbuild: {
    target: 'es2020',
    tsconfigRaw: {
      compilerOptions: {
        target: 'es2020',
        module: 'es2020',
        moduleResolution: 'node',
        esModuleInterop: true,
        strict: true
      }
    }
  },
  // Optimize deps
  optimizeDeps: {
    include: [
      'alpinejs',
      'ably',
      'buffer',
      'htmx.org',
      '@solana/web3.js',
      '@solana/wallet-adapter-base',
      '@jup-ag/wallet-adapter',
      '@solana/wallet-adapter-phantom',
      '@solana/wallet-adapter-solflare',
      '@solana/wallet-standard-wallet-adapter-base',
      '@solana-mobile/wallet-standard-mobile',
      '@wallet-standard/app',
      '@solana/spl-token',
      'react',
      'react-dom'
    ],
    exclude: [],
  },
}
