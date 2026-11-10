import type { MetadataRoute } from "next";

/** Lets staff "Add to Home screen" so the app opens full-screen like a normal phone app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "S.A Computers Stock",
    short_name: "S.A Stock",
    description: "Stock, checking and sales for S.A Computers, RT Nagar.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#eef2f0",
    theme_color: "#0a3d34",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
