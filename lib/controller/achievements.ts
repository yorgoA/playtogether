// PLACEHOLDER until the achievements list (#83) and /api/profile/progress (#94) land.
// The list is the first set from the achievements spec. Which ones are secret is only decided for Quiz Volt;
// elsewhere the first two of each game are visible, as the spec's open question proposes.
type Achievement={id:string;game:string;name:string;how:string;funny?:boolean;adult?:boolean;secret?:boolean};
// The same shape as an entry of `ProgressResponse.achievements` in #94.
export type Earned={id:string;game:string;earnedAt:number};

const list:Record<string,[name:string,how:string,flags?:string][]>={
 quiz:[
  ['Know-it-all','Answer every round right in a 10-round match','secret'],
  ['Power trip','Use all your powers in one match'],
  ['Saving it for later','Finish a match without using a single power','funny secret'],
  ['Jackpot','Be the only player to answer right in a jackpot round','secret'],
  ['Sudden death','Win a tie-break'],
  ['Confidently wrong','Answer every round wrong in a match','funny secret'],
  ['Bounce back',"Send a rival's power back with Mirror",'secret'],
  ['Under pressure',"Answer right while a rival's Time Crunch is on you",'secret'],
  ['High roller','Win All In 3 times in one match','secret'],
  ['Bust','Lose 1000 points on All In and still win the match','funny secret'],
  ['Comeback','Win a match after being last going into the final round','secret'],
 ],
 reaction:[
  ['Quickest hand','Be the fastest in every draw of a round'],
  ['Last one standing','Win a round against 7 other players'],
  ['Clean sweep','Win every round of a match','secret'],
  ['Shake it','Win a round using shake instead of tap','secret'],
  ['Trigger happy','Misfire 3 times in one match','funny secret'],
  ['First to fall','Fall in the first draw of every round in a match','funny secret'],
 ],
 storm:[
  ['On a roll','Play a streak of 5 cards in one turn'],
  ['Weather the storm','Win a game in which the storm broke 3 times'],
  ['Ill wind','Use a Gust on the player who then finishes last','secret'],
  ['Calm and collected','Clear the storm with a Calm when it is one draw from breaking','secret'],
  ['Back from death','Win after holding 15 cards or more','secret'],
  ['Lightning rod','Be the one who takes the cards every time the storm breaks in a game','funny secret'],
 ],
 settlers:[
  ['Founder','Win a game'],
  ['Road builder','Hold the longest road at the end of a game'],
  ['Army general','Hold the strongest army at the end of a game','secret'],
  ['City planner','Have 4 cities at once','secret'],
  ['Dealmaker','Complete 10 trades with other players in one game','secret'],
  ['Robbed blind','Lose cards to the robber 3 times in one game','funny secret'],
 ],
 kings:[
  ['Royal flush','Draw two kings in one game','adult'],
  ['The cup','Draw the fourth king','adult'],
  ['Quick reflexes','Never be last on floor or heaven in a whole game','adult secret'],
  ['Lawmaker','Make a house rule','adult secret'],
  ['Best mates',"Be someone's mate for a whole game",'adult secret'],
  ['Slow on the floor','Be last on floor or heaven 3 times in one game','funny adult secret'],
 ],
 pyramid:[
  ['Poker face','Get away with 3 bluffs in one game','adult'],
  ['Lie detector','Call 3 bluffs correctly in one game','adult'],
  ['Top of the pyramid','Make a claim on the top row','adult secret'],
  ['Elephant memory','Make 4 true claims in one game','adult secret'],
  ['Caught out','Have 3 bluffs called in one game','funny adult secret'],
  ['Doubting Thomas','Call a bluff on a real card 3 times in one game','funny adult secret'],
 ],
};

const slug=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const achievements:Achievement[]=Object.entries(list).flatMap(([game,rows])=>rows.map(([name,how,flags=''])=>({
 id:game+'.'+slug(name),game,name,how,funny:flags.includes('funny'),adult:flags.includes('adult'),secret:flags.includes('secret'),
})));

// A game's achievements as the player may see them: adult ones only on an 18+ account.
export function gameAchievements(game:string,adult:boolean){
 return achievements.filter(a=>a.game===game&&(adult||!a.adult));
}

// Nothing is awarded yet, so a signed-in player has earned nothing. In development a few are earned,
// one of them secret, so every state of the page can be seen.
const demo:Earned[]=['quiz.power-trip','quiz.know-it-all','reaction.quickest-hand','storm.on-a-roll','storm.lightning-rod','settlers.founder','kings.lawmaker','pyramid.poker-face']
 .map((id,i)=>({id,game:id.split('.')[0],earnedAt:Date.UTC(2026,10,3+i*3,20)}));
export async function loadProgress():Promise<Earned[]>{
 return import.meta.env.DEV?demo:[];
}
