'use client';
import {Component,Suspense,useState,type ReactNode} from 'react';
class Guard extends Component<{fallback:ReactNode,children:ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true}}
 render(){return this.state.failed?this.props.fallback:this.props.children}
}
function draws3d(){
 try{const gl=document.createElement('canvas').getContext('webgl2');gl?.getExtension('WEBGL_lose_context')?.loseContext();return !!gl}catch{return false}
}
// 3D where the screen can draw it, flat cards everywhere else.
export default function Stage({flat,children}:{flat:ReactNode,children:(fail:()=>void)=>ReactNode}){
 const [mode,setMode]=useState(draws3d);
 return <div className="dr-stage">{mode?<Guard fallback={flat}><Suspense fallback={<p className="dr-loading">Setting the scene…</p>}>{children(()=>setMode(false))}</Suspense></Guard>:flat}</div>;
}
