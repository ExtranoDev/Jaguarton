import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { homeFor } from '../utils/roles.js';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const user = await login(form);
      navigate(homeFor(user));
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid email or password.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout mode="login">
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-6">
        <div>
          <h2 className="font-display text-xl font-semibold text-ink">Welcome back</h2>
          <p className="mt-1 text-sm text-ink-2">Log in to find and book a charging slot.</p>
        </div>

        {error && <p className="rounded-lg bg-terracotta-tint px-3 py-2 text-sm text-terracotta">{error}</p>}

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-[13px] font-semibold text-ink-2">
              Email address
            </label>
            <input
              id="email"
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="rounded-lg border border-border px-3.5 py-3 text-sm text-ink"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-[13px] font-semibold text-ink-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="rounded-lg border border-border px-3.5 py-3 text-sm text-ink"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-volt py-3.5 text-[15px] font-bold text-volt-ink shadow-glow-volt disabled:opacity-60"
        >
          {submitting ? 'Logging in…' : 'Log in →'}
        </button>
      </form>
    </AuthLayout>
  );
}
