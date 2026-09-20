import { setupServer } from 'msw/node';

export const API = 'http://api.test/api';
export const server = setupServer();

export function signInAs(user) {
  localStorage.setItem('echargefind_token', 'test-token');
  return user;
}
