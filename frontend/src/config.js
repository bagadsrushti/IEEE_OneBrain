const normalizeUrl = (url) => {
  if (!url) return null;
  return url.trim().replace(/\/+$/, '');
};

export const getBackendUrl = () => {
  let url = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_BACKEND_URL;
  url = normalizeUrl(url);
  
  if (url) return url;
  
  // Fallback to origin ONLY if in dev mode or localhost
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (import.meta.env.DEV || isLocalhost) {
    return `http://${window.location.hostname}:3001`;
  }
  
  return null; // Signals missing config in prod
};

export const getPublicUrl = () => {
  let url = import.meta.env.VITE_PUBLIC_URL;
  url = normalizeUrl(url);
  
  if (url) return url;
  
  return window.location.origin;
};
