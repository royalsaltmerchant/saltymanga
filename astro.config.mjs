import { defineConfig } from 'astro/config';

export default defineConfig({
  site: process.env.SITE_URL ?? 'https://saltymanga.com',
  output: 'static',
  trailingSlash: 'always'
});
