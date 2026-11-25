"use client";
import {useEffect,useState} from 'react';
import {api,drinking,scoreText,games,hostKey,RoomError,saved,useRoom,useSignal,type GameId,type Room,type Seat} from '@/lib/controller/room';
import RoomQR from './RoomQR';
import {IslandTV} from './IslandGame';
import {PyramidTV} from './PyramidGame';
import {KingsTV} from './KingsGame';
import {StormTV} from './StormGame';
import {QuizTV} from './QuizGame';
import {roundLabel} from './tiebreak';
import Podium from './Podium';
import {Cheers} from './Cheers';
import {isMuted,setMuted} from '@/lib/controller/sound';
import {DuelTV} from './DuelGame';
import {botSeats,difficulties,type Difficulty} from '@/lib/bots/rules';
import {roundChoices} from '@/lib/quiz/rounds';
import './session.css';
// Where phones can reach this server. Empty on localhost without a LAN address.
function phoneOrigin(){
 if(typeof window==='undefined')return {url:'',local:''};
 const local=window.location.origin;
 if(!/^(localhost|.*\.localhost|127\.\d+\.\d+\.\d+|\[::1\])$/.test(window.location.hostname))return {url:local,local};
 const lan=import.meta.env.VITE_LAN_HOST;
 return {url:lan?window.location.protocol+'//'+lan+(window.location.port?':'+window.location.port:''):'',local};
}
const booting=new Map<string,Promise<Seat>>();
async function openHost(game:GameId){
 let host=saved(hostKey);
 if(host){
  try{const result=await api('/'+host.code,undefined,host.token);
   if(result.room.phase==='ended')host=null;
   else if(result.room.game!==game){if(result.room.players.length>games[game].max)throw new Error('This game supports up to '+games[game].max+' players. Choose another game for this room.');if(result.room.phase!=='lobby')await api('/'+host.code,{action:'lobby'},host.token);await api('/'+host.code,{action:'configure',game},host.token)}
  }catch(e){if(e instanceof RoomError&&[401,403,404,410].includes(e.status))host=null;else throw e}
 }
 if(!host){const r=await api('',{game});host={code:r.code!,token:r.hostToken!,game}}
 host.game=game;localStorage.setItem(hostKey,JSON.stringify(host));return host;
}
export function Ranks({room}:{room:Room}){
 const players=[...room.players].sort((a,b)=>b.score-a.score);
 return <ol className="pt-ranks">{players.map((p,i)=><li key={p.id}><span className="pt-rank-num">{players.findIndex(person=>person.score===p.score)+1}</span><span className="pt-avatar" style={{background:p.color}}>{p.avatar}</span><b>{p.name}</b><span>{scoreText(room.game,p.score)}</span></li>)}</ol>
}
export default function GameSession({game,onExit}:{game:string,onExit:()=>void}){
 const selected:GameId=Object.hasOwn(games,game)?game as GameId:'quiz';
 const [seat,setSeat]=useState<Seat|null>(null),[initError,setInitError]=useState(''),[retry,setRetry]=useState(0),[confirm,setConfirm]=useState(false),[quiet,setQuiet]=useState(false),[level,setLevel]=useState<Difficulty>('normal');
 useEffect(()=>setQuiet(isMuted()),[]);
 const {room,error,busy,command,offline,now,clock}=useRoom(seat,()=>{localStorage.removeItem(hostKey);setSeat(null);setInitError('This room has closed.')});
 const {go}=useSignal(room,clock);
 useEffect(()=>{let active=true;setInitError('');
  if(!booting.has(selected))booting.set(selected,openHost(selected).finally(()=>booting.delete(selected)));
  booting.get(selected)!.then(s=>{if(active)setSeat(s)}).catch(e=>{if(active)setInitError(e.message)});
  return ()=>{active=false};
 },[selected,retry]);
 const canStart=room&&room.players.some(p=>!p.bot)&&room.players.length>=(room.game==='quiz'?1:2)&&room.players.length<=games[room.game].max&&room.players.every(p=>p.ready&&p.connected);
 const winners=room?.players.filter(p=>p.score===Math.max(...room.players.map(other=>other.score)))??[];
 const origin=phoneOrigin();
 const joinUrl=seat?(origin.url||origin.local)+'/join?code='+encodeURIComponent(seat.code):'';
 const missing=room?.players.filter(p=>!p.bot&&!p.connected&&!p.standIn)??[];
 const midIsland=room?.game==='settlers'&&!!room.island&&room.phase!=='results';
 const back=<button className="pt-secondary" onClick={onExit}>Game library</button>;
 const over=room?.phase==='results';
 const seats=room?botSeats[room.game]??0:0,bots=room?.players.filter(p=>p.bot).length??0;
 // Island bots play one way, so only other games offer a level.
 const levels=room?.game!=='settlers';
 return <main className="pt-session"><header className="pt-session-nav"><span className="pt-session-brand"><img width="35" height="35" src="/favicon.svg" alt=""/><span>Play<span style={{color:"var(--pt-lime)"}}>Together</span></span></span><button className="pt-secondary sound-button" aria-pressed={!quiet} onClick={()=>{setMuted(!quiet);setQuiet(!quiet)}}>{quiet?'🔇 Sound off':'🔊 Sound on'}</button>{back}</header>
 {!room?<div className="pt-pane"><h1>{initError?'Room unavailable':'Opening your room…'}</h1><p>{initError||'Connecting to the game server.'}</p>{initError&&<button className="pt-primary" onClick={()=>setRetry(retry+1)}>Try again</button>}</div>:<>
 <div className="pt-game-head"><div><small>{room.phase==='lobby'?'GAME LOBBY':over?'FINAL SCORES':'NOW PLAYING'}</small><h1>{games[room.game].title}</h1></div><span className="pt-room-tag">Room <b>{room.code}</b></span></div>
 <Cheers key={room.code} room={room}/>
 {(error||offline)&&<p className="pt-notice" role="status">{error||'Reconnecting to the room…'}</p>}
 {room.phase!=='lobby'&&room.phase!=='ended'&&missing.map(p=><p key={p.id} className="pt-notice" role="status">{p.name} disconnected. They can rejoin with the same nickname{midIsland?', or a bot can play until they return. ':'. '}<button className="pt-text" disabled={busy} onClick={()=>command({action:midIsland?'standIn':'kick',playerId:p.id})}>{midIsland?'Let a bot play':'Remove player'}</button></p>)}
 {room.phase==='lobby'?<div className="pt-lobby">
 <section className="pt-pane pt-scan">{origin.url?<><RoomQR url={joinUrl}/><h2>Scan to join</h2><p>Open the camera on your phone, or visit the controller page and enter the code.</p></>:<><h2>Phones can’t reach this address</h2><p className="pt-notice" role="status">This page is open on localhost, which only works on this computer. Run <code>npm run dev:lan</code> so phones on your Wi-Fi can join. You can still test the controller on this computer:</p></>}<a href={joinUrl} target="_blank" rel="noreferrer">{joinUrl.split('?')[0].replace(/^https?:\/\//,'')}</a><strong className="pt-code">{room.code}</strong></section>
 <section className="pt-pane"><h2>Players <span>{room.players.length} / {games[room.game].max}</span></h2>
 {!room.players.length&&<div className="pt-wait"><strong>Waiting for players</strong><p>{room.game==='settlers'?'Join with a phone, then add friends or bots for two to four seats.':room.game==='storm'||room.game==='reaction'?'Join with a phone, then add friends or bots for two to eight seats.':drinking(room.game)?'Scan the code with two to eight phones.':'Scan the code with your phone to play solo, or add friends or bots.'}</p></div>}
 <div className="pt-roster">{room.players.map(p=><div key={p.id} className="pt-person"><span className="pt-avatar" style={{background:p.color}}>{p.avatar}</span><b>{p.name}</b>{p.bot&&p.difficulty&&levels&&<small className={'pt-level '+p.difficulty}>{p.difficulty}</small>}{p.bot?<button className="pt-text" disabled={busy} onClick={()=>command({action:'kick',playerId:p.id})}>Remove bot</button>:!p.connected?<button className="pt-text" onClick={()=>command({action:'kick',playerId:p.id})}>Remove disconnected player</button>:<small>{p.ready?'Ready':'Getting ready'}</small>}</div>)}</div>
 {seats>0&&<div className="pt-bots">{levels&&<div role="group" aria-label="Bot level">{difficulties.map(d=><button key={d} className="pt-secondary" aria-pressed={level===d} onClick={()=>setLevel(d)}>{d}</button>)}</div>}<button className="pt-secondary" disabled={busy||room.players.length>=games[room.game].max||bots>=seats} onClick={()=>command({action:'addBot',...(levels?{difficulty:level}:{})})}>🤖 Add bot <small>{bots} / {seats}</small></button></div>}
 {roundChoices[room.game]&&<label className="pt-round-label">Rounds <select value={room.rounds} disabled={busy} onChange={e=>command({action:'configure',rounds:Number(e.target.value)})}>{roundChoices[room.game]!.map(n=><option key={n}>{n}</option>)}</select></label>}
 <p>{games[room.game].instructions}</p>{room.game==='quiz'&&<p className="qz-credit">Questions from the <a className="pt-text" href="https://opentdb.com" target="_blank" rel="noreferrer">Open Trivia Database</a> (CC BY-SA 4.0).</p>}<button className="pt-primary" disabled={!canStart||busy} onClick={()=>command({action:'start'})}>Start game</button></section></div>
 :over?<section className="pt-pane">{drinking(room.game)?<><h2>{winners.map(p=>p.name).join(' & ')} stayed the most sober!</h2><Ranks room={room}/></>:<Podium room={room}/>}<div className="pt-actions"><button className="pt-primary" disabled={busy} onClick={()=>command({action:'restart'})}>Rematch</button><button className="pt-secondary" disabled={busy} onClick={async()=>{if(await command({action:'lobby'}))onExit()}}>Choose another game</button></div></section>
 :room.phase==='ended'?<section className="pt-pane"><h2>Session ended</h2>{back}</section>
 :<section className="pt-pane play-floor">{room.game!=='settlers'&&room.game!=='storm'&&!drinking(room.game)&&<div className="pt-row"><small>{roundLabel(room)}</small></div>}
 {room.storm?<StormTV room={room} board={room.storm} now={now}/>:room.game==='kings'&&room.kings?<KingsTV room={room} board={room.kings} command={command} busy={busy}/>:room.game==='pyramid'&&room.pyramid?<PyramidTV room={room} board={room.pyramid} command={command} busy={busy}/>:room.game==='settlers'?<IslandTV room={room}/>:room.quiz?<QuizTV room={room} quiz={room.quiz} now={now}/>:room.duel?<DuelTV room={room} duel={room.duel} go={go}/>:null}
 <div className="pt-actions"><button className="pt-secondary" disabled={busy} onClick={()=>command({action:room.phase==='paused'?'resume':'pause'})}>{room.phase==='paused'?'Resume':'Pause'}</button><button className="pt-secondary" disabled={busy} onClick={()=>command({action:'restart'})}>Restart match</button><button className="pt-secondary" disabled={busy} onClick={()=>command({action:'lobby'})}>Return to lobby</button></div></section>}
 {room.phase!=='ended'&&<footer className="pt-room-foot">{confirm?<><span>End this room for everyone?</span><button className="pt-secondary" onClick={()=>setConfirm(false)}>Cancel</button><button className="pt-secondary" onClick={async()=>{if(await command({action:'end'})){localStorage.removeItem(hostKey);onExit()}}}>End room</button></>:<button className="pt-text" onClick={()=>setConfirm(true)}>End session</button>}</footer>}
 </>}</main>
}
