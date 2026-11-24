import * as T from '../../vendor/three/three.module.min.js';
import { trackPoint } from './circuit';

import {canvasRenderer} from './kart-canvas';

export function launchKarts(parent, read) {
  let renderer;
  try { renderer = new T.WebGLRenderer({ antialias:true, powerPreference:'high-performance' }); }
  catch { renderer = canvasRenderer(); }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  parent.appendChild(renderer.domElement);
  const scene = new T.Scene();
  scene.background = new T.Color(0x9ed5eb);
  scene.fog = new T.FogExp2(0xb5d8dc, .0017);
  scene.add(new T.HemisphereLight(0xfff4dc, 0x70818f, 2.0));
  const sun = new T.DirectionalLight(0xffe0a2, 2.3);
  sun.position.set(-100, 210, 90);
  scene.add(sun);
  const box = new T.BoxGeometry(), cone = new T.ConeGeometry(1, 1, 7);
  const materials = new Map();
  function material(color) {
    if (!materials.has(color)) materials.set(color,new T.MeshStandardMaterial({color, flatShading:true, side:T.DoubleSide}));
    return materials.get(color);
  }
  function part(group, geometry, color, x,y,z, w,h,d) {
    const mesh = new T.Mesh(geometry, material(color));
    mesh.position.set(x,y,z); mesh.scale.set(w,h,d); group.add(mesh);
    return mesh;
  }
  part(scene,box,0x68a963,580,-3,250,5000,5,5000);
  // Combine repeated terrain and roadside objects into one draw call per material.
  const batches = new Map(), dummy = new T.Object3D();
  function instance(shape,color,x,y,z,w,h,d,yaw=0) {
    const key=shape.uuid+color;
    if (!batches.has(key)) batches.set(key,{shape,color,matrices:[]});
    dummy.position.set(x,y,z); dummy.rotation.set(0,yaw,0); dummy.scale.set(w,h,d);
    dummy.updateMatrix(); batches.get(key).matrices.push(dummy.matrix.clone());
  }
  function strip(left,right,height,color,alternating) {
    const xyz=[],rgb=[];
    for(let i=0;i<600;i++){
      const a=i/600,b=(i+1)/600;
      const corners=[trackPoint(a,left),trackPoint(a,right),trackPoint(b,right),trackPoint(b,left)];
      const c=new T.Color(alternating && Math.floor(i/2)%2?alternating:color);
      for (const index of [0,1,2,0,2,3]){
        const p=corners[index]; xyz.push(p.x,height,p.y); rgb.push(c.r,c.g,c.b);
      }
    }
    const g=new T.BufferGeometry();
    g.setAttribute('position',new T.Float32BufferAttribute(xyz,3)); g.setAttribute('color',new T.Float32BufferAttribute(rgb,3));
    scene.add(new T.Mesh(g,new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide})));
  }
  strip(-1.46,1.46,0,0x434c58); strip(-1.45,-1.32,.12,0xf5efe0,0xdc604f); strip(1.32,1.45,.12,0xf5efe0,0xdc604f);
  function roadside(at,lane,shape,color,w,h,d,height) {
    const p=trackPoint(at,lane);
    instance(shape,color,p.x,height,p.y,w,h,d,-p.angle);
  }
  for(let i=0;i<120;i++)roadside(i/120,0,box,0xe9dda9,6,.15,.65,.1);
  for(let i=0;i<16;i++)for(let j=0;j<2;j++)
    roadside(j*.0009, -1.27+i*.17,box,(i+j)%2?0x18202a:0xffffee,3,.15,4,.3);
  const initial=read().room;
  for(const h of initial.hazards){
    roadside(h.at,h.lane,box,0x42333a,4,1,4,.55);
    roadside(h.at,h.lane,cone,0xff702e,2.3,5,2.3,3);
    roadside(h.at,h.lane,cone,0xffefd1,1.6,2,1.6,3.4);
  }
  for(const p of initial.pads) {
    roadside(p.at,p.lane,box,0x07c8d0,12,.3,15,.24);
    for(let j=0;j<3;j++)roadside(p.at+j*.0009-.0009,p.lane,box,0xddffff,.9,.2,11,.47);
  }
  const points=Array.from({length:400},(_,i)=>trackPoint(i/400));
  let seed=53;
  function random(){seed=(1664525*seed+1013904223)>>>0;return seed/4294967296}
  for(let i=0;i<900;i++){
    const x=random()*1650-250,z=random()*940-250;
    if(points.some(p=>Math.hypot(p.x-x,p.y-z)<56))continue;
    const h=15+random()*33;
    instance(box,0x7d5743,x,h*.2,z,3,h*.4,3);
    instance(cone,i%2?0x256450:0x34704f,x,h*.53,z,h*.29,h*.74,h*.29);
    instance(cone,0x428568,x,h*.78,z,h*.19,h*.53,h*.19);
  }
  for(let i=0;i<35;i++){
    const a=i*2*Math.PI/35,h=95+random()*155,x=580+Math.cos(a)*980,z=250+Math.sin(a)*820;
    instance(cone,0x708a9a,x,h*.5,z,180,h,170);
    instance(cone,0xe2ece9,x,h*.87,z,48,h*.26,45);
  }
  for(const lane of [-1.6,1.6])roadside(0,lane,box,0x192f40,3,26,3,13);
  roadside(0,0,box,0x142c39,4,5,78,26);
  for(let j=0;j<20;j++)roadside(0,(j-9.5)*.16,box,j%2?0xfaf5e4:0x253343,4.2,2,3.8,26);
  for(const {shape,color,matrices} of batches.values()){
    const mesh=new T.InstancedMesh(shape,material(color),matrices.length);
    matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));scene.add(mesh);
  }
  const drivers=new Map();
  for(const player of initial.players){
    const kart=new T.Group();
    part(kart,box,player.color,0,2.1,0,8.8,2.2,5.6);
    part(kart,box,0x2b3440,3.4,1.25,0,2.7,1.3,6);
    part(kart,box,player.color,-3.5,3.8,0,1.8,.8,7.1);
    part(kart,box,0x293744,-.8,3.7,0,3.1,2.6,3);
    part(kart,new T.SphereGeometry(1,12,8),player.color,-.5,5.5,0,1.7,1.7,1.7);
    part(kart,box,0x20344a,.8,5.6,0,.7,.8,2.6);
    for(const x of [-2.9,2.8])for(const z of [-3,3])
      part(kart,new T.CylinderGeometry(1,1,1,12),0x20202b,x,1.4,z,1.5,1.2,1.5).rotation.x=Math.PI/2;
    const jets=part(kart,cone,0x69ffff,-5.4,1.7,0,1.3,4,1.5);
    jets.rotation.z=Math.PI/2;
    scene.add(kart); drivers.set(player.id,{kart,jets,camera:new T.PerspectiveCamera(64,1,.3,1900)});
  }
  let frame=0,last=0,width=0,height=0;
  renderer.setScissorTest(true);
  function draw(time){
    const {room,received}=read(),dt=Math.min(.1,(time-last)/1000); last=time;
    const cars=room.racers, n=cars.length;
    if(width!==parent.clientWidth||height!==parent.clientHeight){
      width=parent.clientWidth; height=parent.clientHeight;renderer.setSize(width,height,false);
    }
    for(const car of cars){
      const d=drivers.get(car.id); if(!d)continue;
      const age=room.phase==='playing'&&!car.finishedAt?Math.min(.7,(time-received)/1000):0;
      const target=Math.min(3,car.progress+Math.max(0,age)*car.speed);
      const snap=d.progress===undefined || Math.abs(target-d.progress)>.08 || room.phase==='paused' || car.finishedAt;
      const blend=snap?1:1-Math.exp(-dt*17);
      d.progress=(d.progress??target)+(target-(d.progress??target))*blend;
      d.lane=(d.lane??car.lane)+(car.lane-(d.lane??car.lane))*blend;
      const p=trackPoint(d.progress,d.lane),aim=trackPoint(d.progress+.005,d.lane);
      const yaw=Math.atan2(aim.y-p.y,aim.x-p.x);
      d.kart.position.set(p.x,.2,p.y);
      d.kart.rotation.y=-yaw+(car.driftCharge?car.driftDirection*.22:0);
      d.jets.visible=car.boostUntil>room.serverTime;
      const back=trackPoint(d.progress-.0065,d.lane),front=trackPoint(d.progress+.009,d.lane*.8);
      d.camera.position.set(back.x,12.5,back.y); d.camera.lookAt(front.x,3,front.y);
    }
    renderer.setScissor(0,0,width,height);renderer.setClearColor(0x162032);renderer.clear();
    cars.forEach((car,i)=>{
      const columns=n>=3 && !(n===3&&i===2)?2:1, rows=n>1?2:1;
      const w=Math.floor(width/columns),h=Math.floor(height/rows);
      const x=columns===2?i%2*w:0,y=rows===2 && (n===2?i===0:i<2)?height-h:0;
      const camera=drivers.get(car.id)?.camera; if(!camera||!w||!h)return;
      camera.aspect=w/h; camera.updateProjectionMatrix();
      renderer.setViewport(x,y,w,h);renderer.setScissor(x,y,w-(columns>1?1:0),h-(rows>1?1:0));
      renderer.render(scene,camera);
    });
    frame=requestAnimationFrame(draw);
  }
  frame=requestAnimationFrame(draw);
  return ()=>{
    cancelAnimationFrame(frame);
    const geometries=new Set(),mats=new Set();
    scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)mats.add(o.material);if(o.isInstancedMesh)o.dispose()});
    geometries.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());
    renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();
  };
}
