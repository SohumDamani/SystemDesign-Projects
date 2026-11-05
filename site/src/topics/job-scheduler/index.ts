import type { Lab, Topic } from '../../core/types';
import { fmtCount, fmtDuration, fmtInt, fmtPct, signed } from '../../core/format';
import { slope } from '../../core/stats';
import source from './engine.ts?raw';
import { JobQueue, type Job, type Worker } from './engine';

type P = { jobsPerSec: number; durationSec: number; workers: number; leaseSec: number; heartbeat: boolean; crashesPerMin: number; pattern: 'steady' | 'top-of-minute'; jitterSec: number };

const DT = 0.1;
const RESTART_SECONDS = 5;

interface S {
  now: number;
  q: JobQueue;
  workers: Worker[];
  jobs: Job[];
  nextId: number;
  created: number;
  completed: number;
  duplicateRuns: number;
  reruns: number;
  crashes: number;
  scheduled: { at: number }[];
  nextMinute: number;
  maxWaiting: number;
  carry: number;
  throughput: number;
  waitEma: number;
}

const inFlight = (s: S) => s.workers.filter((w) => w.job).length;

function addJob(s: S, p: P, rng: { exponential(m: number): number }) {
  const job: Job = { id: s.nextId++, createdAt: s.now, duration: Math.max(0.1, rng.exponential(p.durationSec)), leaseUntil: 0, attempts: 0, completions: 0, done: false };
  s.created++;
  s.jobs.push(job);
  if (s.jobs.length > 20000) s.jobs.shift();
  s.q.push(job);
}

const lab: Lab<S, P> = {
  secondsPerTick: DT,
  params: [
    { key: 'jobsPerSec', label: 'Jobs', kind: 'range', min: 1, max: 100, step: 1, unit: 'per s' },
    { key: 'durationSec', label: 'Average job time', kind: 'range', min: 0.5, max: 30, step: 0.5, unit: 's' },
    { key: 'workers', label: 'Workers', kind: 'range', min: 1, max: 100, step: 1, rebuild: true },
    { key: 'leaseSec', label: 'Lease time', kind: 'range', min: 1, max: 120, step: 1, unit: 's' },
    { key: 'heartbeat', label: 'Workers send heartbeats to extend the lease', kind: 'toggle' },
    { key: 'crashesPerMin', label: 'Worker crashes', kind: 'range', min: 0, max: 60, step: 1, unit: 'per min' },
    { key: 'pattern', label: 'Job schedule', kind: 'choice', options: [{ value: 'steady', label: 'Spread out evenly' }, { value: 'top-of-minute', label: 'All at the top of the minute' }] },
    { key: 'jitterSec', label: 'Random delay added to scheduled jobs', kind: 'range', min: 0, max: 60, step: 1, unit: 's' },
  ],
  defaults: { jobsPerSec: 10, durationSec: 2, workers: 30, leaseSec: 30, heartbeat: true, crashesPerMin: 6, pattern: 'steady', jitterSec: 0 },
  create: (p) => ({
    now: 0,
    q: new JobQueue(),
    workers: Array.from({ length: p.workers }, (_, id) => ({ id, alive: true, job: null, finishAt: 0, restartAt: 0 })),
    jobs: [],
    nextId: 1,
    created: 0,
    completed: 0,
    duplicateRuns: 0,
    reruns: 0,
    crashes: 0,
    scheduled: [],
    nextMinute: 60,
    maxWaiting: 0,
    carry: 0,
    throughput: 0,
    waitEma: 0,
  }),
  step(s, p, rng) {
    s.now += DT;
    // New jobs: either a steady stream, or a big batch on the minute, spread by jitter.
    if (p.pattern === 'steady') {
      for (let i = rng.poisson(p.jobsPerSec * DT); i > 0; i--) addJob(s, p, rng);
    } else if (s.now >= s.nextMinute) {
      s.nextMinute += 60;
      const batch = p.jobsPerSec * 60;
      for (let i = 0; i < batch; i++) s.scheduled.push({ at: s.now + rng.next() * p.jitterSec });
    }
    s.scheduled = s.scheduled.filter((j) => {
      if (j.at > s.now) return true;
      addJob(s, p, rng);
      return false;
    });

    s.reruns += s.q.requeueExpired(s.now);

    if (rng.chance((p.crashesPerMin / 60) * DT)) {
      const alive = s.workers.filter((w) => w.alive);
      if (alive.length) {
        const victim = alive[rng.int(alive.length)];
        // Its job isn't lost: the lease simply runs out, and someone else takes it.
        victim.alive = false;
        victim.job = null;
        victim.restartAt = s.now + RESTART_SECONDS;
        s.crashes++;
      }
    }

    let finished = 0;
    for (const w of s.workers) {
      if (!w.alive) {
        if (s.now >= w.restartAt) w.alive = true;
        continue;
      }
      if (w.job) {
        if (s.now >= w.finishAt) {
          // Another worker may have finished this already, after our lease ran out.
          if (w.job.done) s.duplicateRuns++;
          s.q.complete(w.job);
          s.completed++;
          finished++;
          w.job = null;
        } else if (p.heartbeat) {
          s.q.heartbeat(w.job, s.now, p.leaseSec);
        }
      }
      if (!w.job) {
        const job = s.q.claim(s.now, p.leaseSec);
        if (job) {
          w.job = job;
          w.finishAt = s.now + job.duration;
          s.waitEma = s.waitEma * 0.98 + (s.now - job.createdAt) * 0.02;
        }
      }
    }
    s.throughput = s.throughput * 0.95 + (finished / DT) * 0.05;
    s.maxWaiting = Math.max(s.maxWaiting, s.q.length);
  },
  sample: (s, p) => ({ waiting: s.q.length, busy: inFlight(s), done: s.throughput, cap: p.workers / p.durationSec }),
  charts: [
    { title: 'Jobs waiting', series: [{ key: 'waiting', label: 'Measured', role: 'measured' }] },
    { title: 'Jobs finished', unit: 'per s', series: [{ key: 'done', label: 'Measured', role: 'measured' }, { key: 'cap', label: 'Most possible', role: 'predicted' }] },
  ],
  metrics(s, p) {
    const load = (p.jobsPerSec * p.durationSec) / p.workers;
    const unaccounted = s.created - new Set(s.jobs.filter((j) => j.done).map((j) => j.id)).size - s.q.length - s.q.leased.size;
    return [
      { label: 'Worker utilization', value: fmtPct(load), role: 'predicted', tone: load >= 1 ? 'bad' : load > 0.8 ? 'warn' : 'good' },
      { label: 'Jobs waiting', value: fmtCount(s.q.length), role: 'measured', tone: s.q.length > p.workers * 5 ? 'warn' : undefined },
      { label: 'Average wait', value: fmtDuration(s.waitEma), role: 'measured' },
      { label: 'Jobs run twice', value: fmtInt(s.duplicateRuns), role: 'measured', tone: s.duplicateRuns ? 'bad' : 'good' },
      { label: 'Taken over after a crash or expiry', value: fmtInt(s.reruns), role: 'measured' },
      { label: 'Jobs lost', value: fmtInt(Math.max(0, unaccounted)), role: 'measured', tone: unaccounted > 0 ? 'bad' : 'good' },
    ];
  },
  math(_s, p) {
    const needed = p.jobsPerSec * p.durationSec;
    return [
      { expr: `Workers needed: ${p.jobsPerSec}/s × ${p.durationSec} s`, result: fmtInt(needed), tone: needed <= p.workers ? 'good' : 'bad' },
      { expr: `Backlog growth: ${p.jobsPerSec}/s − ${p.workers} ÷ ${p.durationSec} s`, result: `${signed(Math.max(0, p.jobsPerSec - p.workers / p.durationSec))}/s`, tone: p.jobsPerSec > p.workers / p.durationSec ? 'bad' : 'good' },
      { expr: `Lease ${p.leaseSec} s, against a ${p.durationSec} s job`, result: p.heartbeat ? 'kept alive by heartbeats' : p.leaseSec > p.durationSec * 3 ? 'long enough' : 'jobs will run twice', tone: p.heartbeat || p.leaseSec > p.durationSec * 3 ? 'good' : 'bad' },
    ];
  },
  views: (s) => [
    { kind: 'cells', title: 'Workers: running, idle, or crashed', items: s.workers.slice(0, 24).map((w) => ({ label: `W${w.id + 1}`, value: !w.alive ? 'Down' : w.job ? `#${w.job.id}` : 'Idle', tone: !w.alive ? 'bad' : w.job ? 'good' : 'neutral' })) },
  ],
  trace: (s) => ({
    values: { claim: `${fmtCount(s.q.leased.size)} leased`, again: `${fmtCount(s.reruns)} taken over`, twice: `${fmtInt(s.duplicateRuns)} ran twice` },
  }),
  experiments: [
    {
      title: 'Not enough workers',
      set: { jobsPerSec: 10, durationSec: 2, workers: 10, crashesPerMin: 0 },
      ticks: 300,
      question: '10 jobs arrive each second, and each takes 2 seconds, with 10 workers. Does the queue stay flat?',
      options: ['Yes, 10 workers for 10 jobs', 'No, it grows by about 5 jobs every second'],
      answer: 1,
      explain: 'Each worker only finishes 0.5 jobs a second, so 10 workers finish 5. You need rate × duration = 20 workers just to keep up, and more for headroom. It\'s Little\'s law, in the form you\'ll use most.',
      check: (_s, _p, h) => {
        const v = slope(h, 'waiting', 150, DT);
        return v > 3.5 && v < 6.5;
      },
    },
    {
      title: 'Workers keep crashing',
      set: { jobsPerSec: 10, durationSec: 1, workers: 30, leaseSec: 5, heartbeat: true, crashesPerMin: 30 },
      ticks: 800,
      question: 'Workers crash in the middle of jobs, about every 2 seconds. Do jobs get lost?',
      options: ['Yes, jobs die with their worker', 'No, the lease runs out, and another worker runs them'],
      answer: 1,
      explain: 'A job is only removed once it\'s reported complete. If a worker dies, its lease expires, and the job goes back in the queue. You never need to detect the crash directly. It\'s a very robust design, and it costs you one lease time of delay.',
      check: (s) => s.crashes > 3 && s.reruns > 0 && s.created - s.completed - s.q.length - s.q.leased.size <= inFlight(s) + s.duplicateRuns + 1,
    },
    {
      title: 'A lease shorter than the job',
      set: { jobsPerSec: 5, durationSec: 5, workers: 60, leaseSec: 2, heartbeat: false, crashesPerMin: 0 },
      ticks: 400,
      question: 'Jobs take 5 seconds, leases last 2, and there are no heartbeats. Nothing has crashed. What happens?',
      options: ['Everything\'s fine, as no worker died', 'Jobs run more than once, since the system assumes workers have died'],
      answer: 1,
      explain: 'A slow worker looks exactly like a dead one. The lease expires, and another worker starts the same job. If that job charges a card or sends an email, your user gets it twice. A worker can\'t tell its lease expired while it was paused.',
      check: (s) => s.duplicateRuns > 10,
    },
    {
      title: 'Add heartbeats',
      set: { jobsPerSec: 5, durationSec: 5, workers: 60, leaseSec: 2, heartbeat: true, crashesPerMin: 0 },
      ticks: 400,
      question: 'Same jobs and lease, but workers now extend their lease while they\'re working. How many jobs run twice?',
      options: ['None', 'About the same'],
      answer: 0,
      explain: 'You get a short lease for fast crash recovery, and long jobs are still safe. But a network hiccup or a long pause can still cause duplicates, so jobs must be idempotent anyway. Leases make double execution rare, not impossible.',
      check: (s) => s.duplicateRuns === 0 && s.completed > 100,
    },
    {
      title: 'Everything at the top of the minute',
      set: { jobsPerSec: 2, durationSec: 1, workers: 10, crashesPerMin: 0, pattern: 'top-of-minute', jitterSec: 0 },
      ticks: 650,
      question: 'A daily cron habit: everyone schedules jobs for exactly :00. It averages only 2 jobs a second, and you have 10 workers. Is that enough?',
      options: ['Yes, 10 workers handle 10 jobs a second', 'On average yes, but a big line forms each minute'],
      answer: 1,
      explain: 'All 120 jobs arrive together, so a line of over 100 forms, draining at 10 a second. Humans love round numbers, so real schedulers see huge spikes at the top of the hour. Adding random jitter spreads the load, and that costs nothing.',
      check: (s) => s.maxWaiting > 80,
    },
  ],
};

const topic: Topic = {
  problem: [
    'Sending emails, resizing images, running nightly reports: lots of work can\'t or shouldn\'t happen during a web request. A job scheduler runs it later, on a pool of workers, and it has to keep working when those workers crash.',
    'The key design decision is how to avoid losing a job when a worker dies. The usual answer is a lease: taking a job only borrows it for a while. If you don\'t finish or renew it in time, someone else takes over. It\'s simple and robust, but it has a catch that the lab will show you.',
  ],
  functional: [
    'Schedule jobs to run now, later, or on a recurring schedule',
    'Run jobs on a pool of workers',
    'Retry failed jobs, and report their status',
  ],
  nonFunctional: [
    'No job gets lost, even if workers crash',
    'Each job should run about once, and be safe if it runs twice',
    'Scales by adding workers, and handles spikes',
  ],
  diagram: {
    nodes: [
      { id: 'a', label: 'Application', col: 0, row: 1, kind: 'client', note: 'Adds jobs, with an idempotency key and a run time.' },
      { id: 's', label: 'Scheduler', col: 1, row: 0, note: 'Moves jobs that have become due from storage to the queue.' },
      { id: 'd', label: 'Job store', col: 1, row: 1, kind: 'store', note: 'Durable record of every job and its status. The source of truth.' },
      { id: 'q', label: 'Ready queue', col: 2, row: 1, kind: 'queue', note: 'Jobs ready to run. A claimed job is hidden for the length of its lease.' },
      { id: 'w', label: 'Workers', col: 3, row: 1, note: 'Claim jobs, run them, and report back. They can die at any moment.' },
    ],
    edges: [
      { from: 'a', to: 'd' },
      { from: 's', to: 'd' },
      { from: 's', to: 'q' },
      { from: 'q', to: 'w', label: 'claim' },
      { from: 'w', to: 'd', dashed: true, label: 'status' },
    ],
  },
  ideas: [
    { title: 'Leases', body: 'A worker claims a job for a limited time. If it doesn\'t finish or renew by then, the job becomes available again. You don\'t have to detect a crash, because silence is enough.' },
    { title: 'At-least-once', body: 'Leases guarantee a job runs, not that it runs once. A slow worker looks exactly like a dead one. So jobs must be idempotent, using a key to detect work that\'s already been done.' },
    { title: 'Heartbeats', body: 'Short leases find crashes quickly, but long jobs would outlive them. So a worker renews its lease while working, keeping recovery fast, and still allowing long jobs.' },
    { title: 'Avoiding thundering herds', body: 'People schedule jobs at round times, so traffic spikes at the top of each hour. Adding a small random delay spreads them out, and it costs almost nothing.' },
  ],
  estimator: {
    vars: [
      { key: 'jobsDay', label: 'Jobs per day', unit: 'count' },
      { key: 'duration', label: 'Seconds per job', unit: 'plain', assume: 5 },
      { key: 'peakFactor', label: 'Peak over average', unit: 'plain', assume: 10 },
      { key: 'target', label: 'Target utilization (0 to 1)', unit: 'plain', assume: 0.7 },
      { key: 'recordBytes', label: 'Bytes per job record', unit: 'plain', assume: 500 },
      { key: 'days', label: 'Days of history', unit: 'plain', assume: 30 },
      { key: 'avg', label: 'Average job rate', unit: 'qps' },
      { key: 'peak', label: 'Peak job rate', unit: 'qps' },
      { key: 'busy', label: 'Workers busy at peak', unit: 'count' },
      { key: 'workers', label: 'Workers to provision', unit: 'count' },
      { key: 'storage', label: 'Job history', unit: 'bytes' },
    ],
    eqs: [
      { out: 'avg', terms: [['jobsDay', 1], [86400, -1]] },
      { out: 'peak', terms: [['avg', 1], ['peakFactor', 1]] },
      { out: 'busy', terms: [['peak', 1], ['duration', 1]] },
      { out: 'workers', terms: [['busy', 1], ['target', -1]] },
      { out: 'storage', terms: [['jobsDay', 1], ['recordBytes', 1], ['days', 1]] },
    ],
    starts: [
      { key: 'jobsDay', value: 100_000_000 },
      { key: 'workers', value: 1000 },
      { key: 'storage', value: 1e12 },
    ],
  },
  lab,
  pseudocode: [
    { code: 'worker loop:' },
    { code: '  job = queue.claim(lease_seconds)', id: 'claim' },
    { code: '  while running: renew the lease' },
    { code: '  queue.complete(job)' },
    { code: '' },
    { code: 'if a lease runs out:' },
    { code: '  put the job back for another worker', id: 'again' },
    { code: '  the old worker may still finish it too', id: 'twice' },
  ],
  sources: [{ name: 'engine.ts', code: source, lang: 'ts' }],
  tradeoffs: [
    { choice: 'Short lease', gain: 'Quick recovery after a crash', cost: 'Slow jobs run twice, unless they send heartbeats' },
    { choice: 'Long lease', gain: 'Few duplicate runs', cost: 'A crashed job sits idle for that long' },
    { choice: 'At-least-once', gain: 'Nothing gets lost', cost: 'Jobs must be idempotent' },
    { choice: 'Jitter on scheduled jobs', gain: 'Smooths out spikes', cost: 'Jobs start slightly later than their exact time' },
  ],
  interview: [
    { q: 'Can you guarantee a job runs exactly once?', a: 'Not in general, since a worker can finish the work and die before reporting it. So you get at-least-once execution, and make the effect once with an idempotency key, or by checking whether the work was already done.' },
    { q: 'How would you schedule a billion future jobs?', a: 'Don\'t put them in a queue. Keep them in a database indexed by run time, split into time buckets, and have the scheduler load only those due soon into memory or a queue.' },
    { q: 'How do you handle a job that always fails?', a: 'Limit the attempts, use exponential backoff between them, and move it to a dead letter queue for a person to inspect, so it doesn\'t waste workers forever.' },
    { q: 'How do you keep two schedulers from both firing a recurring job?', a: 'Use a leader, elected through a lease, or make the firing itself idempotent: an insert keyed by job and run time, which can only succeed once.' },
  ],
  mistakes: [
    'Assuming a worker that hasn\'t reported in has definitely stopped.',
    'Writing jobs that aren\'t safe to run twice.',
    'Forgetting that cron schedules cause huge spikes on the hour.',
  ],
};

export default topic;
