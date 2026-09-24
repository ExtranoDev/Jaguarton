import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout.jsx';
import PasswordInput from '../components/PasswordInput.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { homeFor } from '../utils/roles.js';

const MIN_PASSWORD_LENGTH = 8;

export default function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'driver' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const user = await signup(form);
      navigate(homeFor(user));
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout mode="signup">
      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-6">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Create your account</h1>
          <p className="mt-1 text-sm text-ink-2">Join as a driver or a station operator.</p>
        </div>

        {error && <p className="rounded-lg bg-terracotta-tint px-3 py-2 text-sm text-terracotta">{error}</p>}

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="name" className="text-[13px] font-semibold text-ink-2">
              Full name
            </label>
            <input
              id="name"
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="rounded-lg border border-border px-3.5 py-3 text-sm text-ink"
            />
          </div>
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
            <PasswordInput
              id="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              aria-describedby="password-hint"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="rounded-lg border border-border px-3.5 py-3 text-sm text-ink"
            />
            <span id="password-hint" className="text-xs text-ink-2">
              At least {MIN_PASSWORD_LENGTH} characters.
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <span id="role-label" className="text-[13px] font-semibold text-ink-2">
              I am a
            </span>
            <div role="group" aria-labelledby="role-label" className="flex gap-2.5">
              <button
                type="button"
                aria-pressed={form.role === 'driver'}
                onClick={() => setForm({ ...form, role: 'driver' })}
                className={`min-h-10 flex-grow rounded-lg border py-2.5 text-sm font-semibold ${
                  form.role === 'driver'
                    ? 'border-green bg-green text-white'
                    : 'border-border text-ink-2'
                }`}
              >
                <span aria-hidden="true">🚗</span> Driver
              </button>
              <button
                type="button"
                aria-pressed={form.role === 'operator'}
                onClick={() => setForm({ ...form, role: 'operator' })}
                className={`min-h-10 flex-grow rounded-lg border py-2.5 text-sm font-semibold ${
                  form.role === 'operator'
                    ? 'border-green bg-green text-white'
                    : 'border-border text-ink-2'
                }`}
              >
                <span aria-hidden="true">🔌</span> Operator
              </button>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-volt py-3.5 text-[15px] font-bold text-volt-ink shadow-glow-volt disabled:cursor-not-allowed disabled:border-border disabled:bg-sage-tint disabled:text-ink-2 disabled:shadow-none"
        >
          {submitting ? 'Creating account…' : 'Create account →'}
        </button>
      </form>
    </AuthLayout>
  );
}
