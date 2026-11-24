"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import type { DuelView, KingsView, QuizView, PyramidView, RoomSnapshot } from '../contract';
export type GameId = RoomSnapshot['game'];
export const games={pyramid:{title:'Pyramid',instructions:'Memorize four cards, then make others drink with a match, or bluff. Called bluffs cost double. Any drink counts, water too.',max:8},kings:{title:'Kings Cup',instructions:'Take turns pulling a card and do what it says. The fourth king drinks the cup. Any drink counts, water too.',max:8},settlers:{title:'Island Settlers',instructions:'Place two settlements and roads, then roll, build and trade. Earn development cards, the longest road and the strongest army. First to ten points wins.',max:4},quiz:{title:'Quiz Volt',instructions:'Every round brings a new theme and new rules. Pick a power, answer on your phone, and watch the TV for the answer.',max:12},reaction:{title:'Reaction Duel',instructions:'A standoff. Wait for the signal, then tap or shake your phone. The slowest falls, until one is left standing.',max:8}};
// Drinks are stored as negative scores, so the lightest drinker ranks first.
export const drinking=(game:GameId)=>game==='pyramid'||game==='kings';
export const scoreText=(game:GameId,score:number)=>drinking(game)?Math.abs(score)+(score===-1?' sip':' sips'):score+' pts';
export const avatars=['🦊','🐼','🐸','🐙','🐯','🐨','🐧','🐱'];
export const colors=['#c3f76a','#bc96ff','#ffae65','#ff83b1','#69dafa','#ffdf75'];
export type Player={bot?:boolean,standIn?:boolean,early?:boolean,reactionMs?:number,gained?:number,id:string,name:string,color:string,avatar:string,score:number,ready:boolean,connected:boolean,answered:boolean};
export type Room={cheers:{n:number,from:string,emoji:string}[],quiz?:QuizView,duel?:DuelView,pausedAt:number,pyramid?:PyramidView,kings?:KingsView,island?:import('../island/board').BoardView,revealing?:boolean,correct?:number|null,code:string,game:GameId,round:number,rounds:number,phase:'lobby'|'playing'|'paused'|'results'|'ended',question:{text:string,options:string[]}|null,deadline:number,signalAt:number|null,serverTime:number,players:Player[]};
export type Seat={code:string,token:string,game?:string,id?:string};
export const hostKey='playtogether.host';
export const phoneKey='playtogether.phone';
export function saved(key:string):Seat|null {try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}}
export class RoomError extends Error {constructor(message:string,readonly status:number){super(message)}}
type ApiPayload={room:Room,code?:string,hostToken?:string,playerId?:string,playerToken?:string,error?:string};
const lost='Connection lost. Trying again may help.';
export async function api(path:string,body?:Record<string,unknown>,token?:string):Promise<{room:Room,code?:string,hostToken?:string,playerId?:string,playerToken?:string}> {
 // Without a limit, a stalled connection would never reach a retry.
 const stop=new AbortController(),timer=setTimeout(()=>stop.abort(),5000);
 try{
 const res=await fetch('/api/rooms'+path,{signal:stop.signal,method:body?'POST':'GET',cache:'no-store',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
 let data:ApiPayload;try{data=await res.json() as ApiPayload}catch(e){if(stop.signal.aborted)throw e;throw new RoomError('The room service is unavailable. Try again in a moment.',res.status)}
 if(!res.ok)throw new RoomError(data.error||'Could not reach the room.',res.status);
 return data;
 }catch(e){throw e instanceof RoomError?e:new Error(lost)}
 finally{clearTimeout(timer)}
}
// randomUUID needs https, which Wi-Fi play lacks.
export const randomId=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
// A secret for one join, so repeating it gives back the same seat.
const joinKey='playtogether.join';
function joinId(code:string):string {
 try{const kept=JSON.parse(sessionStorage.getItem(joinKey)||'null');if(kept?.code===code&&typeof kept.id==='string')return kept.id}catch{}
 const id=randomId();
 try{sessionStorage.setItem(joinKey,JSON.stringify({code,id}))}catch{}
 return id;
}
// Joins a room, asking again when the connection fails but not when the server says no.
export async function joinRoom(code:string,player:{name:string,avatar:string,color:string}) {
 const id=joinId(code);
 for(let tries=1;;tries++){
  try{const r=await api('/'+encodeURIComponent(code),{action:'join',...player,joinId:id});try{sessionStorage.removeItem(joinKey)}catch{}return r}
  catch(e){if(tries>=4||(e instanceof RoomError&&e.status>=400&&e.status<500))throw e;await new Promise(done=>setTimeout(done,700))}
 }
}
export function useRoom(seat:Seat|null,onExpired:()=>void) {
 const [room,setRoom]=useState<Room|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[offline,setOffline]=useState(false),[now,setNow]=useState(Date.now());
 const expire=useRef(onExpired);expire.current=onExpired;
 const current=useRef(seat);current.current=seat;
 const delta=useRef(0), rtt=useRef(Infinity), pending=useRef(false);
 const accept=useCallback((r:Room,sentAt:number)=>{
   // Trust the fastest round trip for clock sync, slowly forgetting it to follow drift.
   const arrived=Date.now(),trip=arrived-sentAt;rtt.current+=1;
   if(trip<=rtt.current){rtt.current=trip;delta.current=r.serverTime-(sentAt+arrived)/2}
   setRoom(prev=>prev?.code===r.code&&prev.serverTime>r.serverTime?prev:r);
 },[]);
 useEffect(()=>{
  setRoom(null);setError('');setOffline(false);rtt.current=Infinity;if(!seat)return;
  let active=true,timeout:ReturnType<typeof setTimeout>,wait=650;
  const poll=async()=>{const sentAt=Date.now();try{const {room:r}=await api('/'+seat.code,undefined,seat.token);if(!active)return;accept(r,sentAt);wait=r.phase!=='playing'?650:r.game==='reaction'?250:r.game==='quiz'?400:650;setOffline(false);setError(was=>was===lost?'':was)}
   catch(e){if(!active)return;if(e instanceof RoomError&&[401,403,404,410].includes(e.status)){expire.current();return}setOffline(true)}
   if(active)timeout=setTimeout(poll,wait);
  };poll();const clock=setInterval(()=>setNow(Date.now()),100);
  return ()=>{active=false;clearTimeout(timeout);clearInterval(clock)};
 },[seat,accept]);
 const command=useCallback(async(body:Record<string,unknown>)=>{
  if(!seat||pending.current)return false;pending.current=true;setBusy(true);setError('');const sentAt=Date.now();
  try{const result=await api('/'+seat.code,body,seat.token);if(current.current===seat)accept(result.room,sentAt);return true}
  catch(e){setError(e instanceof Error?e.message:'Connection failed. Please retry.');return false}
  finally{pending.current=false;setBusy(false)}
 },[seat,accept]);
 const clock=useCallback(()=>Date.now()+delta.current,[]);
 return {room,error,busy,command,offline,clock,now:now+delta.current}
}
// Flips at the exact signal time rather than on the next clock tick.
export function useSignal(room:Room|null,clock:()=>number) {
 const [fired,setFired]=useState<number|null>(null);
 const shownAt=useRef(0);
 const signalAt=room?.signalAt??null,playing=room?.phase==='playing';
 useEffect(()=>{
  if(signalAt===null||!playing)return;
  const timer=setTimeout(()=>{setFired(signalAt);shownAt.current=performance.now()},Math.max(0,signalAt-clock()));
  return ()=>clearTimeout(timer);
 },[signalAt,playing,clock]);
 return {go:signalAt!==null&&fired===signalAt,shownAt};
}
// How fast a player taps after this phone shows a Kings Cup race, sent until the server has it.
export function useRaceTap(seq:number|null,command:(body:Record<string,unknown>)=>Promise<boolean>) {
 const [tap,setTap]=useState<{ms:number}|null>(null),shown=useRef(0);
 useEffect(()=>{shown.current=performance.now();return ()=>setTap(null)},[seq]);
 useEffect(()=>{
  if(seq===null||!tap)return;
  let active=true;
  (async()=>{while(active&&!await command({action:'kings',move:'tap',seq,ms:tap.ms}))await new Promise(done=>setTimeout(done,300))})();
  return ()=>{active=false};
 },[seq,tap,command]);
 return {sending:!!tap,tap(){setTap(was=>was??{ms:Math.max(0,performance.now()-shown.current)})}};
}
// Keeps the first reaction tap of a round and sends it until the server has it, so a lost message costs no time.
export function useTap(room:Room|null,id:string|undefined,command:(body:Record<string,unknown>)=>Promise<boolean>) {
 const [tap,setTap]=useState<{key:string,body:Record<string,unknown>}|null>(null);
 // A pause, restart or new round moves the deadline, which drops an unsent tap.
 const open=room?.game==='reaction'&&room.phase==='playing'&&!room.revealing&&!!id&&!!room.duel?.alive.includes(id)&&!room.players.find(p=>p.id===id)?.answered;
 const key=open?room.duel?.draw+':'+room.deadline:null,body=tap&&tap.key===key?tap.body:null;
 const held=useRef<string|null>(null);
 useEffect(()=>{
  if(!body)return;
  let active=true;
  (async()=>{while(active){if(await command(body)){navigator.vibrate?.(25);return}await new Promise(done=>setTimeout(done,300))}})();
  return ()=>{active=false};
 },[body,command]);
 return {sending:!!body,hold(next:Record<string,unknown>){
  if(!room||!key||held.current===key)return;
  held.current=key;setTap({key,body:{action:'input',round:room.round,draw:room.duel?.draw,...next}});
 }};
}
