import axios from 'axios';

export const TOKEN_KEY = 'echargefind_token';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api',
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ---- Session ended -------------------------------------------------------------------------
// A 401 (token expired, or the account is gone) or a 403 "suspended" on a signed-in call means
// the session is over. The AuthProvider registers a handler that signs the user out and shows why.
let sessionEndHandler = null;
export function setSessionEndHandler(handler) {
  sessionEndHandler = handler;
}

const AUTH_URLS = ['/auth/login', '/auth/signup']; // a wrong password here is just a failed login

function sessionEndReason(error) {
  const status = error.response?.status;
  if (!localStorage.getItem(TOKEN_KEY)) return null;
  if (AUTH_URLS.some((url) => error.config?.url === url)) return null;
  if (status === 401) return 'expired';
  if (status === 403 && /suspended/i.test(error.response?.data?.error || '')) return 'suspended';
  return null;
}

// ---- Server waking up ----------------------------------------------------------------------
// The free API host sleeps when idle and takes up to a minute to answer the first request. While
// that happens the app says so instead of failing silently, and quietly retries reads.
export const retryPolicy = { retries: 2, delayMs: 2500 };
export const SERVER_UNREACHABLE = 'api:unreachable';
export const SERVER_REACHABLE = 'api:reachable';

const isServerUnreachable = (error) => !error.response || [502, 503, 504].includes(error.response.status);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

client.interceptors.response.use(
  (response) => {
    window.dispatchEvent(new Event(SERVER_REACHABLE));
    return response;
  },
  async (error) => {
    if (isServerUnreachable(error)) {
      window.dispatchEvent(new Event(SERVER_UNREACHABLE));
      const config = error.config;
      // Only reads are retried: repeating a booking or a suspension is not safe.
      if (config && config.method === 'get' && (config.retryCount || 0) < retryPolicy.retries) {
        config.retryCount = (config.retryCount || 0) + 1;
        await sleep(retryPolicy.delayMs);
        return client(config);
      }
      return Promise.reject(error);
    }

    window.dispatchEvent(new Event(SERVER_REACHABLE)); // it answered, so it is awake
    const reason = sessionEndReason(error);
    if (reason && sessionEndHandler) sessionEndHandler(reason);
    return Promise.reject(error);
  }
);

export default client;
