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
  },
  
  // Redirect API calls to backend during development
  async rewrites() {
    if (process.env.NODE_ENV === 'development') {
      return [
        {
          source: '/api/:path*',
          destination: `${process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.assistant.dimasc.tf/'}/api/:path*`,
        },
        {
          source: '/health',
          destination: `${process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.assistant.dimasc.tf/'}/health`,
        },
      ]
    }
    return []
  },
}

export default nextConfig
