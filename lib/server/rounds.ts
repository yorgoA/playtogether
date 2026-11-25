// Rules shared by the games played in rounds.

// A tie for first place after the last round plays one more round, this many times at most.
// The leaders then share the win.
export const maxTiebreaks = 3;

export type RoundRoom = {
  players: { score: number }[];
  round: number;
  // Chosen in the lobby. Tie-break rounds are counted apart so a rematch keeps the choice.
  rounds: number;
  tiebreaks?: number;
};

export const totalRounds = (r: RoundRoom) => r.rounds + (r.tiebreaks ?? 0);

export function tiedForFirst(players: { score: number }[]) {
  const top = Math.max(...players.map((p) => p.score));
  return players.filter((p) => p.score === top).length > 1;
}

// Called once the last round is over. `playable` is false when the game has nothing left for another round.
export function addTiebreak(r: RoundRoom, playable = true) {
  if (!playable || (r.tiebreaks ?? 0) >= maxTiebreaks || !tiedForFirst(r.players)) return false;
  r.tiebreaks = (r.tiebreaks ?? 0) + 1;
  return true;
}
