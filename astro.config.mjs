import { defineConfig } from 'astro/config';

export default defineConfig({
  site: process.env.SITE_URL ?? 'https://saltymanga.com',
  output: 'static',
  trailingSlash: 'always',
  image: {
    remotePatterns: [
      { protocol: 'https', hostname: 's4.anilist.co' }
    ]
  }
});
