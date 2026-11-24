import * as THREE from 'three';
export const suitMark:Record<string,string>={S:'♠',H:'♥',D:'♦',C:'♣'};
export const CARD_H=1.4;
const W=320,H=448;
function texture(draw:(c:CanvasRenderingContext2D)=>void){
 const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;draw(canvas.getContext('2d')!);
 const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return t;
}
const serif='900 %px Georgia,"Times New Roman",serif';
const font=(px:number)=>serif.replace('%',String(px));
function crown(c:CanvasRenderingContext2D,x:number,y:number,w:number){
 c.beginPath();c.moveTo(x-w/2,y+w*.3);c.lineTo(x-w*.56,y-w*.28);c.lineTo(x-w*.24,y);c.lineTo(x,y-w*.42);c.lineTo(x+w*.24,y);c.lineTo(x+w*.56,y-w*.28);c.lineTo(x+w/2,y+w*.3);c.closePath();c.fill();
}
export function faceTexture(card:string){
 const rank=card[0]==='T'?'10':card[0],suit=suitMark[card[1]],ink='HD'.includes(card[1])?'#c2203f':'#1d1a3a';
 return texture(c=>{
  c.fillStyle='#fff6e2';c.fillRect(0,0,W,H);
  c.strokeStyle='#d7a54a';c.lineWidth=7;c.beginPath();c.roundRect(13,13,W-26,H-26,20);c.stroke();
  c.textAlign='center';c.textBaseline='middle';
  const corner=()=>{c.fillStyle=ink;c.font=font(rank==='10'?62:72);c.fillText(rank,58,66);c.font='52px Georgia,serif';c.fillText(suit,58,126)};
  corner();c.save();c.translate(W,H);c.rotate(Math.PI);corner();c.restore();
  if('JQK'.includes(rank)){c.fillStyle='#e0ab3f';crown(c,W/2,H/2-86,88)}
  c.fillStyle=ink;
  if('JQK'.includes(rank)){c.font=font(170);c.fillText(rank,W/2,H/2+40)}
  else{c.font='190px Georgia,serif';c.fillText(suit,W/2,H/2+6)}
 });
}
export function backTexture(a:string,b:string){
 return texture(c=>{
  c.fillStyle=a;c.fillRect(0,0,W,H);c.strokeStyle='#f1c766';c.lineWidth=8;c.beginPath();c.roundRect(15,15,W-30,H-30,20);c.stroke();
  c.save();c.beginPath();c.roundRect(28,28,W-56,H-56,14);c.clip();c.strokeStyle=b;c.lineWidth=5;
  for(let i=-H;i<W+H;i+=36){c.beginPath();c.moveTo(i,0);c.lineTo(i+H,H);c.moveTo(i+H,0);c.lineTo(i,H);c.stroke()}
  c.restore();
  c.fillStyle=a;c.beginPath();c.arc(W/2,H/2,76,0,7);c.fill();c.strokeStyle='#f1c766';c.lineWidth=6;c.stroke();
  c.fillStyle='#f1c766';crown(c,W/2,H/2+8,78);
 });
}
/* A rounded card face, 1 x 1.4, with texture coordinates filling it. */
export function cardGeometry(){
 const w=1,h=CARD_H,r=.08,s=new THREE.Shape();
 s.moveTo(-w/2+r,-h/2);s.lineTo(w/2-r,-h/2);s.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);s.lineTo(w/2,h/2-r);s.quadraticCurveTo(w/2,h/2,w/2-r,h/2);s.lineTo(-w/2+r,h/2);s.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);s.lineTo(-w/2,-h/2+r);s.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);
 const g=new THREE.ShapeGeometry(s,6),p=g.attributes.position,uv=g.attributes.uv;
 for(let i=0;i<p.count;i++)uv.setXY(i,p.getX(i)/w+.5,p.getY(i)/h+.5);
 return g;
}
