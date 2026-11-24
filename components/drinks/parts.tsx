import type {CSSProperties,ReactNode} from 'react';
import type {Player,Room} from '@/lib/controller/room';
const suits:Record<string,[string,string]>={S:['♠','spades'],H:['♥','hearts'],D:['♦','diamonds'],C:['♣','clubs']};
const names:Record<string,string>={A:'Ace',T:'10',J:'Jack',Q:'Queen',K:'King'};
export const sips=(n:number)=>n+(n===1?' sip':' sips');
export const seatColor=(p?:Player)=>({'--seat':p?.color??'#ffd166'}) as CSSProperties;
export const nameOf=(room:Room,id:string)=>room.players.find(p=>p.id===id)?.name??'A player';
export function list(names:string[]){return names.length<2?names.join(''):names.slice(0,-1).join(', ')+' and '+names.at(-1)}
export function Card({card,active=false}:{card?:string|null,active?:boolean}){
 const suit=card?suits[card[1]]:undefined,rank=card?.[0]==='T'?'10':card?.[0];
 return <span role="img" aria-label={card&&suit?(names[card[0]]??card[0])+' of '+suit[1]:'Face-down card'} className={'dr-card'+(suit?'':' back')+(card&&'HD'.includes(card[1])?' red':'')+(active?' active':'')}>{suit&&<><i aria-hidden="true">{rank}<br/>{suit[0]}</i><b aria-hidden="true">{suit[0]}</b></>}</span>;
}
export function Seats({room,turn,badge}:{room:Room,turn?:string,badge?:(p:Player)=>ReactNode}){
 return <aside className="dr-seats" aria-label="Drinks so far">{room.players.map(p=><div key={p.id} className={'dr-seat'+(p.id===turn?' active':'')} style={seatColor(p)}><span className="dr-chip">{p.avatar}</span><span><b>{p.name}</b>{badge?.(p)}</span><strong aria-label={sips(Math.abs(p.score))}>{Math.abs(p.score)}<em>🍺</em></strong></div>)}</aside>;
}
export function People({players,disabled,choose,label}:{players:Player[],disabled:boolean,choose:(id:string)=>void,label:string}){
 return <div className="dr-people" role="group" aria-label={label}>{players.map(p=><button key={p.id} style={seatColor(p)} disabled={disabled} onClick={()=>choose(p.id)}><span className="dr-chip">{p.avatar}</span><b>{p.name}</b></button>)}</div>;
}
export function Drink({amount,why}:{amount:number,why:string}){
 return <div className="dr-drink" role="status"><span aria-hidden="true">🍻</span><strong>Drink {sips(amount)}!</strong><small>{why}</small></div>;
}
