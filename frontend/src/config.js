const normalizeUrl = (url) => {
  if (!url) return null;
  return url.trim().replace(/\/+$/, '');
};

export const getBackendUrl = () => {
  let url = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_BACKEND_URL;
  url = normalizeUrl(url);
  
  if (url) {
    // A localhost URL in a Vite env file refers to the visitor's computer.
    // When the dev site is opened from another device on the LAN, point its
    // API/socket requests at the machine serving the frontend instead.
    if (import.meta.env.DEV) {
      try {
        const configuredUrl = new URL(url);
        const configuredHost = configuredUrl.hostname.toLowerCase();
        const browserHost = window.location.hostname;
        const configuredAsLoopback = ['localhost', '127.0.0.1', '::1'].includes(configuredHost);
        const browserIsLoopback = ['localhost', '127.0.0.1', '::1'].includes(browserHost.toLowerCase());

        if (configuredAsLoopback && !browserIsLoopback) {
          configuredUrl.hostname = browserHost;
          return normalizeUrl(configuredUrl.toString());
        }
      } catch {
        // Keep the configured value so the caller can surface the connection error.
      }
    }

    return url;
  }
  
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
  
  return '';
};
