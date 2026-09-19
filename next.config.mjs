/** @type {import('next').NextConfig} */
const nextConfig = {
  // Single-container deploy behind the Phase 0 tunnel, same posture as the
  // other demo apps (see C:\dev\DEMOS_RUNNING_HANDOFF.md).
  output: "standalone",
  experimental: {
    // Defence in depth for D-017: if middleware ever runs on a request with
    // a body again, Next buffers at most this much of it (default 10 MB).
    // The /api/ routes are excluded from middleware and cap their own bodies
    // (32 KB at most), so nothing legitimate comes near this.
    middlewareClientMaxBodySize: "64kb",
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
