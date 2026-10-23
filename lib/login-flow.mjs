export const DASHBOARD_PATH = '/?screen=dashboard';

// Resume only an internal workspace. Never loop back into email sign-in,
// hosting authentication, or the legacy welcome screen.
export function safeContinuePath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return DASHBOARD_PATH;
  try {
    const url = new URL(value, 'https://somas.local');
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (url.origin !== 'https://somas.local' || path==='/api'||path.startsWith('/api/')||['/signin-with-chatgpt', '/signout-with-chatgpt', '/callback'].includes(path)) return DASHBOARD_PATH;
    if (path === '/' && (url.searchParams.has('welcome') || ['login','signup'].includes(url.searchParams.get('screen')) || !url.search)) return DASHBOARD_PATH;
    return url.pathname + url.search + url.hash;
  } catch {
    return DASHBOARD_PATH;
  }
}

export function welcomePath(returnTo = DASHBOARD_PATH) {
  return '/?welcome=1&next=' + encodeURIComponent(safeContinuePath(returnTo));
}

export function signInPath(returnTo = DASHBOARD_PATH) {
  return '/?screen=login&next=' + encodeURIComponent(safeContinuePath(returnTo));
}

// Keep the hosting identity flow available for existing owner setup/recovery.
export function legacySignInPath(returnTo = DASHBOARD_PATH) {
  return '/signin-with-chatgpt?return_to=' + encodeURIComponent(welcomePath(returnTo));
}
