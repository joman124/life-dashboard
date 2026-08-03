// Login screen — a plain server-rendered form, no client JS. The whole
// interaction is one POST to /api/login, which sets the session cookie.

export const metadata = { title: 'Life Dashboard — Sign in' };

const MESSAGES: Record<string, string> = {
  '1': 'That password is not right.',
  config: 'The app password is not configured on the server. Set APP_PASSWORD and redeploy.',
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const error = searchParams.error ? (MESSAGES[searchParams.error] ?? MESSAGES['1']) : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-[480px] flex-col justify-center px-4">
      <h1 className="font-display text-[26px] leading-tight">Life Dashboard</h1>
      <p className="mt-1.5 text-[13px] text-[color:var(--muted)]">
        This dashboard is private. Enter the app password to continue.
      </p>

      <form method="post" action="/api/login" className="card mt-5 p-4">
        <label htmlFor="password" className="eyebrow">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          className="input mt-2"
          placeholder="••••••••••••••••"
        />
        <button
          type="submit"
          className="mt-3 min-h-11 w-full rounded-xl py-2.5 text-[14px] font-semibold"
          style={{ background: 'var(--gold)', color: '#171107' }}
        >
          Sign in
        </button>

        {error && (
          <p className="mt-3 text-[12px]" style={{ color: 'var(--red)' }} role="alert">
            {error}
          </p>
        )}
      </form>

      <p className="mt-4 text-[11.5px]" style={{ color: 'var(--faint)' }}>
        Signing in keeps you signed in on this device. Changing APP_PASSWORD on the server signs
        every device out.
      </p>
    </main>
  );
}
