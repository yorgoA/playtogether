"use client";
type PermissionAPI={requestPermission?:()=>Promise<string>};
export async function allowSensors(){
 if(!window.isSecureContext||typeof DeviceMotionEvent==='undefined')throw Error('Motion sensors are unavailable here. Touch controls are ready.');
 const motion=DeviceMotionEvent as unknown as PermissionAPI;
 const orientation=typeof DeviceOrientationEvent!=='undefined'?DeviceOrientationEvent as unknown as PermissionAPI:null;
 const permissions=[motion.requestPermission?.(),orientation?.requestPermission?.()].filter(Boolean);
 if((await Promise.all(permissions)).some(p=>p!=='granted'))throw Error('Motion permission was declined. You can keep playing with touch.');
}
export function observeShake(sensitivity:()=>number,onShake:()=>void,onUnavailable:()=>void){
 let lastShake=0,baseline:number[]|null=null,hasMotion=false;
 function move(e:DeviceMotionEvent){
  const raw=e.acceleration?.x!=null?e.acceleration:e.accelerationIncludingGravity;
  if(raw?.x==null||raw.y==null||raw.z==null)return;hasMotion=true;
  const xyz=[raw.x,raw.y,raw.z];if(!baseline)baseline=xyz.slice();
  const v=Math.hypot(...xyz.map((value,i)=>value-baseline![i]));baseline=xyz.map((value,i)=>baseline![i]*.85+value*.15);
  const t=performance.now();if(v>10/sensitivity()&&t-lastShake>850){lastShake=t;onShake()}
 }
 window.addEventListener('devicemotion',move);
 const check=setTimeout(()=>{if(!hasMotion)onUnavailable()},4500);
 return ()=>{clearTimeout(check);window.removeEventListener('devicemotion',move)};
}
