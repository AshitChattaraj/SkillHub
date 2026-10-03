// assets/js/api-config.js
// Shared Backend API configuration for User Panel

export const API_BASE_URL =
  (typeof window !== "undefined" && window.SKILLHUB_API_URL) ||
  (typeof window !== "undefined" && (
    !window.location.hostname ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.protocol === "file:"
  ) ? "http://localhost:5000" : "");

export function getApiUrl(endpoint) {
  const base = API_BASE_URL.replace(/\/+$/, "");
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return base ? `${base}${path}` : path;
}
