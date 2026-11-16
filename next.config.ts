import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: [
    "*.loca.lt",
    "*.trycloudflare.com",
    "localhost",
    "127.0.0.1",
  ],
};

export default nextConfig;
