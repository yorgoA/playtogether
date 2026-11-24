"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
export type GameId='quiz'|'reaction'|'turbo'|'settlers';
export const games={settlers:{title:'Island Settlers',instructions:'Place two settlements and roads, then roll, build and trade. First to six points wins.',max:4},quiz:{title:'Quiz Volt',instructions:'Read the question on the TV and tap your answer before time runs out.',max:12},reaction:{title:'Reaction Duel',instructions:'Wait for GO on the TV. Tap your phone or give it a small shake as fast as you can.',max:8},turbo:{title:'Turbo Racers',instructions:'Race three laps. Steer around hazards, cross cyan boost pads, and hold Drift while steering. Release when charged for a boost.',max:4}};
export const avatars=['🦊','🐼','🐸','🐙','🐯','🐨','🐧','🐱'];
export const colors=['#c3f76a','#bc96ff','#ffae65','#ff83b1','#69dafa','#ffdf75'];
export type Player={bot?:boolean,standIn?:boolean,early?:boolean,reactionMs?:number,gained?:number,id:string,name:string,color:string,avatar:string,score:number,ready:boolean,connected:boolean,answered:boolean};
export type Racer={impactUntil?:number,driftCharge?:number,driftDirection?:number,id:string,progress:number,lane:number,speed:number,boostReadyAt:number,boostUntil:number,finishedAt:number|null};
export type Room={island?:import('../island/board').BoardView,revealing?:boolean,correct?:number|null,hazards:{at:number,lane:number}[],pads?:{at:number,lane:number}[],racers:Racer[],code:string,game:GameId,round:number,rounds:number,phase:'lobby'|'playing'|'paused'|'results'|'ended',question:{text:string,options:string[]}|null,deadline:number,signalAt:number|null,serverTime:number,players:Player[]};
export type Seat={code:string,token:string,game?:string,id?:string};
export const hostKey='playtogether.host';
export const phoneKey='playtogether.phone';
export function saved(key:string):Seat|null {try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}}
export class RoomError extends Error {constructor(message:string,readonly status:number){super(message)}}
type ApiPayload={room:Room,code?:string,hostToken?:string,playerId?:string,playerToken?:string,error?:string};
export async function api(path:string,body?:Record<string,unknown>,token?:string):Promise<{room:Room,code?:string,hostToken?:string,playerId?:string,playerToken?:string}> {
 const res=await fetch('/api/rooms'+path,{method:body?'POST':'GET',cache:'no-store',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
 let data:ApiPayload;try{data=await res.json() as ApiPayload}catch{throw new RoomError('The room service is unavailable. Try again in a moment.',res.status)}
 if(!res.ok)throw new RoomError(data.error||'Could not reach the room.',res.status);
 return data;
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
  const poll=async()=>{const sentAt=Date.now();try{const {room:r}=await api('/'+seat.code,undefined,seat.token);if(!active)return;accept(r,sentAt);wait=r.phase==='playing'&&(r.game==='turbo'||r.game==='reaction')?250:650;setOffline(false)}
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
