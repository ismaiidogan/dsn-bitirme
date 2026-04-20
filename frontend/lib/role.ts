export type RolePreference = "consumer" | "provider" | "both";

const ROLE_KEY = "dsn_role";
export const ROLE_CHANGED_EVENT = "dsn:role-changed";

export function getRolePreference(): RolePreference | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(ROLE_KEY);
  if (raw === "consumer" || raw === "provider" || raw === "both") {
    return raw;
  }
  return null;
}

export function setRolePreference(role: RolePreference) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ROLE_KEY, role);
  window.dispatchEvent(new CustomEvent(ROLE_CHANGED_EVENT, { detail: { role } }));
}

export function getRoleHomePath(role: RolePreference | null): string {
  if (role === "provider") return "/agent";
  // consumer veya both için dosya odaklı giriş noktası
  return "/dashboard";
}

