/** @type {import('next').NextConfig} */
const nextConfig = {
  // Backend-only API mode
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  // API routes only - no pages
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: '/api/:path*',
      },
    ]
  },
}

export default nextConfig