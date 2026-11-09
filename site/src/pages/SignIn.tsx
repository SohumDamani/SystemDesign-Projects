import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProgress } from '../core/progress';
import { authConfigured } from '../core/auth';

export function SignIn() {
  const { user, signIn, signInGoogle, signOut, resetProgress, lessons } = useProgress();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) {
      setError('Enter a name for your profile.');
      return;
    }
    signIn(clean);
    navigate('/');
  };

  if (user) {
    const started = Object.keys(lessons).length;
    return (
      <div className="page narrow">
        <h1>Signed in as {user.name}</h1>
        {user.google && <p className="muted small">Google account connected. Lesson progress is saved in this browser.</p>}
        <p>You've opened {started} lessons so far. Your progress is saved in this browser.</p>
        <div className="row">
          <button className="btn" onClick={signOut}>
            Sign out
          </button>
          <button className="ghost" onClick={() => window.confirm('Clear all your progress on this device? This can\'t be undone.') && resetProgress()}>
            Clear my progress
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page narrow">
      <h1>Sign in</h1>
      <p>Use Google or create a local profile to keep track of lessons and experiments. Your guest progress comes with you.</p>
      <section className="auth-flow" aria-label="How Google sign-in works">
        <p className="eyebrow">HOW GOOGLE SIGN-IN WORKS</p>
        <div className="auth-flow-track">
          <div className="auth-flow-step"><span>1</span><b>You</b><small>Choose Google</small></div>
          <i aria-hidden="true">→</i>
          <div className="auth-flow-step"><span>2</span><b>Google</b><small>Confirms identity</small></div>
          <i aria-hidden="true">→</i>
          <div className="auth-flow-step"><span>3</span><b>Secure return</b><small>Back to the lab</small></div>
          <em className="auth-flow-pulse" aria-hidden="true" />
        </div>
        <p className="muted small">Your password stays with Google. The lab receives a sign-in confirmation.</p>
      </section>
      <button className="google-button wide" type="button" disabled={!authConfigured || busy} onClick={async () => {
        setBusy(true); setError('');
        try {
          const message = await signInGoogle();
          if (message) setError(message);
        } catch {
          setError('Google sign-in could not start. Please try again.');
        } finally {
          setBusy(false);
        }
      }}>
        <span className="google-mark" aria-hidden="true">G</span>
        {busy ? 'Connecting to Google…' : authConfigured ? 'Continue with Google' : 'Google sign-in setup required'}
      </button>
      {!authConfigured && <p className="muted small">Google sign-in will be available when the site owner connects its authentication settings.</p>}
      <div className="auth-divider"><span>or use a local profile</span></div>
      <form onSubmit={submit} className="form" noValidate>
        <label htmlFor="profile-name">Profile name</label>
        <input
          id="profile-name"
          autoComplete="nickname"
          maxLength={40}
          placeholder="Sohum"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError('');
          }}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'profile-error' : undefined}
        />
        {error && (
          <p id="profile-error" className="field-error">
            {error}
          </p>
        )}
        <button className="btn" type="submit">
          Continue
        </button>
      </form>
      <p className="muted small">Local profiles stay on this device. No password is needed.</p>
    </div>
  );
}
