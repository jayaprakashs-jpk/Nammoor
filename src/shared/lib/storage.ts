// localStorage can throw (private mode, blocked storage). Never let that crash the app.
export function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

const FAMILY_KEY = "nammoor.family";
export const getCurrentFamilyId = () => readLocal(FAMILY_KEY);
export const setCurrentFamilyId = (id: string | null) => writeLocal(FAMILY_KEY, id);
