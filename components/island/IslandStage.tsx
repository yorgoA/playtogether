'use client';
import {Component,lazy,Suspense,useState,type ReactNode} from 'react';
import type {BoardView} from '@/lib/island/board';
import type {Player} from '@/lib/controller/room';
import IslandMap from '../IslandMap';
const IslandScene=lazy(()=>import('./IslandScene'));
class Guard extends Component<{fallback:ReactNode,children:ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true}}
 render(){return this.state.failed?this.props.fallback:this.props.children}
}
function draws3d(){
 try{const gl=document.createElement('canvas').getContext('webgl2');gl?.getExtension('WEBGL_lose_context')?.loseContext();return !!gl}catch{return false}
}
// 3D where the screen can draw it, the flat map everywhere else.
export default function IslandStage({board,players,settled}:{board:BoardView,players:Player[],settled:boolean}){
 const [mode,setMode]=useState(draws3d);
 const flat=<IslandMap board={board} players={players}/>;
 if(!mode)return flat;
 return <Guard fallback={flat}><Suspense fallback={<p className="isl-loading">Sailing to the island…</p>}><IslandScene board={board} players={players} settled={settled} onFail={()=>setMode(false)}/></Suspense></Guard>;
}
