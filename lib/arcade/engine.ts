import * as Phaser from 'phaser';
import type {Room} from '../controller/room';
import {drawArena,drawCircuit,drawVehicle,W,H} from './artwork';
import {trackPoint} from './circuit';
type Snapshot={room:Room,received:number};
export function launch(parent:HTMLElement,read:()=>Snapshot) {
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 class Arena extends Phaser.Scene{
  actors=new Map<string,Phaser.GameObjects.Image>();
  dynamic!:Phaser.GameObjects.Graphics;
  lastRound=0;
  create(){
   const r=read().room,texture=this.textures.createCanvas('arena',W,H)!;
   if(r.game==='turbo')drawCircuit(texture.context,r);else drawArena(texture.context,r.game);
   texture.refresh();this.add.image(0,0,'arena').setOrigin(0);
   this.dynamic=this.add.graphics();
   if(r.game!=='quiz')r.players.forEach((p,i)=>{
    const t=this.textures.createCanvas('sprite'+i,56,40)!;
    drawVehicle(t.context,p.color,r.game==='reaction');t.refresh();
    const sprite=this.add.image(0,0,'sprite'+i).setDepth(3);this.actors.set(p.id,sprite);
    if(r.game==='reaction'){
     const y=175+i*(275/Math.max(1,r.players.length-1));
     this.add.text(28,y-11,p.name,{fontFamily:'Arial',fontSize:'20px',fontStyle:'bold',color:p.color}).setDepth(2);
     this.add.rectangle(664,y,875,2,0x41546f,.7);
     for(let j=0;j<11;j++)this.add.rectangle(235+j*78,y+10,2,6,0x526582);
    }
   });
  }
  update(time:number,delta:number){
   const {room:r,received}=read(),age=r.phase==='paused'?0:Math.min(650,performance.now()-received);
   const now=r.serverTime+age,g=this.dynamic;if(!g)return;g.clear();
   if(r.game==='turbo'){
    for(const car of r.racers){
     const sprite=this.actors.get(car.id);if(!sprite)continue;
     const progress=car.progress+(car.finishedAt?0:car.speed*age/1000);
     const p=trackPoint(progress,car.lane);
     const skip=!sprite.x||r.phase==='paused'||Math.hypot(p.x-sprite.x,p.y-sprite.y)>120;
     const f=skip?1:1-Math.exp(-delta/42);sprite.x+=(p.x-sprite.x)*f;sprite.y+=(p.y-sprite.y)*f;sprite.setRotation(p.angle);
     if(car.boostUntil>now&&r.phase==='playing'){
      const size=22+(reduced?0:4*Math.sin(time*.025)),cs=Math.cos(p.angle),sn=Math.sin(p.angle);
      const x=sprite.x-14*cs,y=sprite.y-14*sn;g.fillStyle(0x54f7da,.95).fillTriangle(x-sn*4,y+cs*4,x+sn*4,y-cs*4,x-size*cs,y-size*sn);
     }
     if((car.impactUntil??0)>now){g.lineStyle(2,0xffce74,.85).strokeCircle(sprite.x,sprite.y,21)}
    }
   }else if(r.game==='reaction'){
    if(r.round!==this.lastRound){this.lastRound=r.round;this.actors.forEach(sprite=>sprite.x=225)}
    r.players.forEach((p,i)=>{
     const sprite=this.actors.get(p.id);if(!sprite)return;
     const y=175+i*(275/Math.max(1,r.players.length-1));
     const goal=p.answered&&!p.early?Math.max(380,1085-Math.min(4000,p.reactionMs??4000)*.17):225;
     if(r.phase!=='paused')sprite.x+=(goal-sprite.x)*(reduced?1:1-Math.exp(-delta/170));
     sprite.y=y;
     g.fillStyle(p.answered?0x66d4fa:0x72a4ca,.6).fillTriangle(sprite.x-12,y-4,sprite.x-12,y+4,sprite.x-(p.answered?35:21),y);
    });
   }else if(!reduced&&r.phase==='playing'){
    for(let i=0;i<14;i++){const x=(i*89+time*.011)%W,y=37+((i*57-time*.022)%(H-48)+(H-48))%(H-48);g.fillStyle(0xc79aff,.28).fillCircle(x,y,1.4)}
   }
  }
 }
 return new Phaser.Game({type:Phaser.CANVAS,parent,width:W,height:H,backgroundColor:'#121827',banner:false,audio:{noAudio:true},fps:{target:60},scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},scene:Arena});
}
