import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
