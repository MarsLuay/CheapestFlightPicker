export function isStaticSiteModeEnabled(): boolean {
  if (import.meta.env.VITE_STATIC_SITE_MODE === "true") {
    return true;
  }

  if (typeof window === "undefined") {
    return false;
  }

  return window.location.hostname.endsWith(".github.io");
}
