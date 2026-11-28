'use client';
import {useEffect,useState} from 'react';
import {ChevronDown,ChevronLeft,Lock,Mail,Camera,Check,Trophy} from 'lucide-react';
import {achievements,groups,loadProgress,progress,ranks,sample,type Earned} from '@/lib/controller/profile';
import {avatars} from '@/lib/controller/room';
import {useRemote} from '@/lib/controller/remote';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import type {Viewer} from './HubProfile';
import './profile.css';
const emojis=[...new Set([...avatars,'🦉'])];
const date=(ms:number)=>new Date(ms).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});
const soon='Coming soon';
// Not wired to the server yet. aria-disabled, not disabled, so the TV remote can still reach it and what follows.
const later={'aria-disabled':true,title:soon,type:'button',onClick:(e:React.MouseEvent)=>e.preventDefault()} as const;
function Achievements({earned,adult}:{earned:Earned[];adult:boolean}){
 const [open,setOpen]=useState<string>(groups[0].id),at=new Map(earned.map(e=>[e.id,e.earnedAt]));
 return <section className="pBlock" aria-labelledby="pAch"><h2 id="pAch">Achievements</h2>
  {groups.filter(g=>adult||!g.adult).map(g=>{
   const list=achievements.filter(a=>a.group===g.id),got=list.filter(a=>at.has(a.id)).sort((a,b)=>at.get(b.id)!-at.get(a.id)!);
   const shown=list.filter(a=>a.visible&&!at.has(a.id)),secret=list.length-got.length-shown.length,isOpen=open===g.id;
   return <div key={g.id} className="pGame">
    <button className="pGameHead" aria-expanded={isOpen} onClick={()=>setOpen(isOpen?'':g.id)}>
     <span>{g.title}{g.adult&&<small>18+</small>}</span><b>{got.length} of {list.length}</b><ChevronDown aria-hidden/>
    </button>
    {isOpen&&<ul className="pList">
     {got.map(a=><li key={a.id} className="earned"><Trophy aria-hidden/><div><strong>{a.name}</strong><p>{a.how}</p></div><time dateTime={new Date(at.get(a.id)!).toISOString()}>{date(at.get(a.id)!)}</time></li>)}
     {shown.map(a=><li key={a.id}><Lock aria-hidden/><div><strong>{a.name}</strong><p>{a.how}</p></div></li>)}
     {secret>0&&<li className="secret"><Lock aria-hidden/><div><strong>{secret} secret {secret===1?'achievement':'achievements'}</strong><p>Earn {secret===1?'it':'them'} to find out what {secret===1?'it is':'they are'}.</p></div></li>}
    </ul>}
   </div>})}
 </section>
}
function Ranks({share}:{share:number}){
 return <ol className="pRanks" aria-label="Ranks">{ranks.map(r=><li key={r.name} className={share>=r.share?'on':''}>
  {share<r.share&&<Lock aria-hidden/>}<b>{r.name}</b><span>{r.share}%</span></li>)}</ol>
}
function NameAndAvatar({viewer}:{viewer:Viewer}){
 const [name,setName]=useState(viewer.name),[avatar,setAvatar]=useState(viewer.avatar);
 return <section className="pBlock" aria-labelledby="pEdit"><h2 id="pEdit">Name and avatar</h2>
  <form className="pName" onSubmit={e=>e.preventDefault()}>
   <label>Name<input value={name} onChange={e=>setName(e.target.value)} maxLength={32} required autoComplete="username"/></label>
   <button className="primary" {...later}>Save name</button>
  </form>
  <div className="pEmojis" role="radiogroup" aria-label="Avatar">
   {emojis.map(v=><button key={v} role="radio" aria-checked={avatar===v} onClick={()=>setAvatar(v)}>{v}</button>)}
   <button className="pPhoto" {...later}><Camera aria-hidden/>Photo</button>
  </div>
  <button className="primary" {...later}><Check aria-hidden/>Save avatar</button>
  <p className="pNote">Saving a new name or avatar is coming soon. Photos will come from your phone with a QR code.</p>
 </section>
}
function Details({viewer}:{viewer:Viewer}){
 return <section className="pBlock" aria-labelledby="pDetails"><h2 id="pDetails">Details</h2>
  <dl className="pDetails">
   <div><dt>Name</dt><dd>{viewer.name}</dd></div>
   <div><dt>Avatar</dt><dd>{viewer.avatar}</dd></div>
   <div><dt>Email</dt><dd className="pMissing">Not added yet</dd></div>
   <div><dt>Birthdate</dt><dd className="pMissing">Not shown yet</dd></div>
  </dl>
  <p className="pNote">Your birthdate decides which games you see, so it cannot be changed here.</p>
  <button className="secondary" {...later}><Mail aria-hidden/>Email me a link to change my password or email</button>
  <p className="pNote">{soon}: the link will open a page where you make the change.</p>
 </section>
}
// Each tab is a part of the profile. More can join later, such as legal, about or account settings.
const tabs=[{id:'profile',title:'Profile'},{id:'achievements',title:'Achievements'}] as const;
type Tab=typeof tabs[number]['id'];
// The tab lives in the address, so a link or a reload opens the same one. Tabs only render after the
// profile loads in the browser, so reading the address here never differs from the server's render.
function startTab():Tab{const t=typeof location==='undefined'?null:new URLSearchParams(location.search).get('tab');return tabs.find(x=>x.id===t)?.id??tabs[0].id}
export default function ProfilePage(){
 const [viewer,setViewer]=useState<Viewer|null|undefined>(undefined),[earned,setEarned]=useState<Earned[]>([]),[tab,setTab]=useState<Tab>(startTab);
 function pick(t:Tab){setTab(t);const url=new URL(location.href);url.searchParams.set('tab',t);history.replaceState(history.state,'',url)}
 useEffect(()=>{fetch('/api/profile').then(r=>r.json() as Promise<{profile:Viewer|null}>).then(v=>setViewer(v.profile)).catch(()=>setViewer(null))},[]);
 useEffect(()=>{if(viewer)loadProgress().then(setEarned).catch(()=>{})},[viewer]);
 const router=useRouter();
 useRemote(()=>router.push('/'));
 const p=viewer?progress(earned,viewer.adult):null;
 return <div className="hub profilePage"><header className="top"><div className="topInner">
  <Link className="brand" href="/" aria-label="PlayTogether home"><span className="pLogo" aria-hidden/><span>Play<span>Together</span></span></Link>
  <Link className="join" href="/"><ChevronLeft aria-hidden/>Back to games</Link></div></header>
  <main className="main pMain">
   {viewer===undefined?<p className="pNote">Loading…</p>:!viewer||!p?<section className="pBlock pGuest"><h1>Your profile</h1><p>Sign in on the home screen to see your achievements and profile.</p><Link className="primary" href="/" data-remote-start>Go to sign in</Link></section>:<>
    <section className="pHead">
     <span className="pAvatar" aria-hidden>{viewer.avatar}</span>
     <div><h1>{p.rank&&<em>{p.rank.name} </em>}{viewer.name}</h1>
      <p className="pShare">{p.count} of {p.total} achievements · {p.share}%</p>
      <Ranks share={p.share}/></div>
    </section>
    <div className="pTabs" role="tablist" aria-label="Profile sections">{tabs.map(t=>
     <button key={t.id} id={'tab-'+t.id} role="tab" aria-selected={tab===t.id} aria-controls={'panel-'+t.id} data-remote-start={tab===t.id||undefined} onClick={()=>pick(t.id)}>{t.title}</button>)}</div>
    <div className="pPanel" id={'panel-'+tab} role="tabpanel" aria-labelledby={'tab-'+tab}>
     {tab==='achievements'&&<>
      {sample&&<p className="pSample" role="note">Preview: these achievements are examples. Your real ones arrive soon.</p>}
      <Achievements earned={earned} adult={viewer.adult}/></>}
     {tab==='profile'&&<><NameAndAvatar viewer={viewer}/><Details viewer={viewer}/></>}
    </div>
   </>}
  </main></div>
}
