import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Plately",
    short_name: "Plately",
    description: "Take home the food you love.",
    start_url: "/",
    display: "standalone",
    background_color: "#FAFAF7",
    theme_color: "#FAFAF7",
    orientation: "portrait",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
