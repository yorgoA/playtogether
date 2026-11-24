// Fractional arc length and lateral position are independent of the TV viewport.
export const hazards = [
  { at: 0.17, lane: 0.65 }, { at: 0.39, lane: -0.58 },
  { at: 0.62, lane: 0.05 }, { at: 0.83, lane: 0.68 },
];
export const boostPads = [{ at:0.27, lane:-0.55 }, { at:0.72, lane:0.65 }];
export const raceDuration = 180000;
const laps = 3, stepMs = 50;
export type Drive = { steering: number; accelerate: number; brake: number; powerUp: boolean; drift?: boolean };
type Racer = {
  id: string; progress: number; lane: number; speed: number;
  boostReadyAt: number; boostUntil: number; finishedAt: number | null; impactUntil: number;
  driftCharge?: number; driftDirection?: number; input: Drive; inputAt: number;
};
type Race = { tick: number; cars: Racer[] };
const idle = (): Drive => ({ steering: 0, accelerate: 0, brake: 0, powerUp: false });
export function createRace(ids: string[], now: number): Race {
  return { tick:now, cars:ids.map((id,index) => ({
    id, progress:0, lane:ids.length > 1 ? -0.72 + 1.44 * index/(ids.length-1) : 0,
    speed:0, boostReadyAt:now, boostUntil:0, finishedAt:null, impactUntil:0, input:idle(), inputAt:now,
  })) };
}
function clamp(value: number, low: number, high: number) { return Math.max(low,Math.min(value,high)); }
export function advanceRace(race: Race, until: number) {
  // Keeping ticks on a fixed grid makes gameplay independent of polling frequency.
  while (race.tick + stepMs <= until) {
    const t = race.tick + stepMs;
    for (const car of race.cars) {
      if (car.finishedAt) continue;
      const input = t - car.inputAt <= 1500 ? car.input : idle();
      const direction = Math.sign(input.steering);
      if (!input.drift) {
        if (t - car.inputAt <= 1500 && (car.driftCharge ?? 0) >= 800)
          car.boostUntil = Math.max(car.boostUntil, t + 1400);
        car.driftCharge = 0;
        car.driftDirection = 0;
      } else if (car.speed > 0.025 && Math.abs(input.steering) > 0.18 && !input.brake) {
        if (car.driftDirection !== direction) car.driftCharge = 0;
        car.driftDirection = direction;
        car.driftCharge = Math.min(1000, (car.driftCharge ?? 0) + stepMs);
      }
      const boosted = t < car.boostUntil;
      const v = car.speed;
      const dt = stepMs/1000;
      car.speed = clamp(v + ((boosted ? 0.032 : 0) + 0.030*input.accelerate - 0.06*input.brake - 0.004 - 0.26*v)*dt, 0, boosted ? 0.095 : 0.065);
      car.lane = clamp(car.lane + input.steering*(0.44 + 10*car.speed)*dt, -1, 1);
      const before = car.progress;
      car.progress = Math.min(laps, before + car.speed*dt);
      // At most one hazard can be crossed in a tick, including on a later lap.
      for (const pad of boostPads) {
        const crossing = Math.floor(before-pad.at)+1+pad.at;
        if(crossing<=car.progress && Math.abs(car.lane-pad.lane)<0.36) car.boostUntil=Math.max(car.boostUntil,t+1400);
      }
      for (const h of hazards) {
        const crossing = Math.floor(before - h.at) + 1 + h.at;
        if (crossing <= car.progress && Math.abs(car.lane - h.lane) < 0.31) {
          car.driftCharge = 0; car.speed *= 0.35; car.boostUntil = 0; car.impactUntil = t + 650;
        }
      }
      if (car.progress >= laps) {
        car.finishedAt = t - stepMs + stepMs * (laps-before) / Math.max(car.speed*dt, 0.000001);
        car.speed = 0;
      }
    }
    race.tick = t;
    if (race.cars.every(c => c.finishedAt !== null)) break;
  }
}
export function drive(race:Race, playerId:string, input:Drive, now:number) {
  const car = race.cars.find(c => c.id === playerId);
  if (!car || car.finishedAt) return;
  if (input.powerUp && now >= car.boostReadyAt) {
    car.boostUntil = now + 1700;
    car.boostReadyAt = now + 7000;
  }
  car.input = input; car.inputAt = now;
}
export function resumeRace(race:Race,delta:number) {
  race.tick += delta;
  for (const car of race.cars) {
    car.driftCharge = 0; car.input = idle(); car.boostReadyAt += delta;
    if (car.finishedAt) car.finishedAt += delta;
    if (car.boostUntil) car.boostUntil += delta;
    if (car.impactUntil) car.impactUntil += delta;
  }
}
export function raceScores(race: Race, started:number) {
  return Object.fromEntries(race.cars.map(c => [c.id, c.finishedAt
    ? 300000 + Math.max(0, raceDuration - Math.round(c.finishedAt-started))
    : Math.floor(c.progress*100000)]));
}
export function publicRace(race: Race) {
  return race.cars.map(({input:_input, inputAt:_inputAt, ...car}) => car);
}
