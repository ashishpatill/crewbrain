import { useEffect, useState } from "react";

export const TENANT_KEY = "crewbrain-tenant";
export const TENANT_EVENT = "crewbrain-tenant-change";

export function getStoredTenant(): string {
  try {
    return localStorage.getItem(TENANT_KEY) || "acme";
  } catch {
    return "acme";
  }
}

export function setStoredTenant(t: string): void {
  try {
    localStorage.setItem(TENANT_KEY, t);
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(TENANT_EVENT, { detail: t }));
  }
}

export function useTenant(): [string, (t: string) => void] {
  const [tenant, setTenantState] = useState<string>("acme");

  useEffect(() => {
    const read = () => setTenantState(getStoredTenant());
    read();

    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setTenantState(typeof detail === "string" ? detail : getStoredTenant());
    };
    const storageHandler = (e: StorageEvent) => {
      if (e.key === TENANT_KEY) read();
    };

    window.addEventListener(TENANT_EVENT, handler);
    window.addEventListener("storage", storageHandler);
    return () => {
      window.removeEventListener(TENANT_EVENT, handler);
      window.removeEventListener("storage", storageHandler);
    };
  }, []);

  const setTenant = (t: string) => {
    setStoredTenant(t);
    setTenantState(t);
  };

  return [tenant, setTenant];
}