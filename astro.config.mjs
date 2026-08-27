// @ts-check
import { defineConfig } from 'astro/config';

import svelte from '@astrojs/svelte';

// https://astro.build/config
export default defineConfig({
  site: 'https://in.ubucon.org',
  base: '/attendee/',
  outDir: './dist/attendee',
  integrations: [svelte()],
  vite: {
    css: {
      preprocessorOptions: {
        scss: {
          // vanilla still depends on old ways including @import
          quietDeps: true,
          silenceDeprecations: ['import', 'global-builtin', 'if-function']
        }
      }
    }
  }
});
