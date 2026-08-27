/** @type {import('next').NextConfig} */
const nextConfig = {
  // El portal es SOLO por invitacion (founder 27-ago): las afiliadas
  // las crea el admin desde Partners, no se auto-registra nadie. La
  // pantalla de registro se borro; esta redireccion cubre a quien
  // llegue por un link viejo.
  async redirects() {
    return [{ source: '/register', destination: '/login', permanent: false }];
  },
  // Output standalone build for Docker deployments
  output: 'standalone',
  // Enable Turbopack (default in Next.js 16)
  turbopack: {},
  // Keep webpack config for fallback compatibility
  webpack: (config) => {
    config.module.rules.push({
      test: /\.svg$/,
      use: ["@svgr/webpack"]
    });
    return config;
  },
};

module.exports = nextConfig;