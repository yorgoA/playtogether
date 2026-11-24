'use client';
import {useEffect,useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import * as THREE from 'three';
export const still=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// The same on every screen and redraw, unlike Math.random.
export const noise=(n:number)=>{const v=Math.sin(n*127.1)*43758.5453;return v-Math.floor(v)};
export type Vec=[number,number,number];
/* Frames the scene in the space left of the scoreboard (--rail in drinks.css). */
export function Shot({from,to,width,height,shake=0}:{from:Vec,to:Vec,width:number,height:number,shake?:number}){
 const aim=useRef(new THREE.Vector3(...to)),quake=useRef(0),distance=useRef(10),framed=useRef('');
 useEffect(()=>{if(shake)quake.current=1.1},[shake]);
 useFrame((s,dt)=>{
  const camera=s.camera as THREE.PerspectiveCamera,size=s.size,key=size.width+'x'+size.height;
  if(framed.current!==key){
   framed.current=key;
   const half=Math.tan(camera.fov*Math.PI/360),rail=Math.min(330,Math.max(190,size.width*.19)),aspect=(size.width-rail)/size.height;
   distance.current=Math.max(width/2/(half*aspect),height/2/half);
   camera.setViewOffset(size.width,size.height,rail/2,0,size.width,size.height);
  }
  const t=still()?0:s.clock.elapsedTime,k=still()?1:1-Math.exp(-dt*2),dir=new THREE.Vector3(...from).normalize().multiplyScalar(distance.current);
  aim.current.lerp(new THREE.Vector3(...to),k);quake.current=still()?0:Math.max(0,quake.current-dt);
  camera.position.set(aim.current.x*.4+dir.x+Math.sin(t*.22)*.5,aim.current.y+dir.y+Math.sin(t*.31)*.18,dir.z);
  camera.position.x+=Math.sin(t*61)*quake.current*.12;camera.position.y+=Math.sin(t*53)*quake.current*.12;
  camera.lookAt(aim.current);
 });
 return null;
}
const sparkVertex=`
attribute vec3 vel;attribute float seed;uniform float age;uniform float life;uniform float gravity;uniform float size;uniform float loop;varying float a;
void main(){float t=mix(age,mod(age+seed*life,life),loop);vec3 p=position+vel*t;p.y-=gravity*t*t;a=clamp(1.-t/life,0.,1.)*step(0.,t);
 vec4 v=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*v;gl_PointSize=size*(.5+seed)*(12./-v.z);}`;
const sparkFragment='uniform vec3 color;varying float a;void main(){float d=length(gl_PointCoord-.5);float g=smoothstep(.5,.05,d);gl_FragColor=vec4(color*(.7+g),g*a);\n#include <colorspace_fragment>\n}';
/* One particle system for everything: bursts, falling water, sand and embers. */
export function Sparks({color,count=220,at=[0,0,0],spread=.1,speed=3,up=0,gravity=1.2,life=1.8,size=14,loop=false,ring=0}:{color:string,count?:number,at?:Vec,spread?:number,speed?:number,up?:number,gravity?:number,life?:number,size?:number,loop?:boolean,ring?:number}){
 const geo=useMemo(()=>{
  const g=new THREE.BufferGeometry(),p:number[]=[],v:number[]=[],seed:number[]=[];
  for(let i=0;i<count;i++){
   const a=noise(i+1)*Math.PI*2,z=noise(i+500)*2-1,r=Math.sqrt(1-z*z),f=speed*(.3+noise(i+900)*.7);
   p.push((noise(i+50)-.5)*spread*2+Math.cos(a)*ring,(noise(i+80)-.5)*spread,(noise(i+120)-.5)*spread*2+Math.sin(a)*ring);
   v.push(Math.cos(a)*r*f,z*f+up,Math.sin(a)*r*f);seed.push(noise(i+333));
  }
  g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('vel',new THREE.Float32BufferAttribute(v,3));g.setAttribute('seed',new THREE.Float32BufferAttribute(seed,1));
  return g;
 },[count,spread,speed,up,ring]);
 useEffect(()=>()=>geo.dispose(),[geo]);
 const uniforms=useMemo(()=>({age:{value:0},life:{value:life},gravity:{value:gravity},size:{value:size},loop:{value:loop?1:0},color:{value:new THREE.Color(color)}}),[life,gravity,size,loop,color]);
 const material=useRef<THREE.ShaderMaterial>(null),age=useRef(0);
 useFrame((_,dt)=>{age.current+=still()?0:dt;if(material.current)material.current.uniforms.age.value=age.current});
 if(typeof window!=='undefined'&&still()&&!loop)return null;
 return <points geometry={geo} position={at} frustumCulled={false}><shaderMaterial ref={material} key={color} uniforms={uniforms} vertexShader={sparkVertex} fragmentShader={sparkFragment} transparent depthWrite={false} blending={THREE.AdditiveBlending}/></points>;
}
export function Stars({count=420}:{count?:number}){
 const geo=useMemo(()=>{const p:number[]=[];for(let i=0;i<count;i++){const a=noise(i)*Math.PI*2,y=noise(i+700);p.push(Math.cos(a)*48,-6+y*46,-Math.abs(Math.sin(a))*40-8)}return new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(p,3))},[count]);
 return <points geometry={geo}><pointsMaterial color="#fff4d6" size={.16} transparent opacity={.85}/></points>;
}
const skyVertex='varying vec2 u;void main(){u=uv;gl_Position=vec4(position.xy,.9999,1.);}';
const skyFragment=`varying vec2 u;uniform float time;uniform float aurora;uniform vec3 top;uniform vec3 mid;uniform vec3 low;uniform vec3 glowA;uniform vec3 glowB;
void main(){vec3 c=mix(low,mid,smoothstep(0.,.45,u.y));c=mix(c,top,smoothstep(.4,1.,u.y));
 float x=u.x*5.;float w=sin(x+time*.15)*.09+sin(x*2.3-time*.21)*.05;float h=u.y-.62-w;
 float band=smoothstep(0.,.04,h)*exp(-h*6.)*(.6+.4*sin(x*9.+sin(x*3.+time*.4)*2.));
 float h2=u.y-.48-w*1.6;band=max(band,0.);float b2=max(0.,smoothstep(0.,.05,h2)*exp(-h2*8.)*(.5+.5*sin(x*7.-time*.3)));
 c+=aurora*(glowA*band*.75+glowB*b2*.55);gl_FragColor=vec4(c,1.);
 #include <colorspace_fragment>
}`;
export function Sky({top,mid,low,glowA='#000',glowB='#000',aurora=0}:{top:string,mid:string,low:string,glowA?:string,glowB?:string,aurora?:number}){
 const uniforms=useMemo(()=>({time:{value:0},aurora:{value:aurora},top:{value:new THREE.Color(top)},mid:{value:new THREE.Color(mid)},low:{value:new THREE.Color(low)},glowA:{value:new THREE.Color(glowA)},glowB:{value:new THREE.Color(glowB)}}),[top,mid,low,glowA,glowB,aurora]);
 const material=useRef<THREE.ShaderMaterial>(null);
 useFrame(s=>{if(material.current&&!still())material.current.uniforms.time.value=s.clock.elapsedTime});
 return <mesh frustumCulled={false} renderOrder={-10}><planeGeometry args={[2,2]}/><shaderMaterial ref={material} uniforms={uniforms} vertexShader={skyVertex} fragmentShader={skyFragment} depthTest={false} depthWrite={false}/></mesh>;
}
/* A tall shaft of light, brightest at its foot. */
export function Beam({at,color,radius=.5,height=12}:{at:Vec,color:string,radius?:number,height?:number}){
 const uniforms=useMemo(()=>({color:{value:new THREE.Color(color)}}),[color]);
 const ref=useRef<THREE.Mesh>(null),age=useRef(0);
 useFrame((_,dt)=>{age.current+=dt;const k=still()?1:Math.min(1,age.current/.6);ref.current?.scale.set(k*(1+Math.sin(age.current*5)*.04),k,k)});
 return <mesh ref={ref} position={[at[0],at[1]+height/2,at[2]]}><cylinderGeometry args={[radius*1.5,radius,height,32,1,true]}/><shaderMaterial uniforms={uniforms} transparent depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} vertexShader="varying vec2 u;void main(){u=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}" fragmentShader="varying vec2 u;uniform vec3 color;void main(){gl_FragColor=vec4(color,pow(1.-u.y,1.4)*.5);}"/></mesh>;
}
