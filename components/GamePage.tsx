'use client';
import {useEffect,useRef,useState} from 'react';
import {ChevronLeft,Heart,Lock,Play,Timer,Trophy,Users,Shapes} from 'lucide-react';
import type {Game} from '../lib/catalog';
import type {Viewer} from './HubProfile';
import {gameAchievements,loadProgress,type Earned} from '../lib/controller/achievements';
import './gamepage.css';

const day=(ms:number)=>new Date(ms).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});

// A game's own page, opened from a card in the hub, which also handles Back on the remote.
export default function GamePage({game,viewer,favourite,onFavourite,onPlay,onBack,onSignIn}:{game:Game;viewer:Viewer|null;favourite:boolean;onFavourite:()=>void;onPlay:()=>void;onBack:()=>void;onSignIn:()=>void}){
 const first=useRef<HTMLButtonElement>(null),[progress,setProgress]=useState<{of:string;earned:Earned[]}|null>(null);
 useEffect(()=>{window.scrollTo(0,0);first.current?.focus({preventScroll:true})},[game.id]);
 useEffect(()=>{if(!viewer)return;let live=true;loadProgress().then(earned=>{if(live)setProgress({of:viewer.id,earned})});return ()=>{live=false}},[viewer]);
 // Only the signed-in player's own progress counts, never a previous player's.
 const earned=viewer&&progress?.of===viewer.id?progress.earned:[];
 const all=gameAchievements(game.id,!!viewer?.adult),when=new Map(earned.map(e=>[e.id,e.earnedAt]));
 const got=all.filter(a=>when.has(a.id)).sort((a,b)=>when.get(b.id)!-when.get(a.id)!),left=all.filter(a=>!when.has(a.id)).sort((a,b)=>+!!a.secret-+!!b.secret);
 const shown=viewer?[...got,...left]:all.filter(a=>!a.secret);
 const words=game.name.split(' ');
 return <div className="gamePage">
  <section className={'gameHero hero-'+game.art} style={{backgroundImage:'url(/art/'+game.art+(game.group==='After hours'||game.art==='storm'?'.svg)':'.webp)')}}>
   <div className="gameHeroShade"/>
   <button className="gameBack" aria-label="Back to games" onClick={onBack}><ChevronLeft/>Games</button>
   <div className="gameHeroContent">
    <div className="kicker">{game.group}</div>
    <h1>{words[0]} <em>{words.slice(1).join(' ')}</em></h1>
    <p>{game.description}</p>
    <div className="actions">
     {game.live?<button ref={first} className="primary" data-remote-start onClick={onPlay}><Play fill="currentColor"/>Play</button>:<strong className="coming">Coming soon</strong>}
     <button ref={game.live?undefined:first} className="secondary favoriteBtn" aria-pressed={favourite} onClick={onFavourite}><Heart fill={favourite?'currentColor':'none'}/>{favourite?'In your favourites':'Add to favourites'}</button>
    </div>
   </div>
  </section>
  <div className="gameBody">
   <section className="gameInfo" tabIndex={0} aria-labelledby="game-info">
    <h2 id="game-info">About the game</h2>
    <dl>
     <div><dt><Users/>Players</dt><dd>{game.players}</dd></div>
     <div><dt><Timer/>Length</dt><dd>{game.duration}</dd></div>
     <div><dt><Shapes/>Genre</dt><dd>{game.genre}</dd></div>
    </dl>
    <h3>How to play</h3>
    <ol>{game.rules.map(r=><li key={r}>{r}</li>)}</ol>
   </section>
   {all.length>0&&<section className="gameAchievements" aria-labelledby="game-achievements">
    <div className="achTop">
     <h2 id="game-achievements"><Trophy/>Achievements</h2>
     {viewer?<span className="achCount"><b>{got.length}</b> of {all.length}</span>:<span className="achCount">{all.length} to earn</span>}
    </div>
    {viewer?<div className="achBar" role="progressbar" aria-label="Achievements earned" aria-valuemin={0} aria-valuemax={all.length} aria-valuenow={got.length}><i style={{width:got.length/all.length*100+'%'}}/></div>
     :<div className="achGuest"><p>Sign in to keep track of your achievements.</p><button className="secondary" onClick={onSignIn}>Sign in</button></div>}
    <ul>{shown.map(a=>{const at=when.get(a.id),locked=a.secret&&at===undefined;
     return <li key={a.id} tabIndex={0} className={at!==undefined?'earned':locked?'locked':''}>
      <span className="achIcon" aria-hidden>{at!==undefined?<Trophy/>:<Lock/>}</span>
      {locked?<div><h3>Secret achievement</h3><p>Keep playing to find it.</p></div>
       :<div><h3>{a.name}{a.funny&&<span className="achTag">Funny</span>}</h3><p>{a.how}</p></div>}
      <span className="achWhen">{at!==undefined?'Earned '+day(at):locked?'Locked':'Not earned yet'}</span>
     </li>})}</ul>
    {!viewer&&all.some(a=>a.secret)&&<p className="achMore">{all.filter(a=>a.secret).length} secret achievements to discover.</p>}
   </section>}
  </div>
 </div>;
}
