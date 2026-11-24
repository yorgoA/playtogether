"use client";
import {useEffect,useRef,useState} from 'react';
import {Gamepad2,LayoutGrid,History,House,Smartphone,Play,Users,Timer,Layers,Info,X,ChevronLeft,ChevronRight,Radio,AudioLines,HelpCircle,Check,ChevronDown,Search,Heart,UserCircle,Pause} from 'lucide-react';
import {games,type Game} from '../lib/catalog';
import GameSession from '../components/GameSession';
import HubProfile, {type Viewer} from '../components/HubProfile';
import AfterHours from '../components/AfterHours';
const categories = [
  { id: 'party', title: 'Party', art: 'party' },
  { id: 'board-strategy', title: 'Board & strategy', art: 'settlers' },
  { id: 'racing', title: 'Racing', art: 'turbo' },
  { id: 'arcade', title: 'Arcade', art: 'mayhem' },
];
function Meta({g}:{g:Game}){return <div className="meta"><span><Users/>{g.players} players</span><i/><span><Timer/>{g.duration}</span></div>}
function Cover({g}:{g:Game}){let words=g.name.split(' ');return <div className={'cover '+g.art} style={g.art==='pyramid'?undefined:{backgroundImage:'url(/art/'+g.art+'.webp)'}}><span className="coverLogo">{words[0]}<br/>{words[1]}</span></div>}
export default function Home(){
 const [view,setView]=useState('Home'),[index,setIndex]=useState(0),[detail,setDetail]=useState<Game|null>(null),[help,setHelp]=useState(false),[playing,setPlaying]=useState(''),[recent,setRecent]=useState<string[]>([]),[resume,setResume]=useState('');const modal=useRef<HTMLDialogElement>(null);
 const [profileOpen,setProfileOpen]=useState(false),[viewer,setViewer]=useState<Viewer|null>(null),[favorites,setFavorites]=useState<string[]>([]),[query,setQuery]=useState(''),[paused,setPaused]=useState(false),[heroFocus,setHeroFocus]=useState(false);
 const prefix=viewer?'pt-'+viewer.id:'pt';
 useEffect(()=>{fetch('/api/profile').then(r=>r.json() as Promise<{profile:Viewer|null}>).then(v=>setViewer(v.profile)).catch(()=>{});setPaused(window.matchMedia('(prefers-reduced-motion: reduce)').matches)},[]);
 useEffect(()=>{try{setRecent(JSON.parse(localStorage.getItem(prefix+'-recent')||'[]'));setFavorites(JSON.parse(localStorage.getItem(prefix+'-favorites')||'[]'));setResume(JSON.parse(localStorage.getItem('playtogether.host')||'{}').game||'')}catch{}},[playing,prefix]);
 useEffect(()=>{if(detail||help||profileOpen)modal.current?.showModal();else modal.current?.close()},[detail,help,profileOpen]);
 useEffect(()=>{if(paused||heroFocus||detail||help||profileOpen||playing||view!=='Home')return;const timer=setInterval(()=>{if(!document.hidden)setIndex(i=>(i+1)%3)},5000);return ()=>clearInterval(timer)},[paused,heroFocus,detail,help,profileOpen,playing,view,index]);
 function favorite(g:Game){const next=favorites.includes(g.id)?favorites.filter(id=>id!==g.id):[...favorites,g.id];setFavorites(next);localStorage.setItem(prefix+'-favorites',JSON.stringify(next))}
 function close(){setDetail(null);setHelp(false);setProfileOpen(false)}
 useEffect(()=>{function key(e:KeyboardEvent){if(!['ArrowRight','ArrowLeft','ArrowUp','ArrowDown'].includes(e.key)||['INPUT','SELECT','TEXTAREA'].includes((e.target as HTMLElement).tagName))return;const parent=document.querySelector('dialog[open]')||document;const els=Array.from(parent.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],select')).filter(el=>el.offsetWidth&&el.offsetHeight);const cur=document.activeElement as HTMLElement;if(!els.includes(cur)){els[0]?.focus();return}const r=cur.getBoundingClientRect(),cx=r.x+r.width/2,cy=r.y+r.height/2;const horizontal=/Left|Right/.test(e.key),sign=/Right|Down/.test(e.key)?1:-1;const matches=els.map(el=>{const q=el.getBoundingClientRect(),x=q.x+q.width/2-cx,y=q.y+q.height/2-cy;const d=(horizontal?x:y)*sign,s=Math.abs(horizontal?y:x);return {el,d,s}}).filter(a=>a.d>4).sort((a,b)=>(a.d+a.s*4)-(b.d+b.s*4));if(matches[0]){e.preventDefault();matches[0].el.focus()}}document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key)},[]);
 function play(g:Game){setDetail(null);const arr=[g.id,...recent.filter(k=>k!==g.id)].slice(0,8);setRecent(arr);localStorage.setItem(prefix+'-recent',JSON.stringify(arr));setPlaying(g.id)}
 function nav(v:string){setView(v);setQuery('');window.scrollTo(0,0)}
 if(playing)return <GameSession game={playing} onExit={()=>setPlaying('')}/>;
 const features=['settlers','quiz','turbo'].map(id=>games.find(game=>game.id===id)!),feat=features[index];
 const sections=view==='Home'?categories.map(({id,title})=>({id,title,items:games.filter(g=>g.group===title)})):[{id:undefined,title:view,items:view==='Search'?games.filter(g=>(g.name+' '+g.group).toLowerCase().includes(query.trim().toLowerCase())):(view==='Favorites'?favorites:recent).flatMap(id=>games.filter(g=>g.id===id))}];
 return <div className="hub"><header className="top"><div className="topInner"><button className="brand" onClick={()=>nav('Home')} aria-label="PlayTogether home"><img src="/favicon.svg" alt=""/><span>Play<span>Together</span></span></button><nav>{[['Search',Search],['Home',House],['Recents',History],['Favorites',Heart]].map(([label,I])=>{const Icon=I as typeof House;return <button key={String(label)} className={view===label?'selected':''} onClick={()=>nav(String(label))}><Icon/>{String(label)}</button>})}</nav><button className="join" aria-label="Open profile" onClick={()=>setProfileOpen(true)}>{viewer?<>{viewer.avatar} {viewer.name}</>:<UserCircle/>}</button></div></header>
 <main className="main">{view==='Home'&&<><div className="homeTools"><button className="how" onClick={()=>setHelp(true)}><HelpCircle/>How to play</button></div>
 <section onFocusCapture={()=>setHeroFocus(true)} onBlurCapture={e=>setHeroFocus(e.currentTarget.contains(e.relatedTarget))} className={'hero hero-'+feat.art} style={{backgroundImage:'url(/art/'+feat.art+'.webp)'}}><div className="heroShade"/>
   {features.map((game, slide)=><div key={game.id} className="heroContent" hidden={slide!==index}>
     <div className="kicker"><span className="signal"><AudioLines size={16}/></span> FEATURED GAME</div>
     <h2>{game.name.split(' ')[0]} <em>{game.name.split(' ')[1]}</em></h2>
     <p>{game.description}</p>
     <Meta g={game}/>
     <div className="actions">
       {game.live&&<button className="primary" onClick={()=>play(game)}><Play fill="currentColor"/>Play now</button>}
       <button className="secondary" onClick={()=>setDetail(game)}><Info/>Game details</button>
     </div>
   </div>)}
   <div className="heroPager"><button aria-label={paused?"Resume carousel":"Pause carousel"} onClick={()=>setPaused(!paused)}>{paused?<Play/>:<Pause/>}</button><button aria-label="Previous featured game" onClick={()=>setIndex((index+2)%3)}><ChevronLeft/></button><span>0{index+1} <b>/ 03</b></span><button aria-label="Next featured game" onClick={()=>setIndex((index+1)%3)}><ChevronRight/></button></div></section>
 <nav className="categoryNav" aria-label="Game categories">
   {categories.map(({id,title,art})=>(
     <a key={id} href={'#'+id} style={{backgroundImage:`linear-gradient(0deg, #101116 0%, #101116cc 26%, #1011161a 80%), url(/art/${art}.webp)`}}>
       {title}
     </a>
   ))}
 </nav>
 {resume&&games.some(g=>g.id===resume)&&<button className="resume" onClick={()=>setPlaying(resume)}><Gamepad2/>Continue playing · {games.find(g=>g.id===resume)?.name}</button>}</>}
 {view==='Search'&&<input autoFocus type="search" className="hubSearch" aria-label="Search games" placeholder="Search games or categories" value={query} onChange={e=>setQuery(e.target.value)}/>}
 {sections.map(({id,title,items})=><section className="catalog" key={title}><h2 id={id} tabIndex={id ? -1 : undefined}>{title==='Search'?'Search results':title}</h2><div className="shelf">{items.map(g=><article key={g.id} className="shelfItem"><button className="card" onClick={()=>setDetail(g)}><Cover g={g}/><div className="cardBody"><div className="cardLabels"><span>{g.genre}</span><span className={g.live?'live':'soon'}>{g.live?'Playable':'Coming soon'}</span></div><h3>{g.name}</h3><Meta g={g}/></div></button><button className="heartBtn" aria-pressed={favorites.includes(g.id)} aria-label={'Favorite '+g.name} onClick={()=>favorite(g)}><Heart fill={favorites.includes(g.id)?'currentColor':'none'}/></button></article>)}</div>{!items.length&&<p>{view==='Favorites'?'Select the heart on a game to save it here.':view==='Recents'?'Games you launch will appear here.':'No games match your search.'}</p>}</section>)}
 {view==='Home'&&<AfterHours key={prefix} viewer={viewer} login={()=>setProfileOpen(true)}/>}</main>
 <dialog ref={modal} onCancel={close} onClick={e=>{if(e.target===modal.current)close()}}><div className="dialogInner"><button className="close" aria-label="Close" onClick={close}><X/></button>{profileOpen?<HubProfile viewer={viewer} change={v=>{setViewer(v);close();nav('Home')}}/>:detail?<><Cover g={detail}/><div className="dialogContent"><div className="smallLabel">{detail.genre} · {detail.level}</div><h2>{detail.name}</h2><Meta g={detail}/><p>{detail.description}</p><h3>How to play</h3><ol>{detail.rules.map(r=><li key={r}>{r}</li>)}</ol>{detail.live?<button className="primary" onClick={()=>play(detail)}><Play/>Start game</button>:<strong className="coming">Coming soon</strong>}</div></>:<div className="dialogContent guide"><Smartphone/><h2>How to play</h2><ol><li>Open PlayTogether on your TV or a laptop connected to it.</li><li>Pick a playable game to create your room.</li><li>Scan the QR code with each phone, choose a nickname, and tap Ready.</li><li>Start the match on the big screen. Your phone is your controller.</li></ol><button className="primary" onClick={()=>setHelp(false)}><Check/>Got it</button></div>}</div></dialog></div>
}
