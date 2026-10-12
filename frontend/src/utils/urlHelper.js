/**
 * Get the public-facing URL for invite links
 * NEVER use window.location.origin for invites - it breaks behind reverse proxies
 * Always use VITE_PUBLIC_URL env variable or configured public URL
 */
export function getPublicUrl() {
  // Priority 1: Use environment variable if set
  if (import.meta.env.VITE_PUBLIC_URL) {
    return import.meta.env.VITE_PUBLIC_URL.replace(/\/+$/, ''); // Remove trailing slashes
  }
  
  return '';
}

/**
 * Get the backend URL for API/socket connections
 */
export function getBackendUrl() {
  return import.meta.env.VITE_SOCKET_URL?.replace(/\/+$/, '') || null;
}
