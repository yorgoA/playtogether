import { describe, expect, it } from 'vitest';
import {
  advanceRace,
  boostPads,
  createRace,
  drive,
  hazards,
  raceDuration,
  raceScores,
  resumeRace,
} from '../lib/server/racing';

const idle = { steering: 0, accelerate: 0, brake: 0, powerUp: false };
const go = { ...idle, accelerate: 1 };

// Drives with fresh input every half second, as a phone does.
function run(race: ReturnType<typeof createRace>, until: number, input = go) {
  for (let t = race.tick; t < until; t += 500) {
    for (const car of race.cars) drive(race, car.id, input, t);
    advanceRace(race, Math.min(t + 500, until));
  }
}

describe('race', () => {
  it('gives the same result however often it is advanced', () => {
    const often = createRace(['a'], 0),
      rarely = createRace(['a'], 0);
    for (const race of [often, rarely]) drive(race, 'a', { ...go, steering: 0.2 }, 0);
    for (let t = 0; t <= 5000; t += 17) advanceRace(often, t);
    advanceRace(often, 5000);
    advanceRace(rarely, 5000);
    expect(often).toEqual(rarely);
  });
  it('stays put without input and finishes three laps with it', () => {
    const race = createRace(['a'], 0);
    advanceRace(race, 10_000);
    expect(race.cars[0].progress).toBe(0);
    run(race, raceDuration);
    expect(race.cars[0].progress).toBe(3);
    expect(race.cars[0].finishedAt).toBeLessThan(raceDuration);
  });
  it('stops accelerating when the phone goes silent', () => {
    const race = createRace(['a'], 0);
    drive(race, 'a', go, 0);
    advanceRace(race, 1500);
    const speed = race.cars[0].speed;
    advanceRace(race, 3000);
    expect(race.cars[0].speed).toBeLessThan(speed);
  });
  it('moves the car for a tap no longer than one tick', () => {
    const race = createRace(['a'], 0);
    drive(race, 'a', { ...idle, steering: 1 }, 0);
    advanceRace(race, 75);
    drive(race, 'a', idle, 75);
    advanceRace(race, 1000);
    expect(race.cars[0].lane).toBeGreaterThan(0);
  });
  it('keeps the car on the road', () => {
    const race = createRace(['a'], 0);
    run(race, 10_000, { ...go, steering: 1 });
    expect(race.cars[0].lane).toBe(1);
  });
  it('slows a car that hits a hazard and boosts one that crosses a pad', () => {
    const hit = createRace(['a'], 0),
      h = hazards[0];
    Object.assign(hit.cars[0], { progress: h.at - 0.001, lane: h.lane, speed: 0.06 });
    advanceRace(hit, 50);
    expect(hit.cars[0].speed).toBeLessThan(0.03);
    const boosted = createRace(['a'], 0),
      pad = boostPads[0];
    Object.assign(boosted.cars[0], { progress: pad.at - 0.001, lane: pad.lane, speed: 0.06 });
    advanceRace(boosted, 50);
    expect(boosted.cars[0].boostUntil).toBeGreaterThan(50);
  });
  it('limits boost to once every seven seconds', () => {
    const race = createRace(['a'], 0);
    drive(race, 'a', { ...go, powerUp: true }, 100);
    expect(race.cars[0].boostUntil).toBe(1800);
    drive(race, 'a', { ...go, powerUp: true }, 5000);
    expect(race.cars[0].boostUntil).toBe(1800);
    drive(race, 'a', { ...go, powerUp: true }, 7100);
    expect(race.cars[0].boostUntil).toBe(8800);
  });
  it('rewards releasing a charged drift', () => {
    const race = createRace(['a'], 0),
      car = race.cars[0];
    car.speed = 0.06;
    drive(race, 'a', { ...go, steering: 0.5, drift: true }, 0);
    advanceRace(race, 1000);
    expect(car.driftCharge).toBe(1000);
    drive(race, 'a', go, 1000);
    advanceRace(race, 1050);
    expect(car.boostUntil).toBe(1050 + 1400);
    expect(car.driftCharge).toBe(0);
  });
  it('does not advance cars through a pause', () => {
    const race = createRace(['a'], 0);
    run(race, 2000);
    const { progress } = race.cars[0];
    resumeRace(race, 60_000);
    advanceRace(race, 62_000);
    expect(race.cars[0].progress).toBe(progress);
  });
  it('ranks finishers above others, fastest first', () => {
    const race = createRace(['fast', 'slow', 'out'], 0);
    race.cars[0].finishedAt = 50_000;
    race.cars[1].finishedAt = 60_000;
    race.cars[2].progress = 2.99;
    const s = raceScores(race, 0);
    expect(s.fast).toBeGreaterThan(s.slow);
    expect(s.slow).toBeGreaterThan(s.out);
  });
});
