'use client';
import {LockKeyhole} from 'lucide-react';
import type {ReactNode} from 'react';
import type {Viewer} from './HubProfile';
export default function AfterHours({viewer,login,children}:{viewer:Viewer|null,login:()=>void,children:ReactNode}){
 return <section className="catalog"><h2>After hours <small>18+</small></h2>{viewer?.adult?children:<div className="lockedShelf"><div className="frost" aria-hidden="true"/><div><LockKeyhole/><strong>{viewer?'For players 18 and over':'Sign in to view drinking games'}</strong>{!viewer&&<button className="secondary" onClick={login}>Sign in</button>}</div></div>}</section>;
}
