export function publicSiteUrl(): URL {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configuredUrl !== undefined && configuredUrl.length > 0) return new URL(configuredUrl);
  const vercelProductionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProductionHost !== undefined && vercelProductionHost.length > 0) return new URL(`https://${vercelProductionHost}`);
  return new URL("http://localhost:3000");
}
