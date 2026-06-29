import type { NextConfig } from "next";
import path from "path";

const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(
  /\/$/,
  "",
);

const nextConfig: NextConfig = {
  transpilePackages: ["@sovereign/shared"],
  outputFileTracingRoot: path.join(__dirname, "../.."),
  async rewrites() {
    return [
      { source: "/health", destination: `${apiUrl}/health` },
      { source: "/api/:path*", destination: `${apiUrl}/api/:path*` },
    ];
  },
};

export default nextConfig;
