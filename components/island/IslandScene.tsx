'use client';
import {useEffect,useLayoutEffect,useMemo,useRef} from 'react';
import {Canvas,useFrame,useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {edges,ports,robberTile,tiles,vertices,type BoardView,type Resource} from '@/lib/island/board';
import type {Player} from '@/lib/controller/room';
import {at,beachGeometry,boatGeometry,GROUND,houseGeometry,pierGeometry,roundedHex,S,sceneryGeometry,tileColors,TILE_TOP} from './geometry';
import {drawResource} from './icons';

const still=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const UP=.97; // Camera elevation, radians.

function FitCamera(){
 const {camera,size,invalidate}=useThree();
 useLayoutEffect(()=>{
  const cam=camera as THREE.PerspectiveCamera,half=Math.tan(cam.fov*Math.PI/360),rail=Math.min(330,Math.max(190,size.width*.19)),aspect=(size.width-rail)/size.height;
  const d=Math.max(5.75/(half*aspect)+2.4,5.12/half);
  // Centre the island in the water left of the scoreboard (--rail in island.css).
  cam.setViewOffset(size.width,size.height,rail/2,0,size.width,size.height);
  cam.position.set(0,Math.sin(UP)*d,Math.cos(UP)*d+.1);cam.lookAt(0,0,.1);cam.updateProjectionMatrix();invalidate();
 },[camera,size,invalidate]);
 return null;
}

const waterVertex='varying vec2 p;void main(){vec4 w=modelMatrix*vec4(position,1.);p=w.xz;gl_Position=projectionMatrix*viewMatrix*w;}';
const waterFragment=`
varying vec2 p;uniform float time;uniform vec2 hexes[${tiles.length}];uniform vec3 deep;uniform vec3 mid;uniform vec3 shallow;
float hash(vec2 v){return fract(sin(dot(v,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 v){vec2 i=floor(v),f=fract(v);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float shore(vec2 q){float d=99.;for(int i=0;i<${tiles.length};i++){vec2 a=abs(q-hexes[i]);float h=max(a.x,a.x*.5+a.y*.8660254)-.8660254;float k=max(.5-abs(d-h),0.)/.5;d=min(d,h)-k*k*.125;}return d;}
void main(){
 float n=noise(p*1.6+time*.12),m=noise(p*4.-time*.18);
 float d=shore(p)+(n-.5)*.28;
 vec3 c=mix(shallow,mid,smoothstep(.25,1.15,d));c=mix(c,deep,smoothstep(1.,3.6,d));
 c+=(smoothstep(.62,.9,n*.6+m*.45))*.05;
 float swell=sin(d*8.5-time*1.1+m*1.5);
 float foam=smoothstep(.9,1.,swell)*smoothstep(1.25,.4,d)*.5;
 foam+=smoothstep(.42,.33,d)*.75;
 c=mix(c,vec3(.95,1.,.98),clamp(foam*(.55+m*.6),0.,.85));
 gl_FragColor=vec4(c,1.);
 #include <colorspace_fragment>
}`;
function Water(){
 const material=useRef<THREE.ShaderMaterial>(null);
 const uniforms=useMemo(()=>({time:{value:0},hexes:{value:tiles.map(t=>new THREE.Vector2(t.x*S,t.y*S))},deep:{value:new THREE.Color('#0f6f9e')},mid:{value:new THREE.Color('#1ba3c4')},shallow:{value:new THREE.Color('#74e0d8')}}),[]);
 useFrame(s=>{if(material.current)material.current.uniforms.time.value=s.clock.elapsedTime});
 return <mesh rotation-x={-Math.PI/2}><planeGeometry args={[60,60]}/><shaderMaterial ref={material} uniforms={uniforms} vertexShader={waterVertex} fragmentShader={waterFragment}/></mesh>;
}

function texture(width:number,height:number,draw:(c:CanvasRenderingContext2D)=>void){
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;draw(canvas.getContext('2d')!);
 const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;
 return t;
}
const chances=(n:number)=>6-Math.abs(7-n);
function tokenTexture(n:number){
 return texture(256,256,c=>{
  const hot=n===6||n===8;
  c.fillStyle=hot?'#ef5b4c':'#fffaf0';c.fillRect(0,0,256,256);
  c.strokeStyle=hot?'#ffd7c7':'#17617d';c.lineWidth=9;c.beginPath();c.arc(128,128,106,0,7);c.stroke();
  c.fillStyle=hot?'#fff':'#12394a';c.textAlign='center';c.textBaseline='middle';c.font='900 132px "Arial Rounded MT Bold","Trebuchet MS",Arial,sans-serif';c.fillText(String(n),128,122);
  for(let i=0;i<chances(n);i++){c.beginPath();c.arc(128+(i-(chances(n)-1)/2)*23,203,8,0,7);c.fill()}
 });
}
function Tokens({board}:{board:BoardView}){
 const faces=useMemo(()=>new Map([...new Set(tiles.map(t=>t.number))].filter(Boolean).map(n=>[n,tokenTexture(n)])),[]);
 const blocked=robberTile(board);
 return <>{tiles.map((t,i)=>!!t.number&&<group key={i} position={[t.x*S,TILE_TOP,t.y*S]} rotation-x={.16}>
  <mesh position-y={.035} castShadow><cylinderGeometry args={[.285,.3,.07,36]}/><meshStandardMaterial color={blocked===i?'#5b6266':'#b98a55'}/></mesh>
  <mesh position-y={.074} rotation-x={-Math.PI/2}><circleGeometry args={[.272,40]}/><meshBasicMaterial map={faces.get(t.number)} color={blocked===i?'#8a9092':'#ffffff'} toneMapped={false}/></mesh>
 </group>)}</>;
}
function Ground(){
 const geo=useMemo(()=>({beach:beachGeometry(),scenery:sceneryGeometry(),piers:pierGeometry(),tile:new THREE.ExtrudeGeometry(roundedHex(.845),{depth:TILE_TOP-GROUND+.02,bevelEnabled:true,bevelSize:.035,bevelThickness:.025,bevelSegments:3,curveSegments:5}).rotateX(-Math.PI/2).translate(0,GROUND-.045,0)}),[]);
 useEffect(()=>()=>Object.values(geo).forEach(g=>g.dispose()),[geo]);
 return <>
  <mesh geometry={geo.beach} receiveShadow><meshStandardMaterial vertexColors roughness={1}/></mesh>
  {tiles.map((t,i)=><mesh key={i} geometry={geo.tile} position={[t.x*S,0,t.y*S]} receiveShadow castShadow><meshStandardMaterial color={tileColors[t.resource]} roughness={.95}/></mesh>)}
  <mesh geometry={geo.scenery} castShadow receiveShadow><meshStandardMaterial vertexColors flatShading roughness={.9}/></mesh>
  <mesh geometry={geo.piers} castShadow receiveShadow><meshStandardMaterial vertexColors roughness={1}/></mesh>
 </>;
}

function sailTexture(kind:Resource|'any'){
 return texture(256,288,c=>{
  c.fillStyle='#fffaf0';c.beginPath();c.roundRect(6,6,244,276,34);c.fill();
  c.lineWidth=12;c.strokeStyle=kind==='any'?'#ef5b4c':'#1b8db0';c.stroke();
  c.fillStyle='#12394a';c.textAlign='center';c.textBaseline='middle';c.font='900 104px "Arial Rounded MT Bold","Trebuchet MS",Arial,sans-serif';
  c.fillText(kind==='any'?'3:1':'2:1',128,76);
  if(kind==='any'){c.font='900 70px "Arial Rounded MT Bold","Trebuchet MS",Arial,sans-serif';c.fillStyle='#ef5b4c';c.fillText('ANY',128,200)}
  else{c.fillStyle='#bfe0e4';c.beginPath();c.roundRect(38,132,180,128,26);c.fill();drawResource(c,kind,128,196,124)}
 });
}
function Boats(){
 const hull=useMemo(()=>boatGeometry(),[]),sails=useMemo(()=>ports.map(p=>sailTexture(p.kind)),[]);
 const group=useRef<THREE.Group>(null);
 useFrame(s=>{group.current?.children.forEach((boat,i)=>{const t=s.clock.elapsedTime*1.1+i*1.7;boat.position.y=.01+Math.sin(t)*.022;boat.rotation.z=Math.sin(t*.8)*.035})});
 return <group ref={group}>{ports.map((p,i)=>{
  const mx=(vertices[p.a].x+vertices[p.b].x)/2*S,mz=(vertices[p.a].y+vertices[p.b].y)/2*S,l=Math.hypot(mx,mz),x=mx+mx/l*1.1,z=mz+mz/l*1.1;
  return <group key={i} position={[x,0,z]}>
   <mesh geometry={hull} rotation-y={mx<0?Math.PI:0} castShadow><meshStandardMaterial vertexColors roughness={.9}/></mesh>
   <mesh position={[0,.58,.24]} rotation-x={-.62}><planeGeometry args={[.62,.7]}/><meshBasicMaterial map={sails[i]} transparent alphaTest={.4} toneMapped={false} side={THREE.DoubleSide}/></mesh>
  </group>})}</group>;
}

/* Pieces drop into place when they first appear. */
function Drop({position,rotation=0,children}:{position:[number,number,number],rotation?:number,children:React.ReactNode}){
 const ref=useRef<THREE.Group>(null),born=useRef<number|null>(null);
 useFrame(s=>{
  if(!ref.current)return;
  born.current??=s.clock.elapsedTime;
  const t=still()?1:Math.min(1,(s.clock.elapsedTime-born.current)/.55),e=1-Math.pow(1-t,3);
  ref.current.position.y=position[1]+(1-e)*1.2;
  const squash=t<1?1+Math.sin(t*Math.PI*2.5)*.12*(1-t):1;ref.current.scale.set(1/squash,squash,1/squash);
 });
 return <group ref={ref} position={position} rotation-y={rotation}>{children}</group>;
}
function Pieces({board,players}:{board:BoardView,players:Player[]}){
 const house=useMemo(()=>houseGeometry(false),[]),city=useMemo(()=>houseGeometry(true),[]);
 const color=(id:string)=>players.find(p=>p.id===id)?.color??'#ffffff';
 return <>
  {Object.entries(board.roads).map(([i,id])=>{
   const a=at(edges[+i].a),b=at(edges[+i].b);
   return <Drop key={'r'+i} position={[(a.x+b.x)/2,GROUND,(a.z+b.z)/2]} rotation={Math.atan2(-(b.z-a.z),b.x-a.x)}>
    <mesh position-y={.045} castShadow><boxGeometry args={[.68,.09,.175]}/><meshStandardMaterial color="#1d3440"/></mesh>
    <mesh position-y={.085} castShadow><boxGeometry args={[.64,.09,.125]}/><meshStandardMaterial color={color(id)} roughness={.6}/></mesh>
   </Drop>})}
  {Object.entries(board.homes).map(([i,h])=>{
   const v=at(+i);
   return <Drop key={i+(h.city?'city':'home')} position={[v.x,GROUND,v.z]}>
    <mesh position-y={.03}><cylinderGeometry args={[h.city?.285:.235,h.city?.3:.25,.07,24]}/><meshStandardMaterial color="#1d3440"/></mesh>
    <mesh geometry={h.city?city:house} position-y={.06} rotation-y={.35} scale={1.2} castShadow><meshStandardMaterial vertexColors color={color(h.id)} roughness={.55} flatShading/></mesh>
   </Drop>})}
 </>;
}
/* The robber is a raider camp pitched on the tile it blocks. */
function Raider({board}:{board:BoardView}){
 const t=tiles[robberTile(board)],ref=useRef<THREE.Group>(null);
 const target=useMemo(()=>new THREE.Vector3(t.x*S,TILE_TOP,t.y*S+(t.number?-.4:-.02)),[t]);
 useFrame((_,dt)=>{
  if(!ref.current)return;
  const far=Math.hypot(ref.current.position.x-target.x,ref.current.position.z-target.z);
  ref.current.position.lerp(target,still()?1:1-Math.exp(-dt*4));ref.current.position.y=TILE_TOP+Math.min(.9,far*.35);
 });
 return <group ref={ref}>
  <mesh position-y={.22} rotation-y={.5} castShadow><coneGeometry args={[.28,.44,6]}/><meshStandardMaterial color="#2b2533" flatShading/></mesh>
  <mesh position={[0,.11,.2]} rotation-x={-.45}><coneGeometry args={[.09,.24,3]}/><meshStandardMaterial color="#e5484d"/></mesh>
  <mesh position-y={.52} castShadow><cylinderGeometry args={[.014,.014,.32,5]}/><meshStandardMaterial color="#e9dcc0"/></mesh>
  <mesh position={[.11,.6,0]}><boxGeometry args={[.2,.13,.012]}/><meshStandardMaterial color="#e5484d"/></mesh>
 </group>;
}
function Glow({board,settled}:{board:BoardView,settled:boolean}){
 const ring=useMemo(()=>{const s=roundedHex(.955);s.holes.push(new THREE.Path(roundedHex(.86).getPoints(6).reverse()));return new THREE.ShapeGeometry(s,6).rotateX(-Math.PI/2)},[]);
 const group=useRef<THREE.Group>(null);
 useFrame(s=>{const o=still()?.9:.7+Math.sin(s.clock.elapsedTime*4)*.3;group.current?.children.forEach(m=>{((m as THREE.Mesh).material as THREE.Material).opacity=o})});
 const sum=board.dice.length?board.dice[0]+board.dice[1]:0;
 if(!settled||!sum||sum===7||board.phase==='roll')return null;
 return <group ref={group}>{tiles.map((t,i)=>t.number===sum&&i!==robberTile(board)&&<mesh key={i} geometry={ring} position={[t.x*S,TILE_TOP+.012,t.y*S]}><meshBasicMaterial color="#fff27a" transparent toneMapped={false} depthWrite={false}/></mesh>)}</group>;
}
/* Shadows are redrawn only while something moves, which keeps TV browsers smooth. */
function Sun({revision}:{revision:number}){
 const light=useRef<THREE.DirectionalLight>(null),until=useRef(0);
 useEffect(()=>{until.current=performance.now()+2500},[revision]);
 useFrame(()=>{const shadow=light.current?.shadow;if(shadow){shadow.autoUpdate=false;shadow.needsUpdate=performance.now()<until.current}});
 return <directionalLight ref={light} position={[-5,9,3.5]} intensity={2.1} color="#fff0d2" castShadow shadow-mapSize={[2048,2048]} shadow-camera-left={-6.5} shadow-camera-right={6.5} shadow-camera-top={6.5} shadow-camera-bottom={-6.5} shadow-bias={-.0006} shadow-normalBias={.02}/>;
}
export default function IslandScene({board,players,settled,onFail}:{board:BoardView,players:Player[],settled:boolean,onFail:()=>void}){
 return <Canvas shadows={{type:THREE.PCFShadowMap}} dpr={[1,1.75]} camera={{fov:26,near:1,far:80}} gl={{antialias:true,powerPreference:'high-performance',toneMapping:THREE.NoToneMapping}} onCreated={({gl})=>gl.domElement.addEventListener('webglcontextlost',()=>{if(gl.domElement.isConnected)onFail()})} aria-label="Island board" role="img">
  <color attach="background" args={['#0f6f9e']}/>
  <hemisphereLight args={['#eaf6ff','#c9a36a',1.35]}/>
  <FitCamera/><Sun revision={board.revision}/>
  <Water/><Ground/><Boats/><Tokens board={board}/><Glow board={board} settled={settled}/><Pieces board={board} players={players}/><Raider board={board}/>
 </Canvas>;
}
