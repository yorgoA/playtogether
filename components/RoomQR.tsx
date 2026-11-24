"use client";
import { useMemo } from 'react';
import QRCode from '@/lib/controller/qr';
export default function RoomQR({url}:{url:string}) {
 const data=useMemo(()=>{
  const qr=new QRCode(0,0);
  qr.addData(url); qr.make();
  const size=qr.getModuleCount(), path=[];
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) if(qr.isDark(y,x)) path.push('M'+(x+4)+' '+(y+4)+'h1v1h-1z');
  return {size:size+8,path:path.join('')};
 },[url]);
 return <svg className="pt-room-qr" viewBox={'0 0 '+data.size+' '+data.size} role="img" aria-label="Scan with a phone to join the room" shapeRendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path d={data.path} fill="#15131e"/></svg>
}
