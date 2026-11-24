"use client";
import {useEffect,useRef,useState} from 'react';
import {avatars,colors,games,joinRoom,phoneKey,resultText,saved,useRoom,useSignal,useTap,type Seat} from '@/lib/controller/room';
import {funnyName} from '@/lib/controller/names';
import {IslandPhone} from '@/components/IslandGame';
import {PyramidPhone} from '@/components/PyramidGame';
import {KingsPhone} from '@/components/KingsGame';
import RaceController from '@/components/RaceController';
import MotionControls from '@/components/MotionControls';
import {Ranks} from '@/components/GameSession';
import '@/components/session.css';
export default function Controller(){
 const [seat,setSeat]=useState<Seat|null>(null),[code,setCode]=useState(''),[name,setName]=useState(''),[avatar,setAvatar]=useState(avatars[0]),[color,setColor]=useState(colors[0]),[message,setMessage]=useState(''),[joining,setJoining]=useState(false),[loaded,setLoaded]=useState(false);
 useEffect(()=>{const q=new URLSearchParams(location.search).get('code')?.toUpperCase()||'',s=saved(phoneKey);setCode(q);if(s&&(!q||q===s.code))setSeat(s);setLoaded(true)},[]);
 function forget(){localStorage.removeItem(phoneKey);setSeat(null);setMessage('This connection has ended. Join another room to play.')}
 const {room,error,busy,command,offline,now,clock}=useRoom(seat,forget);
 const me=room?.players.find(p=>p.id===seat?.id);
 // The last name made up for this player. One they typed is never swapped for another.
 const made=useRef('');
 function makeName(){made.current=funnyName(made.current);setName(made.current);return made.current}
 async function join(e:React.FormEvent){e.preventDefault();setJoining(true);setMessage('');
  try{const room=code.trim().toUpperCase();let nick=name.trim()||makeName(),r:Awaited<ReturnType<typeof joinRoom>>;
   for(let tries=1;;tries++){
    try{r=await joinRoom(room,{name:nick,avatar,color});break}
    catch(e){if(tries>=4||nick!==made.current||!(e instanceof Error)||!e.message.includes('nickname is already'))throw e;nick=makeName()}
   }
   const s={code:r.room.code,id:r.playerId!,token:r.playerToken!};localStorage.setItem(phoneKey,JSON.stringify(s));setSeat(s)}catch(e){setMessage(e instanceof Error?e.message:'Unable to join. Try again.')}finally{setJoining(false)}}
 const {go,shownAt}=useSignal(room,clock),tap=useTap(room,seat?.id,command);
 function react(){tap.hold(go?{reactionMs:Math.max(0,performance.now()-shownAt.current)}:{early:true})}
 async function answer(value:number){if(!room||room.phase!=='playing'||me?.answered||busy)return;
  if(await command({action:'input',round:room.round,value}))navigator.vibrate?.(25)}
 return <main className="pt-phone"><header className="pt-session-nav"><a className="pt-session-brand" href="/"><img width="35" height="35" src="/favicon.svg" alt=""/><span>Play<span style={{color:"var(--pt-lime)"}}>Together</span></span></a>{seat&&<span className="pt-room-tag">{seat.code}</span>}</header>
 {!loaded?<p>Opening controller…</p>:!seat?<form onSubmit={join} className="pt-pane pt-join"><small>PHONE CONTROLLER</small><h1>Join a room</h1><label>Room code<input autoComplete="off" autoCapitalize="characters" placeholder="Enter room code" value={code} onChange={e=>setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''))} required maxLength={8}/></label><div className="pt-nickname"><label htmlFor="nickname">Nickname</label><div><input id="nickname" autoComplete="nickname" placeholder="Blank = funny name" value={name} maxLength={20} onChange={e=>setName(e.target.value)}/><button type="button" aria-label="Make up a funny nickname" disabled={joining} onClick={makeName}>🎲</button></div></div>
 <fieldset><legend>Avatar</legend><div className="pt-picks">{avatars.map(a=><button type="button" key={a} aria-label={'Use '+a+' avatar'} aria-pressed={avatar===a} onClick={()=>setAvatar(a)}>{a}</button>)}</div></fieldset>
 <fieldset><legend>Player color</legend><div className="pt-picks">{colors.map((c,i)=><button type="button" key={c} className="pt-swatch" style={{background:c}} aria-pressed={color===c} aria-label={['Lime','Violet','Orange','Pink','Blue','Yellow'][i]} onClick={()=>setColor(c)}>{c===color?'✓':''}</button>)}</div></fieldset>
 {message&&<p role="alert">{message}</p>}<button className="pt-primary" disabled={!code.trim()||joining}>{joining?'Joining…':'Join room'}</button></form>
 :!room?<div className="pt-pane"><h2>{offline?'Reconnecting…':'Connecting…'}</h2></div>:<>
 <div className="pt-game-head"><div><small>YOUR CONTROLLER</small><h1>{games[room.game].title}</h1></div></div><div className="pt-pane">
 {me&&<div className="pt-person"><span className="pt-avatar" style={{background:me.color}}>{me.avatar}</span><b>{me.name}</b><small>{resultText(room,me)}</small></div>}
 {room.phase==='lobby'?<><h2>{me?.ready?'You’re ready!':'Ready to play?'}</h2><p>{games[room.game].instructions}</p><button className="pt-primary" disabled={busy} onClick={()=>command({action:'ready',ready:!me?.ready})}>{me?.ready?'Cancel ready':'I’m ready'}</button><p>{room.players.filter(p=>p.ready).length} of {room.players.length} ready</p></>
 :room.phase==='paused'?<h2>Game paused</h2>:room.phase==='results'?<><h2>Final rankings</h2><Ranks room={room}/><p>Stay connected for the next match.</p></>
 :room.phase==='ended'?<><h2>Session ended</h2><button className="pt-primary" onClick={forget}>Join another room</button></>
 :room.game==='pyramid'&&room.pyramid?<PyramidPhone key={room.pyramid.index} room={room} board={room.pyramid} id={seat.id!} command={command} busy={busy}/>
 :room.game==='kings'&&room.kings?<KingsPhone room={room} board={room.kings} id={seat.id!} command={command} busy={busy}/>
 :room.game==='settlers'&&room.island?<IslandPhone key={room.island.phase==='discard'?'discard-'+room.island.rolledAt:room.island.revision} room={room} id={seat.id!} command={command} busy={busy}/>:room.game==='turbo'?null:<><div className="pt-row"><small>ROUND {room.round} / {room.rounds}</small><strong>{Math.max(0,Math.ceil((room.deadline-now)/1000))}s</strong></div>
 {room.revealing?<div className="pt-reveal"><small>ROUND RESULT</small><h2>{room.game==='quiz' ? room.question?.options[room.correct??-1] : me?.early ? 'Too soon!' : me?.reactionMs!=null ? me.reactionMs+' ms' : 'Time’s up'}</h2><p>{room.game==='quiz'?'Correct answer · ':''}+{me?.gained??0} points</p></div>:me?.answered?<><h2>{me.early?'Too soon!':'Locked in!'}</h2><p>Watch the TV for the next round.</p></>:room.game==='quiz'?<><h2>{room.question?.text}</h2><div className="pt-options">{room.question?.options.map((o,i)=><button key={o} disabled={busy} onClick={()=>answer(i)}><b>{'ABCD'[i]}</b>{o}</button>)}</div></>:<><h2>{tap.sending?'Sending your tap…':go?'GO!':'Wait for GO…'}</h2><button className="pt-reaction" disabled={tap.sending} onPointerDown={react} onClick={e=>{if(e.detail===0)react()}}>{tap.sending?'TAPPED':go?'TAP!':'WAIT'}</button></>}</>}
 {room.game==='turbo'&&['lobby','playing','paused'].includes(room.phase)&&<RaceController seat={seat} room={room} now={now}/>}
 {room.game==='reaction'&&room.phase!=='ended'&&<MotionControls onShake={react}/>}
 {(error||offline)&&<p role="status">{error||'Connection lost. Reconnecting…'}</p>}</div></>}</main>
}
