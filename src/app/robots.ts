import type { MetadataRoute } from "next";

/**
 * Demo-era robots: block everything. Flip `disallow: "/"` → `"/private"`
 * or remove the block entirely once we're ready for SEO.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
