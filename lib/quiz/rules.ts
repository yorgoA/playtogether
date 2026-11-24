// Names and texts shared by the server, the TV and the phones.
import type { QuizPower, QuizType } from '../contract/rooms';

// Reactions phones can send to the TV.
export const cheerEmoji = ['🔥', '😂', '👏', '😱', '💀'] as const;

// How long each part of a round lasts.
export const introMs = 2600;
export const powerMs = 10000;
export const suspenseMs = 4200;
export const revealMs = 5500;
// During the suspense the TV crosses out a wrong answer at each of these moments.
export const crossOutAt = [1400, 2700];

export const quizTypes: Record<QuizType, { name: string; icon: string; text: string; ms: number }> = {
  accuracy: { name: 'Cool Head', icon: '🧠', text: 'Speed does not matter. Right answers earn 1000.', ms: 20000 },
  speed: { name: 'Lightning', icon: '⚡', text: 'Ten seconds. Faster right answers earn up to 1200.', ms: 10000 },
  balanced: { name: 'Sharp & Swift', icon: '🎯', text: 'Right earns 500, plus up to 500 for speed.', ms: 15000 },
  minefield: { name: 'Minefield', icon: '💣', text: 'Right earns 1000. Wrong loses 500. Silence is safe.', ms: 15000 },
  jackpot: { name: 'Jackpot', icon: '💰', text: 'One pot, split between everyone who gets it right.', ms: 15000 },
};

// `target` powers are aimed at another player.
export const quizPowers: Record<QuizPower, { name: string; icon: string; text: string; target: boolean }> = {
  smoke: { name: 'Smoke Bomb', icon: '🌫️', text: 'Hide two random answers from a rival.', target: true },
  half: { name: 'Half & Half', icon: '✂️', text: 'Remove two wrong answers. Costs 20% of your score.', target: false },
  wager: { name: 'All In', icon: '🎲', text: 'Right doubles your points. Wrong loses 1000.', target: false },
  thief: { name: 'Pickpocket', icon: '🧤', text: 'If you are right and your rival is not, steal 400.', target: true },
  rush: { name: 'Time Crunch', icon: '⏳', text: 'A rival gets only half the time.', target: true },
  mirror: { name: 'Mirror', icon: '🪞', text: 'Powers aimed at you bounce back.', target: false },
  copycat: { name: 'Copycat', icon: '🐈', text: 'Earn what a rival earns if it beats yours.', target: true },
};
