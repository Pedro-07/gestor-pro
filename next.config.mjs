/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      // Caso utilize domínio customizado de CDN do Supabase, você pode adicionar aqui também
    ],
  },
}

export default nextConfig
