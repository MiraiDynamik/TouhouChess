import {defineConfig} from 'vite';
import {svelte} from '@sveltejs/vite-plugin-svelte';
import tailwind from '@tailwindcss/vite';
export default defineConfig({
  root:'web', base:'./', plugins:[svelte(),tailwind()],
  server:{host:'127.0.0.1'},
  build:{outDir:'dist',emptyOutDir:true,cssCodeSplit:false,
    rollupOptions:{output:{inlineDynamicImports:true}}},
});
