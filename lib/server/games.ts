import { raceDuration } from './racing';

type Question = readonly [string, string, string, string, string, number];

const questions: Question[] = [
  ['Which planet has the largest ocean on its surface?', 'Earth', 'Mars', 'Venus', 'Mercury', 0],
  ['How many sides does a dodecagon have?', '8', '10', '12', '20', 2],
  ['Which instrument has a reed?', 'Trombone', 'Clarinet', 'Violin', 'Flute', 1],
  ['Which city is home to the Sagrada Família?', 'Madrid', 'Lisbon', 'Seville', 'Barcelona', 3],
  ['Which of these mammals lays eggs?', 'Platypus', 'Sloth', 'Otter', 'Koala', 0],
  [
    'Which color sits opposite purple on a traditional artist’s color wheel?',
    'Red',
    'Yellow',
    'Blue',
    'Orange',
    1,
  ],
  ['Which element has the chemical symbol Fe?', 'Fluorine', 'Francium', 'Iron', 'Gold', 2],
  ['Which game starts with sixteen pieces per player?', 'Checkers', 'Backgammon', 'Dominoes', 'Chess', 3],
  ['Which ocean lies between Africa and Australia?', 'Pacific', 'Indian', 'Atlantic', 'Arctic', 1],
  ['How many hearts does an octopus have?', 'One', 'Two', 'Three', 'Four', 2],
  [
    'Which fruit can have more than 200 seeds on its outer surface?',
    'Strawberry',
    'Mango',
    'Banana',
    'Papaya',
    0,
  ],
  ['In which sport would you attempt a slam dunk?', 'Volleyball', 'Basketball', 'Tennis', 'Handball', 1],
  [
    'Which author created Sherlock Holmes?',
    'Agatha Christie',
    'Jules Verne',
    'Arthur Conan Doyle',
    'Mary Shelley',
    2,
  ],
  ['Which moon is the largest in our solar system?', 'Europa', 'Titan', 'Io', 'Ganymede', 3],
  ['How many strings does a standard violin have?', 'Four', 'Five', 'Six', 'Eight', 0],
  [
    'Which pasta is shaped like little tubes with diagonal ends?',
    'Farfalle',
    'Penne',
    'Fusilli',
    'Linguine',
    1,
  ],
  ['Which country gave the Statue of Liberty to the United States?', 'Italy', 'Canada', 'France', 'Spain', 2],
  ['Which is the smallest prime number?', 'Zero', 'One', 'Three', 'Two', 3],
  ['Which word names a group of wolves?', 'Pack', 'School', 'Flock', 'Colony', 0],
  ['Which artist painted The Starry Night?', 'Monet', 'Van Gogh', 'Klimt', 'Dalí', 1],
  ['Which dance originated in Argentina and Uruguay?', 'Polka', 'Waltz', 'Tango', 'Flamenco', 2],
  [
    'Which geometric solid has six square faces?',
    'Tetrahedron',
    'Prism with triangular bases',
    'Octahedron',
    'Cube',
    3,
  ],
  ['Which planet has the Great Red Spot?', 'Jupiter', 'Saturn', 'Neptune', 'Uranus', 0],
  ['What does a seismograph record?', 'Wind speed', 'Ground motion', 'Rainfall', 'Moon phases', 1],
];

export type Game = (typeof import('../contract/rooms').gameIds)[number];
export type RoundData = { text: string; options: string[]; correct: number };
export type GameModule = {
  maxPlayers: number;
  duration: number;
  prepare(rounds: number): RoundData[];
  signalDelay(): number;
  // value is the chosen answer for quizzes and the reaction time in milliseconds for reaction rounds.
  score(round: RoundData, value: number, now: number, start: number): number;
};

export class GameError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export const games: Record<Game, GameModule> = {
  pyramid: {
    maxPlayers: 8,
    duration: 0,
    prepare: () => [],
    signalDelay: () => 0,
    score() {
      throw new GameError('Use the Pyramid controls.');
    },
  },
  settlers: {
    maxPlayers: 4,
    duration: 0,
    prepare: () => [],
    signalDelay: () => 0,
    score() {
      throw new GameError('Use the island controls.');
    },
  },
  turbo: {
    maxPlayers: 4,
    duration: raceDuration,
    prepare: () => [],
    signalDelay: () => 0,
    score() {
      throw new GameError('Use your driving controls.');
    },
  },
  quiz: {
    maxPlayers: 12,
    duration: 15000,
    prepare(count) {
      const pool = [...questions];
      return Array.from({ length: count }, () => {
        const q = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
        return { text: q[0], options: q.slice(1, 5) as string[], correct: q[5] };
      });
    },
    signalDelay: () => 0,
    score(round, value, now, start) {
      if (!Number.isInteger(value) || value < 0 || value > 3) throw new GameError('Choose one answer.');
      return value === round.correct ? 500 + Math.max(0, Math.round(500 * (1 - (now - start) / 15000))) : 0;
    },
  },
  reaction: {
    maxPlayers: 8,
    duration: 10000,
    prepare: (count) =>
      Array.from({ length: count }, () => ({
        text: 'React when the signal lights up!',
        options: [],
        correct: -1,
      })),
    signalDelay: () => 2000 + Math.floor(Math.random() * 3000),
    score: (_round, value) => Math.max(50, 1000 - Math.round(value / 5)),
  },
};
