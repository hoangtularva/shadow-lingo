// Static export for GitHub Pages: the site lives at https://hoangtularva.github.io/shadow-lingo/.
/** @type {import('next').NextConfig} */
const config = {
  output: 'export',
  basePath: '/shadow-lingo',
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
};

export default config;
