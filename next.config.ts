import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // embedded Postgres ships WASM files; keep it out of the server bundle
  serverExternalPackages: ["@electric-sql/pglite"],
  partialPrefetching: true,
  // The whole app sits behind the staff login and renders in the browser,
  // so automatic instant-navigation checks don't apply.
  experimental: {
    // a shop's existing stock sheet can run to thousands of rows (Vercel caps requests at 4.5 MB)
    serverActions: { bodySizeLimit: "4mb" },
    instantInsights: {
      validationLevel: "manual-warning",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
