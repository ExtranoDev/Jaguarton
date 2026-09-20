import client from './client';

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
