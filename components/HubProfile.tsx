'use client';
import {useState} from 'react';
import Link from 'next/link';
export type Viewer={id:string;name:string;adult:boolean;avatar:string};
export default function HubProfile({viewer,change}:{viewer:Viewer|null;change:(v:Viewer|null)=>void}){
 const [create,setCreate]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function submit(data:Record<string,unknown>){
  setBusy(true);setError('');
  try{const r=await fetch('/api/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await r.json() as {error?:string;profile:Viewer|null};if(!r.ok)throw Error(result.error);change(result.profile)}
  catch(e){setError(e instanceof Error?e.message:'Try again.')}finally{setBusy(false)}
 }
 return <div className="dialogContent profileForm"><h2>{viewer?viewer.avatar+' '+viewer.name:create?'Create profile':'Sign in'}</h2>
 {viewer?<div className="profileActions"><Link className="primary" href="/profile" data-remote-start>Open profile</Link><button className="secondary" disabled={busy} onClick={()=>submit({action:'logout'})}>Sign out</button></div>:<form onSubmit={e=>{e.preventDefault();submit({...Object.fromEntries(new FormData(e.currentTarget)),action:create?'register':'login'})}}>
 <label>Profile name<input name="name" autoComplete="username" maxLength={32} required/></label><label>Password<input name="password" type="password" autoComplete={create?'new-password':'current-password'} minLength={8} maxLength={128} required/></label>
 {create&&<><label>Date of birth<input name="birthday" type="date" required/></label><label>Avatar<select name="avatar">{['🦊','🐼','🐙','🦉'].map(v=><option key={v}>{v}</option>)}</select></label></>}
 <button className="primary" disabled={busy}>{create?'Create profile':'Sign in'}</button><button type="button" className="secondary" onClick={()=>{setCreate(!create);setError('')}}>{create?'Use existing profile':'New profile'}</button></form>}
 {error&&<p role="alert">{error}</p>}</div>
}
