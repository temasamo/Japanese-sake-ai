/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    domains: [
      "thumbnail.image.rakuten.co.jp",
      "image.rakuten.co.jp",
      "item-shopping.c.yimg.jp",
      "shopping.c.yimg.jp",
    ],
  },
};
module.exports = nextConfig;
