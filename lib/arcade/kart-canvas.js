// Canvas fallback for TV browsers without WebGL. Project the same Three.js
// scene through each driver's actual camera, including near-plane clipping.
import {Matrix4,Vector3,Color} from '../../vendor/three/three.module.min.js';
export function canvasRenderer(){
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
  if(!ctx)throw new Error('Canvas unavailable');
  let width=1,height=1,viewport=[0,0,1,1],clip=[0,0,1,1],back='#162032';
  const objects=[],moving=[],world=new Matrix4(),local=new Matrix4(),eye=new Matrix4(),p=new Vector3(),v=new Vector3(),color=new Color();
  const faces=new Map();
  function catalog(scene){
    scene.updateMatrixWorld(true);
    scene.traverse(o=>{
      if(!o.isMesh)return;
      const g=o.geometry, pos=g.attributes.position, idx=g.index?.array;
      if(!faces.has(g)){
        const groups=[];
        for(let i=0;i<(idx?.length??pos.count);i+=3){
          const ids=[idx?.[i]??i,idx?.[i+1]??i+1,idx?.[i+2]??i+2];
          const verts=ids.map(k=>new Vector3().fromBufferAttribute(pos,k));
          const normal=verts[1].clone().sub(verts[0]).cross(verts[2].clone().sub(verts[0])).normalize();
          const shade=.72+.28*Math.abs(normal.y*.85+normal.x*.35+normal.z*.2);
          const tint=g.attributes.color?new Color().fromBufferAttribute(g.attributes.color,ids[0]):null;
          groups.push({verts,shade,tint});
        }
        faces.set(g,groups);
      }
      function record(matrix,dynamic){
        const position=new Vector3().setFromMatrixPosition(matrix);
        if(o.scale.x>4000)return;
        const rec={o,matrix,position,triangles:faces.get(g).map(f=>{
          color.copy(f.tint||o.material.color).multiplyScalar(f.shade);
          return {fill:'#'+color.getHexString(),verts:dynamic?f.verts:f.verts.map(a=>a.clone().applyMatrix4(matrix))};
        })};
        (dynamic?moving:objects).push(rec);
      }
      if(o.isInstancedMesh)for(let i=0;i<o.count;i++){o.getMatrixAt(i,local);record(world.multiplyMatrices(o.matrixWorld,local).clone(),false)}
      else record(o.matrixWorld,o.parent!==scene);
    });
  }
  return {
    domElement:canvas,setPixelRatio(){},setScissorTest(){},dispose(){},forceContextLoss(){},
    setSize(w,h){width=w;height=h;canvas.width=w;canvas.height=h},
    setViewport(...args){viewport=args},setScissor(...args){clip=args},
    setClearColor(c){back=new Color(c).getStyle()},clear(){ctx.fillStyle=back;ctx.fillRect(0,0,width,height)},
    render(scene,camera){
      if(!objects.length)catalog(scene);
      scene.updateMatrixWorld(true);camera.updateMatrixWorld();
      const [x,y,w,h]=viewport,top=height-y-h;
      ctx.save();ctx.beginPath();ctx.rect(clip[0],height-clip[1]-clip[3],clip[2],clip[3]);ctx.clip();
      const sky=ctx.createLinearGradient(0,top,0,top+h*.55);sky.addColorStop(0,'#79b9e2');sky.addColorStop(1,'#d6e6dd');
      ctx.fillStyle=sky;ctx.fillRect(x,top,w,h);
      const focal=h*.5/Math.tan(camera.fov*Math.PI/360);
      const horizon=top+h*.5-focal*camera.matrixWorld.elements[9]/Math.max(.1,camera.matrixWorld.elements[5]);
      ctx.fillStyle='#80aa6d';ctx.fillRect(x,horizon,w,top+h-horizon);
      const tris=[],cx=x+w*.5,cy=top+h*.5,view=camera.matrixWorldInverse;
      function project(record,dynamic){
        if(!record.o.visible)return;
        if(dynamic)eye.multiplyMatrices(view,record.matrix);else eye.copy(view);
        if(!dynamic&&record.o.isInstancedMesh){
          p.copy(record.position).applyMatrix4(view);
          const reach=record.o.geometry.type==='ConeGeometry'?135:40;
          if(p.z>reach||p.z< -1250||Math.abs(p.x)>-p.z*w/(2*focal)+reach)return;
        }
        for(const f of record.triangles){
          const t=f.verts.map(a=>{v.copy(a).applyMatrix4(eye);return [v.x,v.y,-v.z]});
          if(t.every(a=>a[2]<1)||t.every(a=>a[2]>1450))continue;
          const poly=[];
          for(let i=0;i<3;i++){
            const a=t[i],b=t[(i+1)%3];
            if(a[2]>=1)poly.push(a);
            if((a[2]>=1)!==(b[2]>=1)){const u=(1-a[2])/(b[2]-a[2]);poly.push([a[0]+u*(b[0]-a[0]),a[1]+u*(b[1]-a[1]),1])}
          }
          const screen=poly.map(a=>[cx+focal*a[0]/a[2],cy-focal*a[1]/a[2]]);
          if(screen.every(a=>a[0]<x)||screen.every(a=>a[0]>x+w)||screen.every(a=>a[1]<top)||screen.every(a=>a[1]>top+h))continue;
          tris.push({screen,fill:f.fill,z:(t[0][2]+t[1][2]+t[2][2])/3});
        }
      }
      for(const o of objects)project(o,false);
      for(const o of moving)project(o,true);
      tris.sort((a,b)=>b.z-a.z);
      for(const {screen,fill} of tris){ctx.beginPath();ctx.moveTo(...screen[0]);for(let i=1;i<screen.length;i++)ctx.lineTo(...screen[i]);ctx.closePath();ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=fill;ctx.lineWidth=.55;ctx.stroke()}
      ctx.restore();
    }
  };
}
