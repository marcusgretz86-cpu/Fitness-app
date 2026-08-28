import netlifyIdentity from "netlify-identity-widget";

// Netlify Identity ships its own hosted login/signup modal (email confirm,
// password reset, the works) -- we don't build our own form, we just open
// their widget. It needs to know which site it belongs to; when this app is
// actually deployed on Netlify, identity auto-detects the site from the
// domain, so no config is needed in production. VITE_NETLIFY_IDENTITY_URL is
// only for local dev (npm run dev), where there's no Netlify domain to
// auto-detect from -- see .env.example.
const identityUrl = import.meta.env.VITE_NETLIFY_IDENTITY_URL;

export const identityConfigured = true; // widget works even without an explicit URL once deployed on Netlify

let initialized = false;
export function initIdentity() {
  if (initialized) return;
  initialized = true;
  netlifyIdentity.init(identityUrl ? { APIUrl: `${identityUrl}/.netlify/identity` } : undefined);
}

export function openLogin() {
  initIdentity();
  netlifyIdentity.open("login");
}
export function openSignup() {
  initIdentity();
  netlifyIdentity.open("signup");
}
export function logout() {
  return netlifyIdentity.logout();
}
export function getCurrentUser() {
  initIdentity();
  return netlifyIdentity.currentUser();
}
export function onAuthChange(onLogin, onLogout) {
  initIdentity();
  netlifyIdentity.on("login", onLogin);
  netlifyIdentity.on("logout", onLogout);
  return () => {
    netlifyIdentity.off("login", onLogin);
    netlifyIdentity.off("logout", onLogout);
  };
}

/** The JWT to send with every request to our Netlify Functions, so they know
 * who's asking. Netlify Identity keeps this fresh/refreshed automatically. */
export function getAuthToken() {
  const user = getCurrentUser();
  return user ? user.token.access_token : null;
}
