import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure convex directory is properly transpiled
  transpilePackages: ["convex"],
  
  // Turbopack config (Next.js 16 default)
  turbopack: {
    resolveAlias: {
      // Handle .js imports that should resolve to .ts files
    },
    resolveExtensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
  },
};

export default nextConfig;
