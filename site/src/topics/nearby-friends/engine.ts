// Location updates flow through pub/sub: each user publishes to their own channel, friends subscribe.
export interface Person {
  id: number;
  x: number; // meters
  y: number;
  heading: number;
  online: boolean;
  friends: number[];
  lastSent: number;
  /** Last position received for each friend, used to display them. */
  known: Map<number, { x: number; y: number }>;
}

export const FIELD_METERS = 10000;

export function move(p: Person, speed: number, dt: number, turnChance: number, random: () => number) {
  if (random() < turnChance) p.heading = random() * Math.PI * 2;
  p.x += Math.cos(p.heading) * speed * dt;
  p.y += Math.sin(p.heading) * speed * dt;
  // Bounce off the edge of the map.
  if (p.x < 0 || p.x > FIELD_METERS) {
    p.heading = Math.PI - p.heading;
    p.x = Math.min(FIELD_METERS, Math.max(0, p.x));
  }
  if (p.y < 0 || p.y > FIELD_METERS) {
    p.heading = -p.heading;
    p.y = Math.min(FIELD_METERS, Math.max(0, p.y));
  }
}

export const distance = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

export interface PublishStats {
  published: number;
  delivered: number;
  forwarded: number;
}

/**
 * One update: publish to the user's channel, and each online friend's connection handler
 * gets it. Only then can it check distance, and most messages stop there.
 */
export function publishLocation(people: Person[], sender: Person, radiusMeters: number, stats: PublishStats) {
  stats.published++;
  for (const friendId of sender.friends) {
    const friend = people[friendId];
    if (!friend.online) continue;
    stats.delivered++;
    if (distance(sender.x, sender.y, friend.x, friend.y) <= radiusMeters) {
      friend.known.set(sender.id, { x: sender.x, y: sender.y });
      stats.forwarded++;
    } else {
      friend.known.delete(sender.id); // moved out of range, so stop showing them
    }
  }
}
