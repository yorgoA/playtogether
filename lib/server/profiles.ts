import { env } from 'cloudflare:workers';

type Profile = {id:string; name:string; birthday:string; avatar:string};
const cookie = 'pt_profile';
export function token(req:Request) {
  return req.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(cookie+'='))?.slice(cookie.length+1) || '';
}
export function sessionCookie(req:Request,value:string,seconds:number) {
  return cookie+'='+value+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+seconds+(new URL(req.url).protocol==='https:'?'; Secure':'');
}
export const reply = (value:unknown,status=200,headers:Record<string,string>={})=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store',...headers}});
export async function current(req:Request) {
  if (!token(req)) return null;
  return env.DB.prepare('SELECT p.id,p.name,p.birthday,p.avatar FROM profiles p JOIN profile_sessions s ON s.profile_id=p.id WHERE s.token=? AND s.expires>?').bind(token(req),Date.now()).first<Profile>();
}
export function publicProfile(p:Profile|null) {
  if(!p)return null;
  const today=new Date().toISOString().slice(0,10);
  const cutoff=String(Number(today.slice(0,4))-18)+today.slice(4);
  return {id:p.id,name:p.name,avatar:p.avatar,adult:p.birthday<=cutoff};
}
export async function passwordHash(password:string,salt:string) {
  const enc=new TextEncoder();
  const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
  const hash=await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(salt),iterations:100000,hash:'SHA-256'},key,256);
  return Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');
}
