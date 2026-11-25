// Rules shared by the games played in rounds.

// A tie for first place after the last round plays one more round, this many times at most.
// The leaders then share the win.
export const maxTiebreaks = 3;

export type RoundRoom = {
  players: { id: string; score: number; bot?: boolean }[];
  round: number;
  // Chosen in the lobby. Tie-break rounds are counted apart so a rematch keeps the choice.
  rounds: number;
  tiebreaks?: number;
  // Who may still win once tie-breaks start: the players tied for first, then those still level.
  contenders?: string[];
};

export const totalRounds = (r: RoundRoom) => r.rounds + (r.tiebreaks ?? 0);

// Whether this player scores and answers in the rounds being played. Everyone does until a tie-break starts.
export const contends = (r: { contenders?: string[] }, id: string) =>
  !r.contenders || r.contenders.includes(id);

// The players tied for first place, or none when one leads. Only contenders count once a tie-break started.
export function tiedForFirst(r: RoundRoom) {
  const field = r.players.filter((p) => contends(r, p.id));
  const top = Math.max(...field.map((p) => p.score));
  const tied = field.filter((p) => p.score === top);
  return tied.length > 1 ? tied : [];
}

// Called once the last round is over. `playable` is false when the game has nothing left for another round.
export function addTiebreak(r: RoundRoom, playable = true) {
  const tied = tiedForFirst(r);
  // Nobody should watch bots play up to three rounds: bots tied alone share the win.
  if (!playable || (r.tiebreaks ?? 0) >= maxTiebreaks || !tied.length || tied.every((p) => p.bot))
    return false;
  r.tiebreaks = (r.tiebreaks ?? 0) + 1;
  r.contenders = tied.map((p) => p.id);
  return true;
}
