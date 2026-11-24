// Closed Catmull–Rom spline resampled at equal distances so speed stays consistent through bends.
const knots=[[510,432],[220,431],[102,380],[105,280],[175,204],[175,121],[253,77],[379,83],[484,166],[575,176],[652,110],[740,87],[960,115],[1084,186],[1108,285],[1032,361],[893,367],[778,321],[691,347],[631,413]];
function interpolate(i:number,t:number,k:number){
 const val=(offset:number)=>knots[(i+offset+knots.length)%knots.length][k];
 const a=val(-1),b=val(0),c=val(1),d=val(2);
 return .5*(2*b+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);
}
const samples:{x:number,y:number,d:number}[]=[];
for(let i=0;i<=knots.length*32;i++){
 const j=Math.floor(i/32)%knots.length,t=(i%32)/32;
 const x=interpolate(j,t,0),y=interpolate(j,t,1),prev=samples.at(-1);
 samples.push({x,y,d:prev?prev.d+Math.hypot(x-prev.x,y-prev.y):0});
}
const length=samples.at(-1)!.d;
export function trackPoint(progress:number,lane=0){
 const distance=((progress%1+1)%1)*length;
 let l=0,h=samples.length-1;
 while(h-l>1){const m=(h+l)>>1;if(samples[m].d<=distance)l=m;else h=m}
 const a=samples[l],b=samples[h],f=(distance-a.d)/(b.d-a.d);
 const angle=Math.atan2(b.y-a.y,b.x-a.x);
 return {x:a.x+(b.x-a.x)*f-Math.sin(angle)*lane*23,y:a.y+(b.y-a.y)*f+Math.cos(angle)*lane*23,angle};
}
