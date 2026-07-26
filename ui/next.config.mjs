/** @type {import('next').NextConfig} */
const nextConfig = {
  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
      },
    ],
    unoptimized: true,
  },

  // Keep Turbopack scoped to this app when the repository has multiple lockfiles.
  turbopack: {
    root: process.cwd(),
  },

  // No longer need to proxy API calls to external backend
}

export default nextConfig
