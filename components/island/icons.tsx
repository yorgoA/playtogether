import type {DevCard,Piece,Resource} from '@/lib/island/board';
// Drawn on a 24x24 grid so the same artwork works in React, SVG maps and canvas textures.
type Shape=[path:string,color:string];
export const resourceArt:Record<Resource,Shape[]>={
 timber:[['M3 13h14a3.5 3.5 0 0 1 0 7H3z','#8b5a35'],['M3 13a3.5 3.5 0 1 0 .01 7a3.5 3.5 0 1 0 0-7z','#e5bd85'],['M3 15a1.5 1.5 0 1 0 .01 3a1.5 1.5 0 1 0 0-3z','#a9713f'],['M8 4h11a3.5 3.5 0 0 1 0 7H8z','#9c6840'],['M8 4a3.5 3.5 0 1 0 .01 7a3.5 3.5 0 1 0 0-7z','#f0cc97'],['M8 6a1.5 1.5 0 1 0 .01 3a1.5 1.5 0 1 0 0-3z','#a9713f']],
 clay:[['M6 4h12v7H6z','#d9734a'],['M1 13h10.5v7H1z','#c25f3a'],['M12.5 13H23v7H12.5z','#cf6a42'],['M6 4h12v2H6zM1 13h10.5v2H1zM12.5 13H23v2H12.5z','#f09a70']],
 grain:[['M11.2 8h1.6v14h-1.6z','#b57a1c'],['M12 1c2.6 2.4 2.6 4.6 0 7c-2.6-2.4-2.6-4.6 0-7z','#f5c242'],['M11 12C7 12 5.5 9.5 5.5 6.5C9 7 11 8.8 11 12zM13 12c4 0 5.5-2.5 5.5-5.5C15 7 13 8.8 13 12z','#eeb02e'],['M11 17.5c-4 0-5.5-2.5-5.5-5.5c3.5.5 5.5 2.3 5.5 5.5zM13 17.5c4 0 5.5-2.5 5.5-5.5c-3.5.5-5.5 2.3-5.5 5.5z','#e09c20']],
 wool:[['M7 17h2v5H7zM14 17h2v5h-2z','#38414a'],['M7 8a4 4 0 0 1 7-2a4 4 0 0 1 5 5a4 4 0 0 1-3 7H7a5 5 0 0 1 0-10z','#fbf7ee'],['M1.5 9.5C3 7.5 7 8 7.5 10.5c.3 2.5-1 5-3 5s-3.5-3-3-6z','#38414a']],
 ore:[['M2 20L5 11l6-7l7 3l4 8l-3 5z','#7e8b9c'],['M5 11l6-7l2 8l-5 8H2z','#a9b5c2'],['M11 4l7 3l-5 5z','#cbd4dc'],['M13 12l5-5l4 8z','#939fae']],
};
export const pieceArt:Record<Piece,string>={
 road:'M2 16L18 5l4 4L6 20z',
 settlement:'M4 21V11l8-8l8 8v10z',
 city:'M2 21V10l5-6l5 6v3h10v8z',
};
export const resourceLabel:Record<Resource,string>={timber:'Wood',clay:'Brick',grain:'Wheat',wool:'Sheep',ore:'Stone'};
export function ResourceIcon({resource,className}:{resource:Resource,className?:string}){
 return <svg className={className} viewBox="-1 0 25 24" aria-hidden="true">{resourceArt[resource].map(([d,c],i)=><path key={i} d={d} fill={c}/>)}</svg>;
}
export function PieceIcon({piece,color,className}:{piece:Piece,color:string,className?:string}){
 return <svg className={className} viewBox="0 0 24 24" aria-hidden="true"><path d={pieceArt[piece]} fill={color} stroke="#12303c" strokeWidth="1.6" strokeLinejoin="round"/></svg>;
}
export function drawResource(ctx:CanvasRenderingContext2D,resource:Resource,x:number,y:number,size:number){
 ctx.save();ctx.translate(x-size/2,y-size/2);ctx.scale(size/24,size/24);
 for(const [d,c] of resourceArt[resource]){ctx.fillStyle=c;ctx.fill(new Path2D(d))}
 ctx.restore();
}
// One drawing per development card, plus the two awards.
const devArt:Record<DevCard|'trail',string>={
 knight:'M12 2l8 3v6c0 5-3.5 9-8 11c-4.5-2-8-6-8-11V5z',
 roads:'M2 10L14 3l2 3L4 13zM8 19L20 12l2 3L10 22z',
 bounty:'M12 8c-2-6-9-5-7-1c1 1 4 1 7 1c3 0 6 0 7-1c2-4-5-5-7 1zM3 9h18v4H3zM4 14h16v8H4z',
 monopoly:'M3 8l4.5 4L12 4l4.5 8L21 8l-2 10H5zM5 19.5h14V22H5z',
 victory:'M12 2l3 6.5l7 .8l-5.2 4.7l1.5 7L12 17.5L5.7 21l1.5-7L2 9.3l7-.8z',
 trail:'M4 20c0-6 12-4 12-9S8 9 8 4',
};
export const devLabel:Record<DevCard,string>={knight:'Knight',roads:'Road building',bounty:'Bounty',monopoly:'Monopoly',victory:'Victory point'};
export const devText:Record<DevCard,string>={
 knight:'Move the robber and steal a card from a neighbour. Three knights can earn the strongest army.',
 roads:'Place two roads for free.',
 bounty:'Take any two resources from the bank.',
 monopoly:'Name a resource and take every card of it from all players.',
 victory:'Worth 1 point. It counts on its own and stays secret until you win.',
};
export function DevIcon({kind,className}:{kind:DevCard|'trail',className?:string}){
 return <svg className={className} viewBox="0 0 24 24" aria-hidden="true"><path d={devArt[kind]} fill={kind==='trail'?'none':'currentColor'} stroke={kind==='trail'?'currentColor':'none'} strokeWidth="4" strokeLinecap="round" strokeDasharray={kind==='trail'?'5 5':undefined}/></svg>;
}
