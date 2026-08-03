// @ts-check
import { defineConfig } from 'astro/config';

import svelte from '@astrojs/svelte';

// https://astro.build/config
export default defineConfig({
  integrations: [svelte()],
  vite: {
    css: {
      preprocessorOptions: {
        scss: {
          // Vanilla Framework uses deprecated Sass @import rules which span the console.
          // This tells the modern Sass compiler to silence warnings coming from node_modules.
          quietDeps: true,
          silenceDeprecations: ['legacy-js-api', 'import', 'global-builtin']
        }
      }
    }
  }
});