"use client";
// Every sound is made here from oscillators and noise, so there is nothing to download.
const key='playtogether.muted';
let audio:AudioContext|null=null,muted:boolean|null=null;
export function isMuted(){if(muted===null){try{muted=localStorage.getItem(key)==='1'}catch{muted=false}}return muted}
export function setMuted(value:boolean){muted=value;try{localStorage.setItem(key,value?'1':'0')}catch{}}
// Browsers allow sound only after a tap, so the first one anywhere wakes it up.
function context(){
 if(typeof AudioContext==='undefined')return null;
 audio??=new AudioContext();if(audio.state!=='running')audio.resume().catch(()=>{});return audio;
}
if(typeof window!=='undefined')window.addEventListener('pointerdown',()=>context(),{passive:true});
function tone(c:AudioContext,freq:number,at:number,length:number,{type='sine' as OscillatorType,volume=.2,to=freq}={}){
 const o=c.createOscillator(),g=c.createGain(),t=c.currentTime+at;
 o.type=type;o.frequency.setValueAtTime(freq,t);o.frequency.exponentialRampToValueAtTime(to,t+length);
 g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(volume,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+length);
 o.connect(g).connect(c.destination);o.start(t);o.stop(t+length+.02);
}
function noise(c:AudioContext,at:number,length:number,volume:number,freq:number){
 const b=c.createBuffer(1,Math.ceil(c.sampleRate*length),c.sampleRate),d=b.getChannelData(0);
 for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*(1-i/d.length);
 const s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();
 s.buffer=b;f.type='lowpass';f.frequency.value=freq;g.gain.value=volume;
 s.connect(f).connect(g).connect(c.destination);s.start(c.currentTime+at);
}
const notes=(c:AudioContext,list:number[],step:number,length:number,options={})=>list.forEach((f,i)=>tone(c,f,i*step,length,options));
// A drum roll that gets louder and faster.
function roll(c:AudioContext,seconds:number){for(let t=0,gap=.11;t<seconds;t+=gap,gap=Math.max(.045,gap*.985))noise(c,t,.09,.08+.22*t/seconds,420)}
const sounds={
 spin:(c:AudioContext)=>tone(c,620,0,.05,{type:'square',volume:.05}),
 landed:(c:AudioContext)=>notes(c,[523,659,784],.08,.35,{type:'triangle'}),
 tick:(c:AudioContext)=>tone(c,900,0,.05,{volume:.12}),
 hurry:(c:AudioContext)=>tone(c,1300,0,.1,{type:'square',volume:.1}),
 question:(c:AudioContext)=>notes(c,[392,587],.12,.3,{type:'triangle'}),
 power:(c:AudioContext)=>tone(c,220,0,.4,{type:'sawtooth',volume:.1,to:880}),
 pick:(c:AudioContext)=>{tone(c,480,0,.09,{type:'triangle',to:760});tone(c,960,.07,.12,{type:'triangle',volume:.14})},
 lock:(c:AudioContext)=>tone(c,700,0,.14,{type:'triangle',volume:.16,to:1050}),
 suspense:(c:AudioContext)=>roll(c,4),
 crossed:(c:AudioContext)=>{tone(c,160,0,.25,{type:'square',volume:.16,to:60});noise(c,0,.12,.25,900)},
 right:(c:AudioContext)=>notes(c,[523,659,784,1047],.09,.4,{type:'triangle',volume:.25}),
 wrong:(c:AudioContext)=>notes(c,[311,262,196],.17,.32,{type:'sawtooth',volume:.12}),
 drum:(c:AudioContext)=>roll(c,2.6),
 step:(c:AudioContext)=>{tone(c,130,0,.3,{to:55,volume:.4});notes(c,[392,523],.06,.25,{type:'triangle'})},
 win:(c:AudioContext)=>{notes(c,[523,523,523,698,880,1047],.16,.5,{type:'sawtooth',volume:.1});[523,659,784,1047].forEach(f=>tone(c,f,1.05,1.6,{type:'triangle',volume:.14}));noise(c,1.05,.9,.2,6000)},
 cheer:(c:AudioContext)=>tone(c,500+Math.random()*400,0,.12,{volume:.1,to:1200}),
};
export type Sound=keyof typeof sounds;
export function play(name:Sound){
 if(isMuted())return;
 // A sound that could not start on time must not play late.
 const c=context();if(c&&c.state==='running')sounds[name](c);
}
