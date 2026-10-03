import type { NextConfig } from "next";

// Para pruebas en Netlify queda en la raíz (kosma-tracker.netlify.app).
// Si en producción se sirve como wearekosma.com/tracker, definir TRACKER_BASE_PATH=/tracker
const basePath = process.env.TRACKER_BASE_PATH || "";

const nextConfig: NextConfig = {
  basePath: basePath || undefined,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
