'use client';
import {useEffect,useMemo,useRef} from 'react';
import {Canvas,useFrame} from '@react-three/fiber';
import * as THREE from 'three';
import type {KingsView} from '@/lib/contract';
import type {Player} from '@/lib/controller/room';
import {backTexture,cardGeometry,faceTexture} from './cards';
import {Beam,noise,Shot,Sky,Sparks,Stars,still,type Vec} from './fx';

const orbit=(i:number,t:number)=>{
 const layer=i%4,a=i/52*Math.PI*2*3+t*(.2+layer*.018);
 return {a,r:2.75+layer*.3,y:.55+(i/52)*3.5+Math.sin(t*.9+i)*.07};
};
/* The face-down deck is a vortex spinning round the cup. */
function Vortex({board}:{board:KingsView}){
 const mesh=useRef<THREE.InstancedMesh>(null),geo=useMemo(()=>cardGeometry(),[]),back=useMemo(()=>backTexture('#3b1a6e','#6d3bb0'),[]);
 const sizes=useRef<number[]>(Array(52).fill(0)),o=useMemo(()=>new THREE.Object3D(),[]);
 useEffect(()=>()=>{geo.dispose();back.dispose()},[geo,back]);
 useFrame((s,dt)=>{
  if(!mesh.current)return;const t=still()?2:s.clock.elapsedTime;
  for(let i=0;i<52;i++){
   const goal=board.left[i]?1:0;sizes.current[i]+=(goal-sizes.current[i])*(still()?1:1-Math.exp(-dt*5));
   const {a,r,y}=orbit(i,t);
   o.position.set(Math.cos(a)*r,y,Math.sin(a)*r);o.rotation.set(.12*Math.sin(t+i),-a+Math.PI/2+.4,.32+Math.sin(t*.7+i)*.12,'YXZ');
   o.scale.setScalar(.56*sizes.current[i]);o.updateMatrix();mesh.current.setMatrixAt(i,o.matrix);
  }
  mesh.current.instanceMatrix.needsUpdate=true;
 });
 return <instancedMesh ref={mesh} args={[geo,undefined,52]} frustumCulled={false} castShadow><meshStandardMaterial map={back} side={THREE.DoubleSide} roughness={.45} emissive="#5a2fa0" emissiveIntensity={.28}/></instancedMesh>;
}
function Drawn({card,slot}:{card:string,slot:number}){
 const ref=useRef<THREE.Group>(null),age=useRef(0),geo=useMemo(()=>cardGeometry(),[]),face=useMemo(()=>faceTexture(card),[card]),back=useMemo(()=>backTexture('#3b1a6e','#6d3bb0'),[]);
 const from=useRef<THREE.Vector3|null>(null);
 useEffect(()=>()=>{geo.dispose();face.dispose();back.dispose()},[geo,face,back]);
 useFrame((s,dt)=>{
  if(!ref.current)return;const t=s.clock.elapsedTime;
  if(!from.current){const p=orbit(slot,t);from.current=new THREE.Vector3(Math.cos(p.a)*p.r,p.y,Math.sin(p.a)*p.r)}
  age.current+=dt;const k=still()?1:Math.min(1,age.current/1.15),e=1-Math.pow(1-k,3),arc=Math.sin(k*Math.PI);
  ref.current.position.set(THREE.MathUtils.lerp(from.current.x,-3.1,e),THREE.MathUtils.lerp(from.current.y,1.75,e)+arc*1.3+(k===1&&!still()?Math.sin(t*1.6)*.06:0),THREE.MathUtils.lerp(from.current.z,3.3,e));
  ref.current.rotation.set(0,Math.PI*3*(1-e)+.2+(k===1&&!still()?Math.sin(t*.9)*.09:0),arc*.4);
  ref.current.scale.setScalar(.56+e*.84);
 });
 return <group ref={ref}>
  <mesh geometry={geo} position-z={.012}><meshBasicMaterial map={face} toneMapped={false}/></mesh>
  <mesh geometry={geo} rotation-y={Math.PI} position-z={-.012}><meshStandardMaterial map={back}/></mesh>
 </group>;
}
const cupProfile=[[0,0],[1,0],[1.02,.1],[.5,.22],[.2,.36],[.17,.75],[.29,.86],[.17,.97],[.24,1.1],[.75,1.32],[1.1,1.75],[1.26,2.4],[1.33,2.52],[1.27,2.53],[1.17,2.4],[1.01,1.8],[.68,1.45],[.1,1.3]].map(([x,y])=>new THREE.Vector2(x,y));
function Cup({kings}:{kings:number}){
 const cup=useMemo(()=>new THREE.LatheGeometry(cupProfile,56),[]),liquid=useRef<THREE.Mesh>(null),level=useRef(0),glow=useRef<THREE.PointLight>(null);
 useFrame((s,dt)=>{
  level.current+=(kings/4-level.current)*(still()?1:1-Math.exp(-dt*1.1));
  const y=1.42+level.current*1.02,r=.6+level.current*.55;
  if(liquid.current){liquid.current.position.y=y+Math.sin(s.clock.elapsedTime*2)*.012;liquid.current.scale.set(r,r,1);liquid.current.visible=level.current>.01}
  if(glow.current)glow.current.intensity=4+level.current*26+Math.sin(s.clock.elapsedTime*3)*1.5;
 });
 return <group position-y={.1}>
  <mesh geometry={cup} castShadow><meshStandardMaterial color="#f2b632" metalness={.72} roughness={.24} emissive="#7a3f00" emissiveIntensity={.45} side={THREE.DoubleSide}/></mesh>
  {[1.5,2.45].map(y=><mesh key={y} position-y={y} rotation-x={Math.PI/2}><torusGeometry args={[y===1.5?.95:1.29,.05,10,60]}/><meshStandardMaterial color="#ffe08a" metalness={.8} roughness={.2} emissive="#8a5200" emissiveIntensity={.5}/></mesh>)}
  {Array.from({length:10},(_,i)=>{const a=i/10*Math.PI*2;return <mesh key={i} position={[Math.cos(a)*1.22,2.08,Math.sin(a)*1.22]}><icosahedronGeometry args={[.13,0]}/><meshStandardMaterial color={['#ff3864','#25d9c0','#8a5cff'][i%3]} emissive={['#ff3864','#25d9c0','#8a5cff'][i%3]} emissiveIntensity={.9} flatShading/></mesh>})}
  <mesh ref={liquid} rotation-x={-Math.PI/2}><circleGeometry args={[1,48]}/><meshBasicMaterial color="#ffab2e" toneMapped={false}/></mesh>
  <pointLight ref={glow} position={[0,3.1,.6]} color="#ffb347" distance={9}/>
  {kings>0&&<Sparks key={kings} at={[0,2.1,0]} color="#ffd166" count={50} spread={.6} speed={.15} up={.6} gravity={0} life={2.4} size={9} loop/>}
 </group>;
}
function Rock({shake}:{shake:boolean}){
 const geo=useMemo(()=>{
  const g=new THREE.CylinderGeometry(4.3,.7,4.4,15,6),p=g.attributes.position;
  for(let i=0;i<p.count;i++){const y=p.getY(i);if(y<2.1){const k=.82+noise(Math.round(p.getX(i)*9)+Math.round(p.getZ(i)*13)+Math.round(y*7))*.36;p.setX(i,p.getX(i)*k);p.setZ(i,p.getZ(i)*k)}}
  g.computeVertexNormals();return g.translate(0,-2.2,0);
 },[]);
 const tiles=useRef<THREE.Group>(null);
 useFrame(s=>{tiles.current?.children.forEach((m,i)=>{m.position.y=.02+(shake&&!still()?Math.abs(Math.sin(s.clock.elapsedTime*9+i*1.7))*.16:0)})});
 return <>
  <mesh geometry={geo} receiveShadow><meshStandardMaterial color="#4a3b74" flatShading roughness={.95}/></mesh>
  <group ref={tiles}>{Array.from({length:18},(_,i)=>{const a=i/18*Math.PI*2;return <mesh key={i} position={[Math.cos(a)*2.9,.02,Math.sin(a)*2.9]} rotation-y={-a} receiveShadow><boxGeometry args={[1.2,.14,.88]}/><meshStandardMaterial color={i%2?'#75639f':'#675690'} flatShading/></mesh>})}</group>
  <mesh position-y={.06} receiveShadow><cylinderGeometry args={[1.6,1.8,.2,8]}/><meshStandardMaterial color="#8b78b8" flatShading/></mesh>
  {Array.from({length:9},(_,i)=>{const a=noise(i+3)*Math.PI*2,r=6+noise(i+9)*5;return <mesh key={i} position={[Math.cos(a)*r,-2+noise(i+20)*5,-3-Math.abs(Math.sin(a))*r]} scale={.3+noise(i+40)*.7} rotation={[i,i*2,0]}><dodecahedronGeometry args={[1,0]}/><meshStandardMaterial color="#3d3163" flatShading/></mesh>})}
 </>;
}
/* Every player's mug floats in front of the rock. The one to play hovers, and drinkers tip theirs. */
function Mug({player,x,z,active,sip}:{player:Player,x:number,z:number,active:boolean,sip:string}){
 const ref=useRef<THREE.Group>(null),beer=useRef<THREE.Mesh>(null),tip=useRef(0),y=useRef(0);
 useEffect(()=>{if(sip)tip.current=1.5},[sip]);
 const fill=1-(Math.abs(player.score)%6)/6;
 useFrame((s,dt)=>{
  if(!ref.current)return;tip.current=Math.max(0,tip.current-dt);y.current+=((active?.42:0)-y.current)*(1-Math.exp(-dt*4));
  ref.current.position.y=.1+y.current+(still()?0:Math.sin(s.clock.elapsedTime*1.5+x)*.05)+Math.sin(tip.current/1.5*Math.PI)*.35;
  ref.current.rotation.z=still()?0:Math.sin(tip.current/1.5*Math.PI)*1.15;
  if(beer.current){beer.current.scale.y+=(Math.max(.05,fill)-beer.current.scale.y)*(1-Math.exp(-dt*3));beer.current.position.y=-.27+beer.current.scale.y*.27}
 });
 return <group ref={ref} position={[x,.1,z]} scale={.88} rotation-y={.3}>
  <mesh castShadow><cylinderGeometry args={[.32,.29,.66,20,1,true]}/><meshStandardMaterial color="#e6f3ff" transparent opacity={.3} side={THREE.DoubleSide} roughness={.1}/></mesh>
  <mesh ref={beer}><cylinderGeometry args={[.28,.26,.54,20]}/><meshStandardMaterial color="#ffb52e" emissive="#b86a00" emissiveIntensity={.5}/></mesh>
  <mesh position-y={.33} scale-y={.5}><sphereGeometry args={[.3,14,10]}/><meshStandardMaterial color="#fff8e6"/></mesh>
  {[-.3,.16].map(h=><mesh key={h} position-y={h} rotation-x={Math.PI/2}><torusGeometry args={[.31,.045,8,28]}/><meshStandardMaterial color={player.color} emissive={player.color} emissiveIntensity={.55}/></mesh>)}
  <mesh position={[.4,0,0]}><torusGeometry args={[.17,.055,8,20]}/><meshStandardMaterial color={player.color} emissive={player.color} emissiveIntensity={.35}/></mesh>
 </group>;
}
function Effect({card}:{card:string}){
 const r=card[0],red='HD'.includes(card[1]);
 if(r==='A')return <><Sparks at={[0,0,0]} color="#59c8ff" count={1100} ring={4.2} spread={.2} speed={.35} gravity={1.5} life={2.1} size={16} loop/><Sparks at={[0,2.6,0]} color="#8fe3ff" count={260} ring={1.25} spread={.1} speed={.4} gravity={1.4} life={1.3} size={13} loop/></>;
 if(r==='7')return <><Beam at={[0,.1,0]} color="#ffe9a3" radius={2}/><Sparks color="#fff0b8" count={240} ring={1.4} spread={.5} speed={.1} up={1.8} gravity={0} life={3} size={11} loop/></>;
 if(r==='4')return <Sparks color="#c9a0ff" count={320} ring={3.5} spread={.5} speed={1.2} up={2.2} gravity={2.4} life={1.7} size={18}/>;
 if(r==='K')return <><mesh position={[0,6,0]}><cylinderGeometry args={[.13,.2,7.6,16]}/><meshBasicMaterial color="#ffb52e" transparent opacity={.85} toneMapped={false}/></mesh><Sparks at={[0,2.5,0]} color="#ffc13d" count={420} speed={3.6} up={2.4} gravity={2.6} life={2} size={17}/><Sparks at={[0,2.4,0]} color="#ffd98a" count={140} ring={.4} spread={.3} speed={1.1} up={1} gravity={2.2} life={.9} size={10} loop/></>;
 if(r==='Q')return <Sparks at={[0,3.2,0]} color="#ff7ae0" count={380} ring={1.5} speed={.5} up={.7} gravity={.2} life={2.8} size={13} loop/>;
 if(r==='8')return <Sparks at={[0,2.8,0]} color="#ff6f91" count={260} spread={1.4} speed={.5} up={1} gravity={0} life={2.6} size={16} loop/>;
 return <Sparks at={[-3.1,1.75,3.1]} color={red?'#ff6f85':'#9fc4ff'} count={200} speed={3} gravity={1.2} life={1.5} size={13}/>;
}
export default function KingsScene({board,players,onFail}:{board:KingsView,players:Player[],onFail:()=>void}){
 const seats=board.order.flatMap(id=>players.filter(p=>p.id===id));
 const quake=board.card?.[0]==='4'||board.card?.[0]==='K'?board.seq:0;
 const look:Vec=[0,1.75,0];
 return <Canvas shadows={{type:THREE.PCFShadowMap}} dpr={[1,1.5]} camera={{fov:34,near:.5,far:120}} gl={{antialias:true,powerPreference:'high-performance',toneMapping:THREE.NoToneMapping}} onCreated={({gl})=>gl.domElement.addEventListener('webglcontextlost',()=>{if(gl.domElement.isConnected)onFail()})} aria-label="A golden cup on a floating rock with the deck spinning round it" role="img">
  <Sky top="#0b0724" mid="#2b1458" low="#722f72" glowA="#2fffb4" glowB="#8f5bff" aurora={1}/><Stars/>
  <hemisphereLight args={['#c9b8ff','#5a2a66',1.25]}/>
  <directionalLight position={[4,9,6]} intensity={2} color="#ffe6c4" castShadow shadow-mapSize={[1024,1024]} shadow-camera-left={-6} shadow-camera-right={6} shadow-camera-top={6} shadow-camera-bottom={-6} shadow-bias={-.001}/>
  <pointLight position={[-6,3,-3]} intensity={50} color="#35e8c4"/><pointLight position={[6,2,-2]} intensity={50} color="#ff5bc2"/>
  <Shot from={[0,2.4,11]} to={look} width={10.4} height={8.6} shake={quake}/>
  <Rock shake={board.card?.[0]==='4'}/><Cup kings={board.kings}/><Vortex board={board}/>
  {seats.map((p,i)=>{const k=seats.length>1?i/(seats.length-1)-.5:0,a=k*2.1;return <Mug key={p.id} player={p} x={Math.sin(a)*4.2} z={1.2+Math.cos(a)*2.6} active={p.id===board.turn} sip={board.event?.drinkers.includes(p.id)?board.seq+':'+p.score:''}/>})}
  {board.card&&<group key={board.seq}><Drawn card={board.card} slot={board.slot}/><Effect card={board.card}/></group>}
 </Canvas>;
}
