/** @type {import('next').NextConfig} */
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const nextConfig = {
  // Backend-only API mode
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  // Avoid 404s when host redirects /api/stats to /api/stats/ (or vice versa)
  trailingSlash: false,
  // Fix Turbopack root directory issue
  turbopack: {
    root: __dirname,
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