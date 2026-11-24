"use client";
export type MotionFrame={steering:number,pitch:number,rotation:number,steady:boolean};
type PermissionAPI={requestPermission?:()=>Promise<string>};
export type Calibration={sensitivity:number,invert:boolean,deadZone:number};
export const defaults:Calibration={sensitivity:1,invert:false,deadZone:.08};
const clamp=(v:number)=>Math.max(-1,Math.min(1,v));
const diff=(a:number,b:number)=>(a-b+540)%360-180;
export async function allowSensors(){
 if(!window.isSecureContext||typeof DeviceMotionEvent==='undefined')throw Error('Motion sensors are unavailable here. Touch controls are ready.');
 const motion=DeviceMotionEvent as unknown as PermissionAPI;
 const orientation=typeof DeviceOrientationEvent!=='undefined'?DeviceOrientationEvent as unknown as PermissionAPI:null;
 const permissions=[motion.requestPermission?.(),orientation?.requestPermission?.()].filter(Boolean);
 if((await Promise.all(permissions)).some(p=>p!=='granted'))throw Error('Motion permission was declined. You can keep playing with touch.');
}
export function observeMotion(options:()=>Calibration,onFrame:(v:MotionFrame)=>void,onShake:()=>void,onUnavailable:()=>void){
 let center:number[]|null=null,last:number[]|null=null,steering=0,pitch=0,rotation=0,lastShake=0,lastMovement=performance.now(),lastFrame=0;
 let baseline:number[]|null=null,hasMotion=false,gravityRoll:number|null=null;
 const calibrate=()=>{center=last?.slice()??null;steering=pitch=rotation=0};
 function orient(e:DeviceOrientationEvent){
  if(e.beta===null||e.gamma===null)return;
  const a=(screen.orientation?.angle??(window as Window & {orientation?:number}).orientation??0)*Math.PI/180;
  const x=gravityRoll??(e.gamma*Math.cos(a)+e.beta*Math.sin(a)),y=e.beta*Math.cos(a)-e.gamma*Math.sin(a);
  last=[x,y,e.alpha??0];if(!center)calibrate();if(!center)return;
  const c=options(),v=(value:number)=>Math.abs(value)<c.deadZone?0:clamp(value*c.sensitivity);
  steering=steering*.6+v(diff(x,center[0])/40)*(c.invert?-1:1)*.4;
  pitch=pitch*.6+v(diff(y,center[1])/40)*.4;
  rotation=rotation*.6+v(diff(last[2],center[2])/90)*.4;
  const t=performance.now();if(t-lastFrame>60){onFrame({steering,pitch,rotation,steady:t-lastMovement>650});lastFrame=t}
 }
 function move(e:DeviceMotionEvent){
  const gravity=e.accelerationIncludingGravity,linear=e.acceleration;
  if(gravity?.x!=null&&gravity?.y!=null){
   const gx=gravity.x-(linear?.x??0),gy=gravity.y-(linear?.y??0);
   if(Math.hypot(gx,gy)>3){
    const angle=screen.orientation?.angle??(window as Window & {orientation?:number}).orientation??0;
    gravityRoll=Math.atan2(gx,gy)*180/Math.PI-angle;
   }
  }
  const raw=e.acceleration?.x!=null?e.acceleration:e.accelerationIncludingGravity;
  if(raw?.x==null||raw.y==null||raw.z==null)return;hasMotion=true;
  const xyz=[raw.x,raw.y,raw.z];if(!baseline)baseline=xyz.slice();
  const v=Math.hypot(...xyz.map((value,i)=>value-baseline![i]));baseline=xyz.map((value,i)=>baseline![i]*.85+value*.15);
  const t=performance.now();if(v>1.8)lastMovement=t;
  if(v>10/options().sensitivity&&t-lastShake>850){lastShake=t;onShake()}
 }
 const reset=()=>{last=center=null;gravityRoll=null;steering=pitch=rotation=0};
 window.addEventListener('deviceorientation',orient);window.addEventListener('devicemotion',move);
 screen.orientation?.addEventListener('change',reset);window.addEventListener('orientationchange',reset);
 const check=setTimeout(()=>{if(!hasMotion)onUnavailable()},4500);
 return {calibrate,stop(){clearTimeout(check);window.removeEventListener('deviceorientation',orient);window.removeEventListener('devicemotion',move);screen.orientation?.removeEventListener('change',reset);window.removeEventListener('orientationchange',reset)}};
}
