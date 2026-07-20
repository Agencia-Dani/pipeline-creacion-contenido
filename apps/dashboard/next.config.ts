import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sin esto, Turbopack infiere la raíz del workspace por lockfiles fuera del repo.
  turbopack: { root: __dirname },
};

export default nextConfig;
