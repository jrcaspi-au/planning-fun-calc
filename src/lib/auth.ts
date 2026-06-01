const KEY = "fc_auth_v1";
const EMAIL = "jacques.caspi@artifactuprising.com";
const PASSWORD = "calculatethis";

export const isAuthenticated = () => {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY) === "1";
};

export const login = (email: string, password: string) => {
  if (email.trim().toLowerCase() === EMAIL && password === PASSWORD) {
    window.localStorage.setItem(KEY, "1");
    return true;
  }
  return false;
};

export const logout = () => {
  window.localStorage.removeItem(KEY);
};
