// What the profile page shows: achievements, ranks and the player's progress.
//
// PLACEHOLDER until the server work lands:
// - `achievements` copies the spec's first set. The real list comes with #83, as shared game rules.
// - `loadProgress` returns sample progress. Once #94 merges it reads GET /api/profile/progress instead.
// The page only uses the exports below, so swapping these two changes nothing on screen.

export type Group = 'any' | 'quiz' | 'reaction' | 'storm' | 'settlers' | 'kings' | 'pyramid' | 'bots';
export type Achievement = {
  id: string;
  group: Group;
  name: string;
  how: string;
  funny?: boolean;
  adult?: boolean;
  // Shown, with how to earn it, before it is earned. The others stay secret until then.
  visible?: boolean;
};
export type Earned = { id: string; earnedAt: number };

export const groups: { id: Group; title: string; adult?: boolean }[] = [
  { id: 'any', title: 'Any game' },
  { id: 'quiz', title: 'Quiz Volt' },
  { id: 'reaction', title: 'Reaction Duel' },
  { id: 'storm', title: 'Storm Deck' },
  { id: 'settlers', title: 'Island Settlers' },
  { id: 'bots', title: 'Bots' },
  { id: 'kings', title: 'Kings Cup', adult: true },
  { id: 'pyramid', title: 'Pyramid', adult: true },
];

const list = (group: Group, rows: [string, string, Partial<Achievement>?][]): Achievement[] =>
  rows.map(([name, how, extra]) => ({
    id: group + '-' + name.toLowerCase().replace(/[^a-z]+/g, '-'),
    group,
    name,
    how,
    ...extra,
  }));
const shown = { visible: true },
  funny = { funny: true };
const botGames: [Group, string][] = [
  ['quiz', 'Quiz Volt'],
  ['reaction', 'Reaction Duel'],
  ['storm', 'Storm Deck'],
  ['settlers', 'Island Settlers'],
];

// Visible from the start: Any game, Bots, Quiz Volt's two from the spec, and one basic one per other game.
// Which ones are visible is still an open question in #83.
export const achievements: Achievement[] = [
  ...list('any', [
    ['Table for one', 'Finish your first game', shown],
    ['Full house', 'Finish a game with 8 human players', shown],
    ['Tour guide', 'Finish every version 1 game at least once', shown],
    ['Regular', 'Play on 5 different days', shown],
    ['Robot uprising', 'Lose a game to a bot', { ...shown, ...funny }],
  ]),
  ...list('quiz', [
    ['Know-it-all', 'Answer every round right in a 10-round match'],
    ['Power trip', 'Use all your powers in one match', shown],
    ['Saving it for later', 'Finish a match without using a single power', funny],
    ['Jackpot', 'Be the only player to answer right in a jackpot round'],
    ['Sudden death', 'Win a tie-break', shown],
    ['Confidently wrong', 'Answer every round wrong in a match', funny],
    ['Bounce back', "Send a rival's power back with Mirror"],
    ['Under pressure', "Answer right while a rival's Time Crunch is on you"],
    ['High roller', 'Win All In 3 times in one match'],
    ['Bust', 'Lose 1000 points on All In and still win the match', funny],
    ['Comeback', 'Win a match after being last going into the final round'],
  ]),
  ...list('reaction', [
    ['Quickest hand', 'Be the fastest in every draw of a round', shown],
    ['Last one standing', 'Win a round against 7 other players'],
    ['Clean sweep', 'Win every round of a match'],
    ['Shake it', 'Win a round using shake instead of tap'],
    ['Trigger happy', 'Misfire 3 times in one match', funny],
    ['First to fall', 'Fall in the first draw of every round in a match', funny],
  ]),
  ...list('storm', [
    ['On a roll', 'Play a streak of 5 cards in one turn', shown],
    ['Weather the storm', 'Win a game in which the storm broke 3 times'],
    ['Ill wind', 'Use a Gust on the player who then finishes last'],
    ['Calm and collected', 'Clear the storm with a Calm when it is one draw from breaking'],
    ['Back from death', 'Win after holding 15 cards or more'],
    ['Lightning rod', 'Be the one who takes the cards every time the storm breaks in a game', funny],
  ]),
  ...list('settlers', [
    ['Founder', 'Win a game', shown],
    ['Road builder', 'Hold the longest road at the end of a game'],
    ['Army general', 'Hold the strongest army at the end of a game'],
    ['City planner', 'Have 4 cities at once'],
    ['Dealmaker', 'Complete 10 trades with other players in one game'],
    ['Robbed blind', 'Lose cards to the robber 3 times in one game', funny],
  ]),
  ...botGames.flatMap(([game, title]) =>
    list('bots', [
      ['Sparring partner', 'Finish 20 games of ' + title + ' with bots', shown],
      ['Giant slayer', 'Beat the hard bots at ' + title + ' at least once', shown],
      ['Outnumbered', 'Win ' + title + ' with a hard bot in every other seat', shown],
    ]).map((a) => ({ ...a, id: a.id + '-' + game, name: a.name + ' · ' + title })),
  ),
  ...list('bots', [['Bot destroyer', 'Earn all 12 bot achievements', shown]]),
  ...list('kings', [
    ['Royal flush', 'Draw two kings in one game'],
    ['The cup', 'Draw the fourth king'],
    ['Quick reflexes', 'Never be last on floor or heaven in a whole game'],
    ['Lawmaker', 'Make a house rule', shown],
    ['Best mates', "Be someone's mate for a whole game"],
    ['Slow on the floor', 'Be last on floor or heaven 3 times in one game', funny],
  ]).map((a) => ({ ...a, adult: true })),
  ...list('pyramid', [
    ['Poker face', 'Get away with 3 bluffs in one game'],
    ['Lie detector', 'Call 3 bluffs correctly in one game'],
    ['Top of the pyramid', 'Make a claim on the top row', shown],
    ['Elephant memory', 'Make 4 true claims in one game'],
    ['Caught out', 'Have 3 bluffs called in one game', funny],
    ['Doubting Thomas', 'Call a bluff on a real card 3 times in one game', funny],
  ]).map((a) => ({ ...a, adult: true })),
];

// Ranks count every achievement the player can earn. Adult ones only count on an 18+ account.
export const ranks = [
  { name: 'Rookie', share: 25 },
  { name: 'Pro', share: 50 },
  { name: 'Legend', share: 80 },
  { name: 'GOD', share: 100 },
];
export function progress(earned: Earned[], adult: boolean) {
  const all = achievements.filter((a) => adult || !a.adult),
    ids = new Set(earned.map((e) => e.id));
  const count = all.filter((a) => ids.has(a.id)).length,
    share = all.length ? Math.floor((count / all.length) * 100) : 0;
  return { count, total: all.length, share, rank: ranks.filter((r) => share >= r.share).at(-1) };
}

// True while the page shows sample data, so it can say so.
export const sample = true;
const day = 86_400_000,
  examples: [string, number][] = [
    ['any-table-for-one', 40],
    ['any-regular', 12],
    ['any-robot-uprising', 30],
    ['quiz-power-trip', 33],
    ['quiz-sudden-death', 21],
    ['quiz-confidently-wrong', 9],
    ['quiz-comeback', 2],
    ['reaction-quickest-hand', 18],
    ['reaction-trigger-happy', 18],
    ['storm-on-a-roll', 6],
    ['storm-lightning-rod', 5],
    ['settlers-founder', 14],
    ['bots-sparring-partner-quiz', 3],
    ['kings-lawmaker', 25],
    ['bots-giant-slayer-storm', 4],
    ['pyramid-caught-out', 11],
  ];
export async function loadProgress(): Promise<Earned[]> {
  const now = Date.now();
  return examples.map(([id, ago]) => ({ id, earnedAt: now - ago * day }));
}
