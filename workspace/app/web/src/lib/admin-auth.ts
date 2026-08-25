const adminTokenWindowKey = "__ADMIN_TOKEN__";

type AdminTokenWindow = Window & {
  __ADMIN_TOKEN__?: string;
};

export function getAdminAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") {
    return {};
  }

  const token = (window as AdminTokenWindow)[adminTokenWindowKey]?.trim();
  return token ? { "x-admin-key": token } : {};
}
