import { useId, useState } from 'react';
import type { Lab } from '../core/types';
import { compareChallenge, type Challenge } from '../topics/challenges';

const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

export function GuidedChallenge({ lab, challenge, completed, onComplete }: {
  lab: Lab;
  challenge: Challenge;
  completed: boolean;
  onComplete(): void;
}) {
  const id = useId();
  const [choice, setChoice] = useState<'baseline' | 'alternative' | null>(null);
  const [result, setResult] = useState<ReturnType<typeof compareChallenge> | null>(null);

  function display(value: number) {
    if (!Number.isFinite(value)) return 'Target not reached during the run';
    return number.format(value) + (challenge.unit ? ` ${challenge.unit}` : '');
  }

  return (
    <details className="guided-challenge calculation-details">
      <summary>Guided challenge: {challenge.title}{completed ? ' · Completed' : ''}</summary>
      <p>{challenge.task}</p>
      <form onSubmit={(event) => {
        event.preventDefault();
        if (choice === null) return;
        const outcome = compareChallenge(lab, challenge, choice === 'alternative');
        setResult(outcome);
        if (outcome.improved) onComplete();
      }}>
        <fieldset>
          <legend>Choose what to run</legend>
          {(['baseline', 'alternative'] as const).map((option) => (
            <label key={option}>
              <input type="radio" name={id} checked={choice === option} onChange={() => {
                setChoice(option);
                setResult(null);
              }} />
              {challenge[option].label}
            </label>
          ))}
        </fieldset>
        <button type="submit" disabled={choice === null}>Compare with baseline</button>
      </form>
      <div role="status">
        {result && (
          <div className="challenge-result">
            <strong>{result.improved ? 'Challenge complete' : 'The result did not improve. Try the other option.'}</strong>
            <p>{challenge.metric}: {display(result.baseline)} baseline → {display(result.choice)} with your choice.</p>
            {result.improved && <p>{challenge.explanation}</p>}
          </div>
        )}
      </div>
    </details>
  );
}
