import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Single-file build so the prototype can be shared as one HTML page.
export default defineConfig({
  plugins: [viteSingleFile()],
});
