import { defineConfig } from 'astro/config';

export default defineConfig({
  site: process.env.SITE_URL ?? 'https://saltymanga.netlify.app',
  output: 'static',
  trailingSlash: 'always'
});
