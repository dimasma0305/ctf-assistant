/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable experimental features for better performance
  experimental: {
    // Enable server actions
    serverActions: true,
  },
  
  // Image optimization
  images: {
    domains: [
      'localhost',
      // Add your production domains here
    ],
    unoptimized: true,
  },
  
  // ESLint configuration
  eslint: {
    ignoreDuringBuilds: true,
  },
  
  // TypeScript configuration
  typescript: {
    ignoreBuildErrors: true,
  },
  
  // No longer need to proxy API calls to external backend
}

export default nextConfig
