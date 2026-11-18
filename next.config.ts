import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "s4.anilist.co" }],
  },
  // The old card arena was removed (it will be rebuilt as a new game).
  async redirects() {
    return [
      { source: "/arena", destination: "/games", permanent: false },
      { source: "/arena/:code", destination: "/games", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
