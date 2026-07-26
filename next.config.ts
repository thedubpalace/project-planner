import type { NextConfig } from "next";

const basePath = "/project";

const nextConfig: NextConfig = {
  /* config options here */
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  allowedDevOrigins: ["192.168.1.37", "pulsenprompt.duckdns.org"],
};

export default nextConfig;
