import type { MetadataRoute } from "next";

/**
 * Web App Manifest — lets the phone browser offer "Add to Home Screen"
 * and treats the app as a standalone PWA surface. Dark splash matches
 * the rest of the theme.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Stacker · Livewager",
    short_name: "Stacker",
    description:
      "A 30-second arcade skill game with a non-custodial ICRC-1 points wallet.",
    start_url: "/stacker",
    display: "standalone",
    background_color: "#020b18",
    theme_color: "#020b18",
    icons: [
      {
        src: "/assets/stacker-logo.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/assets/stacker-logo.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    orientation: "portrait-primary",
    categories: ["games", "entertainment", "finance"],
  };
}
