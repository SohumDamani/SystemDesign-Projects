import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProgress } from '../core/progress';

export function SignIn() {
  const { user, signIn, signOut, resetProgress, lessons } = useProgress();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
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
      <p>Pick a profile name to save lessons and experiment results. Anything you've done as a guest comes with you.</p>
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
      <p className="muted small">Profiles stay on this device. There's no password and nothing is sent to a server.</p>
    </div>
  );
}
