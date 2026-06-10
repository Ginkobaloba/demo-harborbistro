/** @type {import('next').NextConfig} */
const nextConfig = {
  // Single-container deploy behind the Phase 0 tunnel, same posture as the
  // other demo apps (see C:\dev\DEMOS_RUNNING_HANDOFF.md).
  output: "standalone",
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
