/**
 * The UI is compiled to static files (`npm run build` → `out/`) that the
 * Django backend serves. During development `npm run dev` proxies `/api/*`
 * to Django (DJANGO_URL, default http://localhost:8000).
 *
 * @type {import('next').NextConfig}
 */
const isDev = process.env.NODE_ENV !== 'production';
const djangoUrl = (process.env.DJANGO_URL || 'http://localhost:8000').replace(/\/+$/, '');

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  ...(isDev
    ? {
        async rewrites() {
          return [{ source: '/api/:path*', destination: `${djangoUrl}/api/:path*` }];
        },
      }
    : { output: 'export' }),
};

module.exports = nextConfig;
