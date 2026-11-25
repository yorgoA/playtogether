import type {Room} from '@/lib/controller/room';
// In a tie-break only the players level at the top play. Everyone else watches.
export const plays=(room:Room,id:string)=>!room.tiebreak||room.contenders.includes(id);
export const rivals=(room:Room)=>room.players.filter(p=>plays(room,p.id));
export const roundLabel=(room:Room)=>room.tiebreak?'⚔️ TIE-BREAK':'ROUND '+room.round+' / '+room.rounds;
export function rivalNames(room:Room){
 const names=rivals(room).map(p=>p.name);
 return names.length<3?names.join(' vs '):names.slice(0,-1).join(', ')+' and '+names.at(-1);
}
