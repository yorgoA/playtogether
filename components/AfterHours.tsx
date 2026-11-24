'use client';
import {useEffect,useState} from 'react';
import {LockKeyhole,Martini} from 'lucide-react';
import type {Viewer} from './HubProfile';
type TableGame={name:string;rule:string;rounds:string[]};
export default function AfterHours({viewer,login}:{viewer:Viewer|null;login:()=>void}){
 const [games,setGames]=useState<TableGame[]>([]),[game,setGame]=useState<TableGame|null>(null),[round,setRound]=useState(0),[error,setError]=useState('');
 useEffect(()=>{if(!viewer?.adult)return;const controller=new AbortController();fetch('/api/after-hours',{signal:controller.signal}).then(async r=>{if(!r.ok)throw Error();setGames((await r.json() as {games:TableGame[]}).games)}).catch(()=>{if(!controller.signal.aborted)setError('Sign in again to open this shelf.')});return ()=>controller.abort()},[viewer]);
 return <section className="catalog"><h2>After hours <small>18+</small></h2>{!viewer?.adult?<div className="lockedShelf"><div className="frost" aria-hidden="true"/><div><LockKeyhole/><strong>{viewer?'For players 18 and over':'Sign in to view drinking games'}</strong>{!viewer&&<button className="secondary" onClick={login}>Sign in</button>}</div></div>:game?<div className="tableRound"><small>{game.name} · {round+1} / {game.rounds.length}</small><h3>{game.rounds[round]}</h3><p>{game.rule}</p><button className="primary" onClick={()=>round+1<game.rounds.length?setRound(round+1):setGame(null)}>{round+1<game.rounds.length?'Next round':'Finish game'}</button> <button className="secondary" onClick={()=>setGame(null)}>Back to games</button></div>:<div className="shelf">{games.map(g=><button className="nightCard" key={g.name} onClick={()=>{setRound(0);setGame(g)}}><Martini/><strong>{g.name}</strong><span>Table game · 5 rounds</span></button>)}{error&&<p role="alert">{error}</p>}</div>}</section>
}
