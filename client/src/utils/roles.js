// Where each kind of account lands after logging in, or after wandering onto a page
// that isn't theirs.
export function homeFor(user) {
  if (user?.role === 'admin') return '/admin';
  if (user?.role === 'operator') return '/operator';
  return '/';
}

export const ROLE_LABELS = { driver: 'Driver', operator: 'Operator', admin: 'Admin' };
