import type { MetadataRoute } from "next";

import { publicSiteUrl } from "../lib/site-url";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = publicSiteUrl();
  return ["/", "/method", "/privacy", "/terms"].map((pathname) => ({
    changeFrequency: pathname === "/" ? "weekly" : "monthly",
    priority: pathname === "/" ? 1 : 0.4,
    url: new URL(pathname, baseUrl).href
  }));
}
