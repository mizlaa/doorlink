/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['three'],
  poweredByHeader: false,
  experimental: { optimizePackageImports: ['framer-motion', '@react-three/drei'] },
};
export default nextConfig;
