'use client';
import {useEffect,useMemo,useRef} from 'react';
import {Canvas,useFrame} from '@react-three/fiber';
import * as THREE from 'three';
import type {PyramidView} from '@/lib/contract';
import {pyramidLevels} from '@/lib/pyramid/layout';
import {backTexture,cardGeometry,faceTexture} from './cards';
import {Beam,noise,Shot,Sky,Sparks,Stars,still,type Vec} from './fx';

const H=1.55,SETBACK=.62,CARD=.92;
const spots:{x:number,y:number,z:number}[]=pyramidLevels.flatMap((size,row)=>Array.from({length:size},(_,i)=>({x:(i-(size-1)/2)*1.32,y:row*H+H/2,z:3.1-row*SETBACK+.06})));
function stoneTexture(){
 const c=document.createElement('canvas');c.width=512;c.height=256;const g=c.getContext('2d')!;
 g.fillStyle='#d79a5c';g.fillRect(0,0,512,256);
 for(let y=0;y<4;y++)for(let x=-1;x<5;x++){const n=noise(x+y*11+2);g.fillStyle=`hsl(${28+n*8} ${50+n*10}% ${50+n*14}%)`;g.beginPath();g.roundRect(x*110+(y%2)*55+3,y*64+3,104,58,7);g.fill()}
 for(let i=0;i<900;i++){g.fillStyle=noise(i)>.5?'#ffdfa022':'#6b361c22';g.fillRect(noise(i+9)*512,noise(i+77)*256,3,3)}
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;
}
function plateTexture(n:number){
 const c=document.createElement('canvas');c.width=256;c.height=128;const g=c.getContext('2d')!;
 g.fillStyle='#35203a';g.beginPath();g.roundRect(4,4,248,120,26);g.fill();g.strokeStyle='#f4c766';g.lineWidth=7;g.stroke();
 g.fillStyle='#ffe3a0';g.textAlign='center';g.textBaseline='middle';g.font='900 58px "Trebuchet MS",Arial,sans-serif';g.fillText(n+(n===1?' sip':' sips'),128,66);
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
function Temple({row}:{row:number}){
 const tex=useMemo(()=>stoneTexture(),[]),plates=useMemo(()=>pyramidLevels.map((_,i)=>plateTexture(i+1)),[]);
 const stones=useMemo(()=>pyramidLevels.map(size=>{const t=tex.clone();t.repeat.set(size*.62+.5,.75);return t}),[tex]);
 return <>{pyramidLevels.map((size,i)=>{
  const w=size*1.32+.5,d=6.2-i*SETBACK*2;
  return <group key={size}>
   <mesh position={[0,i*H+H/2,0]} castShadow receiveShadow><boxGeometry args={[w,H,d]}/><meshStandardMaterial map={stones[i]} roughness={1}/></mesh>
   <mesh position={[0,(i+1)*H-.05,0]} receiveShadow castShadow><boxGeometry args={[w+.2,.14,d+.2]}/><meshStandardMaterial color="#eab877"/></mesh>
   <mesh position={[-w/2-.85,i*H+H/2,d/2-.2]}><planeGeometry args={[1.28,.64]}/><meshBasicMaterial map={plates[i]} transparent toneMapped={false} color={i===row?'#ffffff':'#9d8fa6'}/></mesh>
  </group>})}</>;
}
function StoneCard({card,x,y,z,active}:{card:string|null,x:number,y:number,z:number,active:boolean}){
 const ref=useRef<THREE.Group>(null),turn=useRef(card?1:0),geo=useMemo(()=>cardGeometry(),[]),back=useMemo(()=>backTexture('#134a52','#1f7d80'),[]),face=useMemo(()=>card?faceTexture(card):null,[card]);
 const rim=useRef<THREE.Mesh>(null);
 useEffect(()=>()=>{geo.dispose();back.dispose()},[geo,back]);
 useEffect(()=>()=>face?.dispose(),[face]);
 useFrame((s,dt)=>{
  turn.current=card?(still()?1:Math.min(1,turn.current+dt/.9)):0;
  const e=1-Math.pow(1-turn.current,3),hop=Math.sin(turn.current*Math.PI);
  ref.current?.position.set(x,y+hop*.35,z+hop*1.3+(active?.25:0));ref.current?.rotation.set(-.06,Math.PI*(1-e)+Math.PI*2*e,0);
  ref.current?.scale.setScalar(CARD+(active?.1+Math.sin(s.clock.elapsedTime*3)*.02:0));
  if(rim.current)(rim.current.material as THREE.MeshBasicMaterial).opacity=.65+Math.sin(s.clock.elapsedTime*4)*.35;
 });
 return <group ref={ref} position={[x,y,z]}>
  {active&&<mesh ref={rim} geometry={geo} scale={[1.14,1.1,1]} position-z={-.004}><meshBasicMaterial color="#ffe070" transparent toneMapped={false} side={THREE.DoubleSide}/></mesh>}
  {face&&<mesh geometry={geo} position-z={.015}><meshBasicMaterial map={face} toneMapped={false} color={active?'#ffffff':'#b9aab0'}/></mesh>}
  <mesh geometry={geo} rotation-y={Math.PI} position-z={-.015}><meshStandardMaterial map={back} emissive="#0c5f66" emissiveIntensity={.25}/></mesh>
 </group>;
}
function Torch({x,color}:{x:number,color:string}){
 const light=useRef<THREE.PointLight>(null);
 useFrame(s=>{if(light.current)light.current.intensity=34+(still()?0:Math.sin(s.clock.elapsedTime*11+x)*7+Math.sin(s.clock.elapsedTime*17)*4)});
 return <group position={[x,0,4.6]}>
  <mesh position-y={.8} castShadow><cylinderGeometry args={[.13,.22,1.6,7]}/><meshStandardMaterial color="#7c4527" flatShading/></mesh>
  <mesh position-y={1.65}><cylinderGeometry args={[.42,.2,.32,8]}/><meshStandardMaterial color="#b8843d" metalness={.5} roughness={.4} flatShading/></mesh>
  <pointLight ref={light} position={[0,2.5,.4]} color={color} distance={13}/>
  <Sparks key={color} at={[0,1.8,0]} color={color} count={120} spread={.22} speed={.18} up={1.1} gravity={0} life={1.15} size={26} loop/>
 </group>;
}
function Desert(){
 const dunes=useMemo(()=>{const g=new THREE.PlaneGeometry(70,46,70,46).rotateX(-Math.PI/2),p=g.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),far=Math.max(0,Math.hypot(x,z)-7);p.setY(i,Math.min(1,far/6)*(Math.sin(x*.35+z*.2)*.6+Math.sin(z*.5-x*.1)*.4)-.06)}g.computeVertexNormals();return g},[]);
 return <>
  <mesh geometry={dunes} receiveShadow><meshStandardMaterial color="#b06a4b" flatShading roughness={1}/></mesh>
  {[[-13,-9,3.6],[14,-11,5]].map(([x,z,h])=><mesh key={x} position={[x,h/2-.3,z]} rotation-y={Math.PI/4}><coneGeometry args={[h*.95,h,4]}/><meshStandardMaterial color="#8a5060" flatShading/></mesh>)}
  <mesh position={[3.8,8.6,-16]}><circleGeometry args={[3.5,48]}/><meshBasicMaterial color="#ffe9b0" toneMapped={false}/></mesh>
  <mesh position={[3.8,8.6,-16.2]}><circleGeometry args={[4.8,48]}/><meshBasicMaterial color="#ffb37a" transparent opacity={.22} toneMapped={false}/></mesh>
  {[-6.9,7.2].map((x,i)=><group key={x} position={[x,0,i?1:.2]} rotation-z={i?-.12:.1}>
   <mesh position-y={1.4} castShadow><cylinderGeometry args={[.13,.24,2.9,6]}/><meshStandardMaterial color="#6d4230" flatShading/></mesh>
   {Array.from({length:8},(_,k)=><group key={k} position-y={2.85} rotation-y={k/8*Math.PI*2}><mesh position={[.75,-.1,0]} rotation-z={-1.95} scale={[1,1,.35]} castShadow><coneGeometry args={[.28,1.7,4]}/><meshStandardMaterial color="#2c7a5a" flatShading/></mesh></group>)}
  </group>)}
  <Sparks at={[0,.8,3]} color="#ffcf91" count={120} spread={9} speed={.35} gravity={0} life={5} size={5} loop/>
 </>;
}
export default function PyramidScene({board,onFail}:{board:PyramidView,onFail:()=>void}){
 const spot=spots[board.index],sides=pyramidLevels.map((size,i)=>pyramidLevels.slice(0,i+1).reduce<number>((n,k)=>n+k,0)-size);
 const row=board.index<0?-1:sides.filter(start=>board.index>=start).length-1;
 const bluff=board.outcome?.verdict==='bluff',fire=board.claim?'#ff3d5a':bluff?'#b85cff':'#ff9a3c';
 const to:Vec=spot?[spot.x*.14,3.35+(spot.y-3.75)*.1,0]:[0,3.35,0];
 const peak=pyramidLevels.length*H;
 return <Canvas shadows={{type:THREE.PCFShadowMap}} dpr={[1,1.5]} camera={{fov:30,near:.5,far:120}} gl={{antialias:true,powerPreference:'high-performance',toneMapping:THREE.NoToneMapping}} onCreated={({gl})=>gl.domElement.addEventListener('webglcontextlost',()=>{if(gl.domElement.isConnected)onFail()})} aria-label="A stone pyramid of fifteen cards in a desert at night" role="img">
  <Sky top="#0d1034" mid="#4a2355" low="#f0885e"/><Stars/>
  <hemisphereLight args={['#b7b4ff','#b3623f',1.05]}/>
  <directionalLight position={[5,10,8]} intensity={1.5} color="#ffdcae" castShadow shadow-mapSize={[1024,1024]} shadow-camera-left={-9} shadow-camera-right={9} shadow-camera-top={9} shadow-camera-bottom={-4} shadow-bias={-.001}/>
  <Shot from={[0,1.5,18]} to={to} width={11.8} height={11.4} shake={bluff?board.index+1:0}/>
  <Desert/><Temple row={row}/><Torch x={-5} color={fire}/><Torch x={5} color={fire}/>
  {spots.map((s,i)=><StoneCard key={i} {...s} card={board.cards[i]} active={i===board.index}/>)}
  {spot&&<Sparks key={board.index} at={[spot.x,spot.y,spot.z+.4]} color="#ffd98a" count={130} speed={2.2} gravity={1.4} life={1.2} size={11}/>}
  {spot&&board.claim&&<Sparks key={'c'+board.claim.from} at={[0,.4,0]} color="#ffbd74" count={420} ring={5.2} spread={.8} speed={.9} up={.9} gravity={0} life={2.6} size={15} loop/>}
  {spot&&board.outcome&&<Sparks key={'o'+board.index+board.outcome.from+board.outcome.card} at={[spot.x,spot.y,spot.z+.7]} color={bluff?'#c86bff':board.outcome.verdict==='match'?'#ff4d5e':'#7affc4'} count={360} speed={5} up={1} gravity={2} life={2} size={16}/>}
  {board.index===board.cards.length-1&&<Beam at={[0,peak,0]} color="#ffe08a" radius={.8}/>}
 </Canvas>;
}
