import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {ports,tiles,vertices,type Resource} from '@/lib/island/board';
// Board units are 50 per hex radius; the scene uses 1.
export const S=1/50;
export const GROUND=.16;
export const TILE_TOP=.27;
export const at=(i:number)=>({x:vertices[i].x*S,z:vertices[i].y*S});
export const tileColors:Record<Resource|'sand',string>={timber:'#4c8f4d',grain:'#e6b53c',wool:'#8fc953',clay:'#c96f45',ore:'#8d97a8',sand:'#efd79b'};

export function seeded(seed:number){
 let s=seed*7919+17;
 return ()=>{s=(s*16807)%2147483647;return s/2147483647};
}
// Distance from the land's edge: negative inside, positive out at sea.
export function shoreDistance(x:number,z:number){
 let d=99;
 for(const t of tiles){
  const px=Math.abs(x-t.x*S),pz=Math.abs(z-t.y*S);
  const hex=Math.max(px,px*.5+pz*.8660254)-.8660254;
  const k=.22,h=Math.max(k-Math.abs(d-hex),0)/k;
  d=Math.min(d,hex)-h*h*k*.25;
 }
 return d;
}
const wobble=(x:number,z:number)=>Math.sin(x*2.3+z*1.1)*.045+Math.sin(z*3.7-x*1.9)*.035+Math.sin(x*6.1+z*5.3)*.016;
const smooth=(a:number,b:number,v:number)=>{const t=Math.min(1,Math.max(0,(v-a)/(b-a)));return t*t*(3-2*t)};
export function beachGeometry(){
 const g=new THREE.PlaneGeometry(12,11,240,220);g.rotateX(-Math.PI/2);
 const p=g.attributes.position,colors=new Float32Array(p.count*3);
 const dry=new THREE.Color('#f3dfae'),path=new THREE.Color('#e9cf98'),wet=new THREE.Color('#c9a56b'),c=new THREE.Color();
 for(let i=0;i<p.count;i++){
  const x=p.getX(i),z=p.getZ(i),d=shoreDistance(x,z)+wobble(x,z);
  p.setY(i,GROUND-smooth(.14,.62,d)*.5+(d<.1?Math.sin(x*23)*Math.sin(z*19)*.004:0));
  c.copy(path).lerp(dry,smooth(-.1,.12,d)).lerp(wet,smooth(.25,.4,d));
  colors.set([c.r,c.g,c.b],i*3);
 }
 g.setAttribute('color',new THREE.BufferAttribute(colors,3));g.computeVertexNormals();
 return g;
}
export function roundedHex(radius:number){
 const shape=new THREE.Shape(),corners=Array.from({length:6},(_,i)=>{const a=(60*i-90)*Math.PI/180;return new THREE.Vector2(Math.cos(a)*radius,Math.sin(a)*radius)});
 corners.forEach((c,i)=>{
  const before=c.clone().lerp(corners[(i+5)%6],.15),after=c.clone().lerp(corners[(i+1)%6],.15);
  if(i)shape.lineTo(before.x,before.y);else shape.moveTo(before.x,before.y);
  shape.quadraticCurveTo(c.x,c.y,after.x,after.y);
 });
 shape.closePath();return shape;
}

/* Scenery is many tiny low-poly parts merged into one mesh, so it costs a single draw call. */
type Part=THREE.BufferGeometry;
function tint(g:Part,color:string){
 const out=g.index?g.toNonIndexed():g;
 out.deleteAttribute('uv');
 const c=new THREE.Color(color),n=out.attributes.position.count,colors=new Float32Array(n*3);
 for(let i=0;i<n;i++)colors.set([c.r,c.g,c.b],i*3);
 out.setAttribute('color',new THREE.BufferAttribute(colors,3));out.computeVertexNormals();
 return out;
}
const move=(g:Part,x:number,y:number,z:number)=>g.translate(x,y,z);
const cone=(r:number,h:number,n=6)=>new THREE.ConeGeometry(r,h,n).translate(0,h/2,0);
const tube=(top:number,bottom:number,h:number,n=6)=>new THREE.CylinderGeometry(top,bottom,h,n).translate(0,h/2,0);
const box=(w:number,h:number,d:number)=>new THREE.BoxGeometry(w,h,d).translate(0,h/2,0);
const ball=(r:number,detail=1)=>new THREE.IcosahedronGeometry(r,detail);

const pines=['#2f6f46','#3b8050','#276041','#4c9156'];
function pine(x:number,z:number,s:number,rnd:()=>number):Part[]{
 const c=pines[Math.floor(rnd()*pines.length)];
 return [tint(move(tube(.022*s,.03*s,.09*s),x,TILE_TOP,z),'#7a5233'),tint(move(cone(.13*s,.24*s,7),x,TILE_TOP+.06*s,z),c),tint(move(cone(.095*s,.2*s,7),x,TILE_TOP+.19*s,z),c)];
}
function palm(x:number,y:number,z:number,s:number,rnd:()=>number):Part[]{
 const lean=(rnd()-.5)*.5,parts:Part[]=[],turn=rnd()*6;
 parts.push(tint(move(tube(.02*s,.034*s,.36*s,5).rotateZ(lean),x,y,z),'#a1774b'));
 const tx=x-Math.sin(lean)*.36*s,ty=y+Math.cos(lean)*.36*s;
 for(let i=0;i<6;i++){
  const leaf=cone(.055*s,.27*s,4).scale(1,1,.35).rotateX(0).rotateZ(-1.95).rotateY(turn+i*Math.PI/3);
  parts.push(tint(move(leaf,tx,ty,z),i%2?'#3f9a57':'#58b265'));
 }
 return parts;
}
function sheep(x:number,z:number,rnd:()=>number):Part[]{
 const a=rnd()*6.28,parts=[tint(ball(.07).scale(1.25,.95,.95).translate(0,.085,0),'#fffaf0'),tint(ball(.035,0).translate(.095,.11,0),'#3c3f47')];
 for(const [lx,lz] of [[-.04,-.03],[.04,-.03],[-.04,.03],[.04,.03]])parts.push(tint(tube(.009,.009,.05,4).translate(lx,0,lz),'#3c3f47'));
 return parts.map(p=>move(p.rotateY(a),x,TILE_TOP,z));
}
function around(rnd:()=>number,count:number,inner:number,outer:number,gap:number){
 const spots:{x:number,z:number}[]=[];
 for(let tries=0;spots.length<count&&tries<500;tries++){
  const x=(rnd()*2-1)*outer,z=(rnd()*2-1)*outer,r=Math.hypot(x,z);
  if(r<inner||Math.max(Math.abs(x),Math.abs(x)*.5+Math.abs(z)*.866)>outer*.86)continue;
  if(spots.every(p=>Math.hypot(p.x-x,p.z-z)>gap))spots.push({x,z});
 }
 // Back to front keeps the token readable: taller pieces are scaled by callers using z.
 return spots;
}
function scenery(resource:Resource|'sand',rnd:()=>number):Part[]{
 const out:Part[]=[],add=(...p:Part[])=>out.push(...p);
 if(resource==='timber')for(const p of around(rnd,19,.37,.8,.145))add(...pine(p.x,p.z,(p.z>.1?.72:1.05)+rnd()*.25,rnd));
 if(resource==='grain'){
  for(let row=-5;row<=5;row++){
   const z=row*.125;
   for(let x=-.7;x<=.7;x+=.052){
    if(Math.hypot(x,z)<.34||Math.max(Math.abs(x),Math.abs(x)*.5+Math.abs(z)*.866)>.68)continue;
    if(Math.hypot(x-.42,z+.4)<.2||Math.hypot(x+.4,z-.45)<.17)continue;
    add(tint(move(cone(.03,.1+rnd()*.055,4),x,TILE_TOP,z+rnd()*.02),rnd()>.5?'#f6cf5a':'#d99b25'));
   }
  }
  // A mill and a couple of bales give every field a landmark.
  add(tint(move(tube(.065,.1,.27,8),.42,TILE_TOP,-.4),'#fff3dc'),tint(move(cone(.1,.12,8),.42,TILE_TOP+.27,-.4),'#d0563f'));
  for(let i=0;i<4;i++)add(tint(box(.032,.2,.012).rotateZ(.5+i*Math.PI/2).translate(.42,TILE_TOP+.25,-.29),'#8b5b3b'));
  for(const [x,z] of [[-.46,.44],[-.33,.48]])add(tint(move(new THREE.CylinderGeometry(.062,.062,.1,10).rotateZ(Math.PI/2),x,TILE_TOP+.062,z),'#eec25a'));
 }
 if(resource==='wool'){
  for(const p of around(rnd,7,.4,.76,.22))add(...sheep(p.x,p.z,rnd));
  for(const p of around(rnd,9,.4,.82,.2))add(tint(ball(.035+rnd()*.03,0).scale(1,.7,1).translate(p.x,TILE_TOP+.015,p.z),rnd()>.4?'#6aae3e':'#79bb48'));
  for(let i=0;i<5;i++){const x=-.36+i*.18;add(tint(move(box(.022,.11,.022),x,TILE_TOP,-.58),'#a67a4e'));if(i<4)add(tint(move(box(.18,.018,.014),x+.09,TILE_TOP+.065,-.58),'#b98c5d'))}
 }
 if(resource==='clay'){
  for(const [x,z,r] of [[-.38,-.3,.25],[.36,-.36,.28],[.5,.16,.16],[-.52,.2,.15]])for(let k=0;k<3;k++)add(tint(move(tube(r*(.82-k*.24),r*(1-k*.24),.085,7).rotateY(rnd()*2),x,TILE_TOP+k*.085,z),['#b75b37','#d27a4e','#e79a6c'][k]));
  for(const [x,z] of [[-.16,.52],[.2,.5]])for(let k=0;k<4;k++)add(tint(move(box(.12,.05,.06),x+(k%2?.07:-.06)*(k<2?1:.3),TILE_TOP+(k<2?0:.05),z+(k>1?.01:0)),k%2?'#e58c60':'#cc6b42'));
 }
 if(resource==='ore'){
  for(const [x,z,r,h] of [[-.34,-.32,.29,.58],[.12,-.5,.26,.5],[.42,-.22,.26,.52],[-.55,.08,.18,.28],[.55,.2,.16,.24]]){
   const sides=6,turn=rnd()*2;
   add(tint(cone(r,h,sides).rotateY(turn).translate(x,TILE_TOP-.01,z),rnd()>.5?'#78849a':'#69758a'),tint(cone(r*.37,h*.37,sides).rotateY(turn).translate(x,TILE_TOP+h*.645,z),'#f4f8fb'));
  }
  for(const p of around(rnd,9,.4,.74,.13))if(p.z>.1)add(tint(new THREE.OctahedronGeometry(.045+rnd()*.03).scale(.7,1.5,.7).translate(p.x,TILE_TOP+.05,p.z),rnd()>.5?'#7fd9e0':'#a6b4c4'));
 }
 if(resource==='sand'){
  for(const [x,z,r] of [[-.36,.36,.24],[.36,.4,.2],[.5,-.05,.22],[-.5,-.1,.2]])add(tint(ball(r).scale(1.2,.3,.75).translate(x,TILE_TOP-.01,z),'#f6e2ab'));
  add(...palm(-.4,TILE_TOP,-.36,1.15,rnd),...palm(-.22,TILE_TOP,-.5,.9,rnd));
  add(tint(move(tube(.1,.13,.02,12),.4,TILE_TOP,-.4),'#46b9cf'));
 }
 return out;
}
export function sceneryGeometry(){
 const parts:Part[]=[];
 tiles.forEach((t,i)=>{for(const p of scenery(t.resource,seeded(i+3)))parts.push(p.translate(t.x*S,0,t.y*S))});
 // Dress the beach with palms, rocks and parasols, away from the piers.
 const rnd=seeded(91),piers=ports.map(p=>({x:(vertices[p.a].x+vertices[p.b].x)/2*S,z:(vertices[p.a].y+vertices[p.b].y)/2*S}));
 for(let i=0;i<46;i++){
  const a=i/46*Math.PI*2+rnd()*.05;let r=2.8;
  while(shoreDistance(Math.cos(a)*r,Math.sin(a)*r)<.2&&r<6)r+=.03;
  const x=Math.cos(a)*r,z=Math.sin(a)*r;
  if(piers.some(p=>Math.hypot(p.x-x,p.z-z)<.62))continue;
  if(i%3===0)parts.push(...palm(x,GROUND-.03,z,.8+rnd()*.35,rnd));
  else if(i%7===1){
   parts.push(tint(move(tube(.01,.01,.24,5),x,GROUND-.03,z),'#fff5e0'));
   parts.push(tint(move(cone(.15,.09,8),x,GROUND+.16,z),['#ff6f61','#ffd166','#52c7c0'][i%3]));
  }else if(i%4===2)for(let k=0;k<3;k++)parts.push(tint(ball(.04+rnd()*.06,0).translate(x+rnd()*.2,GROUND-.08,z+rnd()*.2),k%2?'#8f949a':'#a8aaa8'));
 }
 const merged=mergeGeometries(parts)!;parts.forEach(p=>p.dispose());
 return merged;
}
export function pierGeometry(){
 const parts:Part[]=[];
 for(const p of ports){
  const a=at(p.a),b=at(p.b),mx=(a.x+b.x)/2,mz=(a.z+b.z)/2,len=Math.hypot(mx,mz),end={x:mx+mx/len*.8,z:mz+mz/len*.8};
  // One gangway from each harbor corner, so players can see exactly which corners trade.
  for(const c of [a,b]){
   const dx=end.x-c.x,dz=end.z-c.z,l=Math.hypot(dx,dz),n=Math.floor(l/.085),angle=Math.atan2(dx,dz);
   for(let i=2;i<n-1;i++)parts.push(tint(box(.17,.03,.062).rotateY(angle).translate(c.x+dx*i/n,GROUND+.015,c.z+dz*i/n),i%2?'#b5834f':'#9d6f42'));
   for(const f of [.45,.82])for(const side of [-1,1])parts.push(tint(tube(.02,.02,.4,5).translate(c.x+dx*f+Math.cos(angle)*.095*side,-.16,c.z+dz*f-Math.sin(angle)*.095*side),'#6f4b30'));
  }
 }
 return mergeGeometries(parts)!;
}
export function boatGeometry(){
 const hull=new THREE.Shape();hull.moveTo(-.34,0);hull.quadraticCurveTo(0,-.17,.4,0);hull.quadraticCurveTo(0,.17,-.34,0);
 const body=new THREE.ExtrudeGeometry(hull,{depth:.13,bevelEnabled:true,bevelSize:.035,bevelThickness:.035,bevelSegments:2,curveSegments:8}).rotateX(-Math.PI/2).translate(0,-.02,0);
 const deck=new THREE.ExtrudeGeometry(hull,{depth:.02,bevelEnabled:false,curveSegments:8}).rotateX(-Math.PI/2).scale(.9,1,.9).translate(0,.145,0);
 return mergeGeometries([tint(body,'#8d4f33'),tint(deck,'#d7a469'),tint(tube(.017,.022,.75,6),'#6b452b')])!;
}
export function houseGeometry(city:boolean){
 const parts:Part[]=[];
 const house=(w:number,h:number,d:number,x:number)=>{
  const roof=new THREE.Shape();roof.moveTo(-w*.6,0);roof.lineTo(0,w*.55);roof.lineTo(w*.6,0);roof.closePath();
  parts.push(tint(box(w,h,d).translate(x,0,0),'#dddddd'),tint(new THREE.ExtrudeGeometry(roof,{depth:d*1.15,bevelEnabled:false}).translate(x,h,-d*.575),'#ffffff'),tint(box(w*.26,h*.6,.012).translate(x,0,d/2+.005),'#3a2f2a'));
 };
 if(city){
  house(.22,.18,.24,.1);house(.19,.34,.2,-.11);
  parts.push(tint(tube(.008,.008,.16,4).translate(-.11,.42,0),'#3a2f2a'),tint(box(.1,.06,.01).translate(-.055,.5,0),'#ffffff'));
 }else house(.25,.16,.25,0);
 return mergeGeometries(parts)!;
}
