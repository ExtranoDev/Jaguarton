import { useState } from 'react';
import Navbar from '../components/Navbar.jsx';
import PasswordInput from '../components/PasswordInput.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { changePassword } from '../api/auth.js';
import { useAuth } from '../context/AuthContext.jsx';

const MIN_PASSWORD_LENGTH = 8;
const inputClass = 'rounded-lg border border-border px-3.5 py-3 text-sm text-ink';
const errorMessage = (err, fallback) => err.response?.data?.error || fallback;

function Field({ id, label, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold text-ink-2">
        {label}
      </label>
      {children}
    </div>
  );
}

function ProfileCard() {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState(user.name);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const changed = name.trim() !== user.name;

  async function save(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const updated = await updateProfile({ name: name.trim() });
      setName(updated.name);
      setMessage('Your name has been updated.');
    } catch (err) {
      setError(errorMessage(err, 'Could not update your name.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
      <h2 className="font-display text-lg font-semibold text-ink">Profile</h2>
      <Field id="account-name" label="Name">
        <input id="account-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-ink-2">Email</span>
        <span className="break-all text-sm text-ink">{user.email}</span>
        <span className="text-xs text-ink-2">Your email is your login. An administrator can change it.</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold text-ink-2">Role</span>
        <StatusBadge status={user.role} />
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-terracotta-tint px-3 py-2 text-sm text-terracotta">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm font-semibold text-green-dark">
          {message}
        </p>
      )}
      <button
        type="submit"
        disabled={!changed || !name.trim() || saving}
        className="self-start rounded-lg bg-green px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save name'}
      </button>
    </form>
  );
}

function PasswordCard() {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  async function save(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (form.next.length < MIN_PASSWORD_LENGTH) {
      setError(`Your new password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (form.next !== form.confirm) {
      setError('The new password and its confirmation do not match.');
      return;
    }
    setSaving(true);
    try {
      await changePassword({ currentPassword: form.current, newPassword: form.next });
      setForm({ current: '', next: '', confirm: '' });
      setMessage('Your password has been changed.');
    } catch (err) {
      setError(errorMessage(err, 'Could not change your password.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
      <h2 className="font-display text-lg font-semibold text-ink">Change password</h2>
      <Field id="current-password" label="Current password">
        <PasswordInput id="current-password" label="current password" autoComplete="current-password" value={form.current} onChange={set('current')} className={inputClass} />
      </Field>
      <Field id="new-password" label="New password">
        <PasswordInput id="new-password" label="new password" autoComplete="new-password" value={form.next} onChange={set('next')} className={inputClass} />
        <span className="text-xs text-ink-2">At least {MIN_PASSWORD_LENGTH} characters.</span>
      </Field>
      <Field id="confirm-password" label="Confirm new password">
        <PasswordInput id="confirm-password" label="password confirmation" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} className={inputClass} />
      </Field>
      {error && (
        <p role="alert" className="rounded-lg bg-terracotta-tint px-3 py-2 text-sm text-terracotta">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm font-semibold text-green-dark">
          {message}
        </p>
      )}
      <button
        type="submit"
        disabled={!form.current || !form.next || !form.confirm || saving}
        className="self-start rounded-lg bg-green px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {saving ? 'Changing…' : 'Change password'}
      </button>
    </form>
  );
}

export default function AccountPage() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-paper">
      <Navbar />
      <div className="flex-grow overflow-y-auto">
        <div className="mx-auto flex max-w-[640px] flex-col gap-5 px-4 pb-10 pt-6 sm:px-8">
          <h1 className="font-display text-[26px] font-bold text-ink">Account</h1>
          <ProfileCard />
          <PasswordCard />
        </div>
      </div>
    </div>
  );
}
