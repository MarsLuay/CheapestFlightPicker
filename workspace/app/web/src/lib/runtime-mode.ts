export function isHostedApiModeEnabled(): boolean {
  if (import.meta.env.DEV) {
    return false;
  }

  if (import.meta.env.VITE_HOSTED_API_MODE === "true") {
    return true;
  }

  if (typeof window === "undefined") {
    return false;
  }

  const hostname = window.location.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  ) {
    return false;
  }

  return true;
}
