import client, { TOKEN_KEY } from './client';

export async function signup({ name, email, password, role }) {
  const { data } = await client.post('/auth/signup', { name, email, password, role });
  return data;
}

export async function login({ email, password }) {
  const { data } = await client.post('/auth/login', { email, password });
  return data;
}

export async function fetchMe() {
  const { data } = await client.get('/auth/me');
  return data.user;
}

export async function updateProfile({ name }) {
  const { data } = await client.patch('/auth/me', { name });
  return data.user;
}

// Changing the password signs out every other session. The API sends back a fresh token so this
// one stays signed in; without storing it, the next request would count as a session that ended.
export async function changePassword({ currentPassword, newPassword }) {
  const { data } = await client.post('/auth/change-password', { currentPassword, newPassword });
  if (data.token) localStorage.setItem(TOKEN_KEY, data.token);
  return data;
}
