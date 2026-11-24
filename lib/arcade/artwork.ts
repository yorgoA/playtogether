import {trackPoint} from './circuit';
import type {Room} from '../controller/room';
type C=CanvasRenderingContext2D;
export const W=1200,H=516;
function rect(c:C,x:number,y:number,w:number,h:number,color:string){c.fillStyle=color;c.fillRect(x,y,w,h)}
function polygon(c:C,pts:number[][],color:string){c.fillStyle=color;c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fill()}
function circle(c:C,x:number,y:number,r:number,color:string){c.fillStyle=color;c.beginPath();c.arc(x,y,r,0,2*Math.PI);c.fill()}
function text(c:C,v:string,x:number,y:number,size:number,color:string){c.fillStyle=color;c.font='italic 900 '+size+'px Arial';c.textAlign='center';c.fillText(v,x,y)}
function seed(){let n=71243;return()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/4294967296)}
function tree(c:C,x:number,y:number,s:number){
 c.save();c.translate(x,y);c.scale(s,s);polygon(c,[[-5,1],[18,8],[30,5],[2,-7]],'#173b36');rect(c,-2,-8,4,12,'#755435');
 for(let k=0;k<3;k++){const y=-k*7,w=10-k*1.6;polygon(c,[[-w,y],[0,y-18],[w,y]],['#1e604b','#2d7754','#3b9061'][k]);polygon(c,[[0,y-18],[w,y],[1,y-2]],'#245641')}
 c.restore();
}
export function drawCircuit(c:C,room:Room){
 const random=seed();rect(c,0,0,W,H,'#487b54');
 for(let i=0;i<24;i++)polygon(c,[[i*80-500,0],[i*80-455,0],[i*80+25,H],[i*80-20,H]],'#508458');
 for(let i=0;i<6300;i++){const x=random()*W,y=random()*H;rect(c,x,y,random()*4+1,1,random()>.5?'#89a56c55':'#355d4755')}
 const pts=Array.from({length:641},(_,i)=>trackPoint(i/640));
 // Pines are clipped naturally by the road layers drawn over their bases.
 for(let i=0;i<650;i++){
   const x=random()*W,y=random()*H;
   if(pts.some((p,j)=>j%5===0&&Math.hypot(x-p.x,y-p.y)<48))continue;
   if(x>375&&x<700&&y>200&&y<325)continue;
   tree(c,x,y,.6+random()*.7);
 }
 function stroke(width:number,color:string,dash:number[]=[]){c.lineWidth=width;c.strokeStyle=color;c.lineJoin='round';c.setLineDash(dash);c.beginPath();pts.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.stroke();c.setLineDash([])}
 stroke(89,'#305340');stroke(82,'#bba67f');stroke(73,'#ece7d8');stroke(73,'#c64c42',[15,15]);stroke(60,'#373f43');stroke(55,'#4d5354');stroke(47,'#4a5052');stroke(2,'#ced0bf99',[13,15]);
 for(let i=0;i<9000;i++){const p=trackPoint(random(),random()*2.45-1.225);rect(c,p.x,p.y,1,1,random()>.5?'#ffffff18':'#00000021')}
 const finish=trackPoint(0);c.save();c.translate(finish.x,finish.y);c.rotate(finish.angle);
 for(let i=0;i<3;i++)for(let j=0;j<12;j++)rect(c,i*5-8,j*5-30,5,5,(i+j)%2?'#20232a':'#f7edcc');c.restore();
 for(const h of room.hazards||[]){const p=trackPoint(h.at,h.lane);c.save();c.translate(p.x,p.y);c.rotate(p.angle);for(const y of [-5,4]){rect(c,-4,y-2,12,7,'#382f2d');polygon(c,[[-4,y+3],[2,y-4],[8,y+3]],'#ff8c45');rect(c,0,y,4,2,'#fff2c2')}c.restore()}
 for(const pad of room.pads||[]){const p=trackPoint(pad.at,pad.lane);c.save();c.translate(p.x,p.y);c.rotate(p.angle);rect(c,-14,-9,28,18,'#164c52');for(const x of [-9,-2,5])polygon(c,[[x,-6],[x+5,0],[x,6],[x+3,6],[x+8,0],[x+3,-6]],'#6af3d4');c.restore()}
 // Pit garages and canopy roofs alongside the home straight.
 for(let i=0;i<7;i++){const x=258+i*43;rect(c,x+3,476,40,24,'#304a40');rect(c,x,471,40,23,'#f0e4be');rect(c,x,472,40,5,i%2?'#fb8056':'#3c9caa');rect(c,x+4,480,31,9,'#425655');rect(c,x+6,481,27,2,'#778b80')}
 c.save();c.translate(537,259);c.rotate(-.055);text(c,'PINECREST',0,0,42,'#d9e2b2');text(c,'RACEWAY',0,23,20,'#ccdaa4');c.restore();
}
export function drawArena(c:C,kind:string){
 const quiz=kind==='quiz',random=seed();
 const gradient=c.createLinearGradient(0,0,W,H);gradient.addColorStop(0,quiz?'#211353':'#091d37');gradient.addColorStop(.55,quiz?'#49257d':'#19334f');gradient.addColorStop(1,quiz?'#270f48':'#101830');
 c.fillStyle=gradient;c.fillRect(0,0,W,H);
 for(let i=0;i<180;i++){const x=random()*W,y=random()*H;circle(c,x,y,.7+random()*1.4,quiz?'#dfa3ff65':'#c6eaff88')}
 if(quiz){
  for(const x of [40,155,1045,1160]){polygon(c,[[x,0],[x+17,0],[x+110,310],[x-110,310]],'#ae87ff14');circle(c,x+7,7,7,'#ffffc7')}
  for(let k=0;k<5;k++){c.strokeStyle='#b899ff28';c.lineWidth=3;c.beginPath();c.ellipse(600,40,530+k*30,360+k*21,0,0,Math.PI*2);c.stroke()}
  for(let i=0;i<96;i++){const x=i*14-45,y=495+Math.sin(i*2.7)*4;circle(c,x,y,9,['#8451b6','#522b80','#71449b'][i%3]);circle(c,x,y-10,5,'#745394')}
 }else{
  for(let i=0;i<2;i++){c.strokeStyle=i?'#526291':'#304777';c.lineWidth=1;c.beginPath();for(let x=0;x<W+12;x+=8){const y=107+i*14+Math.sin(x*.014+i*3)*27+Math.sin(x*.037)*10;x?c.lineTo(x,y):c.moveTo(x,y)}c.stroke()}
  for(let i=0;i<18;i++){const x=i*75;rect(c,x,493,57,8,'#34445a');rect(c,x,493,17,3,'#ffa85d')}
 }
}
export function drawVehicle(c:C,color:string,ship:boolean){
 c.translate(28,20);
 if(ship){polygon(c,[[-16,-7],[-23,-16],[3,-9],[21,0],[3,9],[-23,16],[-16,6]],'#0b1325');polygon(c,[[-18,-12],[3,-6],[21,0],[3,6],[-18,12],[-10,0]],color);polygon(c,[[-9,-4],[6,-3],[13,0],[5,3],[-9,4]],'#d3ecff');rect(c,-15,-3,6,6,'#655580');return}
 rect(c,-14,-10,10,5,'#171a26');rect(c,6,-10,9,5,'#171a26');rect(c,-14,5,10,5,'#171a26');rect(c,6,5,9,5,'#171a26');
 polygon(c,[[-17,-6],[-11,-8],[12,-7],[18,-4],[18,4],[12,7],[-11,8],[-17,6]],color);
 rect(c,-14,-6,3,12,'#1f2530');polygon(c,[[-7,-5],[3,-5],[8,-3],[8,3],[3,5],[-7,5]],'#223440');rect(c,-2,-4,5,8,'#9bcad1');rect(c,10,-1,7,2,'#fff3cb');rect(c,14,-5,2,3,'#ffe1a3');rect(c,14,2,2,3,'#ffe1a3');
}
