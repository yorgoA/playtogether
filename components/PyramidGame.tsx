'use client';

import { useState } from 'react';
import type { PyramidView } from '@/lib/contract';
import type { Room, useRoom } from '@/lib/controller/room';
import { pyramidLevels } from '@/lib/pyramid/layout';
import './pyramid.css';

type TableProps = {
  room: Room;
  board: PyramidView;
  busy: boolean;
  command: ReturnType<typeof useRoom>['command'];
};
const suits: Record<string, [string, string]> = { S: ['♠', 'spades'], H: ['♥', 'hearts'], D: ['♦', 'diamonds'], C: ['♣', 'clubs'] };
const names: Record<string, string> = { A: 'Ace', T: '10', J: 'Jack', Q: 'Queen', K: 'King' };

function Card({ card, active = false }: { card?: string | null; active?: boolean }) {
  const suit = card ? suits[card[1]] : undefined;
  const rank = card ? names[card[0]] ?? card[0] : '';
  return <span
    role="img"
    aria-label={suit ? rank + ' of ' + suit[1] : 'Face-down card'}
    className={['pyr-card', suit ? 'pyr-face' : 'pyr-back', card && 'HD'.includes(card[1]) ? 'pyr-red' : '', active ? 'pyr-active' : ''].join(' ')}
  >
    <span aria-hidden="true">{card?.[0] === 'T' ? '10' : card?.[0]}</span>
    <b aria-hidden="true">{suit?.[0] ?? '◇'}</b>
  </span>;
}

function RoundMessage({ board, room }: { board: PyramidView; room: Room }) {
  const name = (id: string) => room.players.find(player => player.id === id)?.name ?? 'A player';
  const { claim, outcome } = board;
  if (claim) return <><strong>{name(claim.from)} claims a match</strong><span>{name(claim.to)}, accept or call the bluff on your phone.</span></>;
  if (outcome) return <>
    <strong>{outcome.verdict === 'bluff' ? 'Bluff caught!' : outcome.verdict === 'match' ? 'It was a match!' : 'Claim accepted'}</strong>
    <span>{name(outcome.loser)} takes {outcome.points} {outcome.points === 1 ? 'penalty point' : 'penalty points'}.</span>
    {outcome.card && <Card card={outcome.card}/>}
  </>;
  return board.index < 0
    ? <><strong>Memorize your four cards</strong><span>When everyone is ready, flip the first card to hide all hands.</span></>
    : <><strong>Match the rank or bluff</strong><span>Make one claim on your phone, or flip the next card if everyone passes.</span></>;
}

export function PyramidTV({ room, board, busy, command }: TableProps) {
  const topDown = [...pyramidLevels].reverse();
  const last = board.index === board.cards.length - 1;
  return <div className="pyr-tv">
    <div className="pyr-scene" aria-label="Five-level card pyramid">
      <div className="pyr-moon" aria-hidden="true"/>
      <div className="pyr-steps">
        {topDown.map((size, row) => {
          const start = topDown.slice(row + 1).reduce((sum, count) => sum + count, 0);
          return <div className="pyr-tier" key={size} style={{ width: (36 + row * 16) + '%' }}>
            <div className="pyr-tier-cards">
              {board.cards.slice(start, start + size).map((card, slot) =>
                <Card key={start + slot} card={card} active={board.index === start + slot}/>)}
            </div>
            <span className="pyr-level">{5 - row}</span>
          </div>;
        })}
      </div>
    </div>
    <div className="pyr-tv-controls">
      <div className="pyr-message" role="status"><RoundMessage board={board} room={room}/></div>
      <button className="pt-primary" onClick={() => command({action:'pyramidFlip',index:board.index})}
        disabled={busy || Boolean(board.claim) || room.phase !== 'playing'}>
        {last ? 'Finish pyramid' : board.index < 0 ? 'Flip first card' : 'Flip next card'}
      </button>
    </div>
  </div>;
}

export function PyramidPhone({ board, room, busy, command, id }: TableProps & { id: string }) {
  const [slot, setSlot] = useState<number>();
  const [target, setTarget] = useState('');
  const opponents = room.players.filter(player => player.id !== id && player.connected);
  const selectedTarget = opponents.find(player => player.id === target)?.id ?? opponents[0]?.id ?? '';
  const canClaim = !board.claim && !board.outcome && board.slots?.some(Boolean) && opponents.length > 0;
  if (board.index < 0) return <div className="pyr-phone">
    <h2>Memorize your cards</h2>
    <p>Remember each rank and its slot. The host’s first flip hides your hand.</p>
    <div className="pyr-hand">{board.hand?.map((card, index) =>
      <div key={card}><Card card={card}/><span>Slot {index + 1}</span></div>)}</div>
  </div>;
  return <div className="pyr-phone">
    <div className="pyr-phone-status">
      <Card card={board.cards[board.index]}/>
      <div className="pyr-message" role="status"><RoundMessage board={board} room={room}/></div>
    </div>
    {board.claim?.to === id && <div className="pt-actions">
      <button className="pt-secondary" disabled={busy} onClick={() => command({action:'pyramidReply',index:board.index,call:false})}>Accept</button>
      <button className="pt-primary" disabled={busy} onClick={() => command({action:'pyramidReply',index:board.index,call:true})}>Call bluff</button>
    </div>}
    {canClaim && <>
      <div className="pyr-hand" aria-label="Choose a card slot">
        {board.slots?.map((available, index) => <button key={index} type="button" disabled={busy || !available}
          aria-pressed={slot === index} onClick={() => setSlot(index)}>
          <span aria-hidden="true">{available ? '◇' : '—'}</span> Slot {index + 1}
        </button>)}
      </div>
      <label className="pyr-target">Send claim to
        <select value={selectedTarget} onChange={event => setTarget(event.target.value)} disabled={busy}>
          {opponents.map(player => <option key={player.id} value={player.id}>{player.name}</option>)}
        </select>
      </label>
      <button className="pt-primary" disabled={busy || slot === undefined || !board.slots?.[slot]} onClick={async () => {
        if (await command({action:'pyramidClaim',index:board.index,slot,target:selectedTarget})) setSlot(undefined);
      }}>Claim a match</button>
    </>}
    {!board.claim && !board.outcome && !board.slots?.some(Boolean) && <p>Your four cards are spent. You can still call bluffs.</p>}
  </div>;
}
