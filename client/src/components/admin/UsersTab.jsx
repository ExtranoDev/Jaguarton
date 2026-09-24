import { useState } from 'react';
import { createUser, listUsers, resetUserPassword, setUserActive, updateUser } from '../../api/admin.js';
import { useAuth } from '../../context/AuthContext.jsx';
import StatusBadge from '../StatusBadge.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import DataTable from './DataTable.jsx';
import { EmptyState, ErrorBanner, LoadState, RowButton, fieldClass, wideFieldClass } from './ui.jsx';
import useAdminData, { errorMessage, useDebounced } from './useAdminData.js';

const MIN_PASSWORD_LENGTH = 8;
const ROLES = [
  { value: 'driver', label: 'Driver' },
  { value: 'operator', label: 'Operator' },
  { value: 'admin', label: 'Admin' },
];
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; // no look-alikes
const inputClass = 'w-full rounded-lg border border-border px-3.5 py-2.5 text-sm text-ink disabled:bg-sage-tint disabled:text-ink-2';

function generatePassword(length = 12) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]).join('');
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Field({ id, label, hint, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold text-ink-2">
        {label}
      </label>
      {children}
      {hint && <span className="text-xs text-ink-2">{hint}</span>}
    </div>
  );
}

// The fields shared by "Add user" and "Edit user".
function UserFields({ form, setForm, creating, isSelf, roleChanged }) {
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });
  return (
    <div className="flex flex-col gap-3.5 text-left">
      <Field id="user-name" label="Name">
        <input id="user-name" value={form.name} maxLength={100} onChange={set('name')} className={inputClass} />
      </Field>
      <Field id="user-email" label="Email" hint={creating ? undefined : 'Changing the email changes what they log in with.'}>
        <input id="user-email" type="email" value={form.email} onChange={set('email')} className={inputClass} />
      </Field>
      <Field
        id="user-role"
        label="Role"
        hint={
          isSelf
            ? 'You cannot change your own role.'
            : roleChanged
              ? 'Changing the role signs them out everywhere, and needs a reason below.'
              : undefined
        }
      >
        <select id="user-role" value={form.role} onChange={set('role')} disabled={isSelf} className={inputClass}>
          {ROLES.map((role) => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
        </select>
      </Field>
      {creating && (
        <Field
          id="user-password"
          label="Password"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters. Give it to them securely; they can change it under Account.`}
        >
          <div className="flex gap-2">
            <input id="user-password" value={form.password} onChange={set('password')} autoComplete="off" className={inputClass} />
            <button
              type="button"
              onClick={() => setForm({ ...form, password: generatePassword() })}
              className="flex-shrink-0 rounded-lg border border-border px-3 text-[13px] font-semibold text-ink-2 hover:border-green"
            >
              Generate
            </button>
          </div>
        </Field>
      )}
    </div>
  );
}

// Shows a generated temporary password exactly once.
function TemporaryPassword({ password, name }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      setCopied(false); // clipboard blocked: the password is selected on focus, so it can be copied by hand
    }
  }
  return (
    <div className="flex flex-col gap-3 text-left">
      <p>
        This is shown once and can&apos;t be looked up later. Give it to {name} securely; they can change it under
        Account settings.
      </p>
      <div className="flex gap-2">
        <input
          readOnly
          aria-label="Temporary password"
          value={password}
          onFocus={(e) => e.target.select()}
          className="w-full rounded-lg border border-border bg-sage-tint px-3.5 py-2.5 font-mono text-sm text-ink"
        />
        <button
          type="button"
          onClick={copy}
          className="flex-shrink-0 rounded-lg border border-green px-3 text-[13px] font-semibold text-green-dark hover:bg-green-tint"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

export default function UsersTab() {
  const { user: me } = useAuth();
  const [role, setRole] = useState('');
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const { data: users, error, reload } = useAdminData(() => listUsers({ role, q }), `${role}|${q}`, 'Could not load users.');

  // One dialog at a time: { type: 'suspend' | 'create' | 'edit' | 'reset' | 'secret', user?, password? }
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', role: 'driver', password: '' });
  const [resetPassword, setResetPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');

  function open(next) {
    setActionError('');
    setNotice('');
    setDialog(next);
  }
  const close = () => setDialog(null);

  // Runs an API call, then closes the dialog and refreshes; a failure stays in the dialog.
  async function run(task, failure) {
    setBusy(true);
    setActionError('');
    try {
      await task();
    } catch (err) {
      setActionError(errorMessage(err, failure));
    } finally {
      setBusy(false);
    }
  }

  const setActive = (user, isActive, reason) =>
    run(async () => {
      await setUserActive(user.id, isActive, reason);
      close();
      reload();
    }, 'Could not update this account.');

  const openCreate = () => {
    setForm({ name: '', email: '', role: 'driver', password: '' });
    open({ type: 'create' });
  };
  const openEdit = (user) => {
    setForm({ name: user.name, email: user.email, role: user.role, password: '' });
    open({ type: 'edit', user });
  };
  const openReset = (user) => {
    setResetPassword('');
    open({ type: 'reset', user });
  };

  const roleChanged = dialog?.type === 'edit' && form.role !== dialog.user.role;
  const submitForm = (reason) =>
    run(async () => {
      const details = { name: form.name.trim(), email: form.email.trim(), role: form.role };
      if (dialog.type === 'create') {
        await createUser({ ...details, password: form.password });
        setNotice(`Created ${details.name}.`);
      } else {
        await updateUser(dialog.user.id, { ...details, reason: roleChanged ? reason : undefined });
        setNotice(`Saved changes to ${details.name}.`);
      }
      close();
      reload();
    }, dialog?.type === 'create' ? 'Could not create this user.' : 'Could not save these changes.');

  const submitReset = (reason) =>
    run(async () => {
      const { user, temporaryPassword } = await resetUserPassword(dialog.user.id, resetPassword.trim(), reason);
      if (temporaryPassword) {
        setDialog({ type: 'secret', user, password: temporaryPassword });
      } else {
        setNotice(`Password updated for ${user.name}.`);
        close();
      }
    }, 'Could not reset this password.');

  const formValid =
    form.name.trim() !== '' &&
    EMAIL_PATTERN.test(form.email.trim()) &&
    (dialog?.type !== 'create' || form.password.length >= MIN_PASSWORD_LENGTH);
  const resetValid = resetPassword.trim() === '' || resetPassword.trim().length >= MIN_PASSWORD_LENGTH;

  const columns = [
    {
      key: 'user',
      header: 'User',
      cell: (user) => (
        <div className="flex flex-col">
          <span className="font-semibold text-ink">{user.name}</span>
          <span className="break-all text-[11px] text-ink-2">{user.email}</span>
        </div>
      ),
    },
    { key: 'role', header: 'Role', cell: (user) => <StatusBadge status={user.role} /> },
    {
      key: 'status',
      header: 'Status',
      cell: (user) => <StatusBadge status={user.is_active ? 'active' : 'suspended'} />,
    },
    {
      key: 'joined',
      header: 'Joined',
      cell: (user) => new Date(user.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    },
    {
      key: 'action',
      header: 'Actions',
      mobileLabel: '',
      cell: (user) => {
        const isSelf = user.id === me?.id;
        return (
          <div className="flex flex-wrap justify-end gap-2 sm:justify-start">
            <RowButton aria-label={`Edit ${user.name}`} onClick={() => openEdit(user)}>
              Edit
            </RowButton>
            {isSelf ? (
              <span className="self-center text-[13px] text-ink-2">This is you</span>
            ) : (
              <>
                <RowButton aria-label={`Reset password for ${user.name}`} onClick={() => openReset(user)}>
                  Reset password
                </RowButton>
                {user.is_active ? (
                  <RowButton danger aria-label={`Suspend ${user.name}`} onClick={() => open({ type: 'suspend', user })}>
                    Suspend
                  </RowButton>
                ) : (
                  <RowButton aria-label={`Reactivate ${user.name}`} disabled={busy} onClick={() => setActive(user, true)}>
                    Reactivate
                  </RowButton>
                )}
              </>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select aria-label="Filter by role" value={role} onChange={(e) => setRole(e.target.value)} className={fieldClass}>
          <option value="">All roles</option>
          <option value="driver">Drivers</option>
          <option value="operator">Operators</option>
          <option value="admin">Admins</option>
        </select>
        <input
          type="search"
          aria-label="Search users"
          placeholder="Search name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={wideFieldClass}
        />
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-green px-4 py-2.5 text-sm font-semibold text-white sm:ml-auto"
        >
          + Add user
        </button>
      </div>

      {notice && (
        <p role="status" className="text-sm font-semibold text-green-dark">
          {notice}
        </p>
      )}

      <LoadState data={users} error={error}>
        {actionError && !dialog && <ErrorBanner>{actionError}</ErrorBanner>}
        {users?.length === 0 ? (
          <EmptyState>No users match those filters.</EmptyState>
        ) : (
          <DataTable label="Users" columns={columns} rows={users || []} getKey={(user) => user.id} />
        )}
      </LoadState>

      {dialog?.type === 'suspend' && (
        <ConfirmDialog
          title={`Suspend ${dialog.user.name}?`}
          confirmLabel="Suspend"
          reasonLabel="Reason for suspending"
          busy={busy}
          error={actionError}
          onConfirm={(reason) => setActive(dialog.user, false, reason)}
          onCancel={close}
        >
          They will be signed out straight away and can&apos;t log in until you reactivate them. Their bookings and
          stations stay as they are.
        </ConfirmDialog>
      )}

      {(dialog?.type === 'create' || dialog?.type === 'edit') && (
        <ConfirmDialog
          title={dialog.type === 'create' ? 'Add a user' : `Edit ${dialog.user.name}`}
          confirmLabel={dialog.type === 'create' ? 'Create user' : 'Save changes'}
          tone="primary"
          initialFocus="field"
          confirmDisabled={!formValid}
          reasonLabel={roleChanged ? 'Reason for changing the role' : undefined}
          busy={busy}
          error={actionError}
          onConfirm={submitForm}
          onCancel={close}
        >
          <UserFields
            form={form}
            setForm={setForm}
            creating={dialog.type === 'create'}
            isSelf={dialog.user?.id === me?.id}
            roleChanged={roleChanged}
          />
        </ConfirmDialog>
      )}

      {dialog?.type === 'reset' && (
        <ConfirmDialog
          title={`Reset password for ${dialog.user.name}?`}
          confirmLabel="Reset password"
          initialFocus="field"
          confirmDisabled={!resetValid}
          reasonLabel="Reason for the reset"
          busy={busy}
          error={actionError}
          onConfirm={submitReset}
          onCancel={close}
        >
          <div className="flex flex-col gap-3 text-left">
            <p>
              Their current password stops working immediately and they are signed out everywhere. Leave the box empty to
              generate a temporary password.
            </p>
            <Field
              id="reset-password"
              label="New password (optional)"
              hint={`If you type one, at least ${MIN_PASSWORD_LENGTH} characters.`}
            >
              <input
                id="reset-password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                autoComplete="off"
                className={inputClass}
              />
            </Field>
          </div>
        </ConfirmDialog>
      )}

      {dialog?.type === 'secret' && (
        <ConfirmDialog
          title={`Temporary password for ${dialog.user.name}`}
          confirmLabel="Done"
          tone="primary"
          hideCancel
          initialFocus="field"
          onConfirm={close}
          onCancel={close}
        >
          <TemporaryPassword password={dialog.password} name={dialog.user.name} />
        </ConfirmDialog>
      )}
    </div>
  );
}
