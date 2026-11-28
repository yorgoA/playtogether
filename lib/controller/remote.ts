"use client";
import {useEffect,useRef} from 'react';
// TV remotes send arrows, Enter for OK, and a Back key whose name depends on the TV.
const arrows=['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
// Samsung (Tizen) sends 10009 and LG (webOS) 461 for Back; browsers and Android TV send Escape or GoBack.
const backKeys=['GoBack','BrowserBack','XF86Back'],backCodes=[10009,461];
const focusable='button:not(:disabled),a[href],select:not(:disabled),input:not(:disabled):not([type=hidden]),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])';
const typing=(el:Element|null)=>el instanceof HTMLTextAreaElement||(el instanceof HTMLInputElement&&!['checkbox','radio','range','button','submit'].includes(el.type));
// Counts only what is on screen: hidden carousel slides keep their size but are invisible.
function visible(el:HTMLElement){
 if(!el.offsetWidth||!el.offsetHeight||el.closest('[inert],[aria-hidden=true]'))return false;
 const style=getComputedStyle(el);return style.visibility!=='hidden'&&style.opacity!=='0';
}
function targets(){
 const scope=document.querySelector('dialog[open]')??document;
 return Array.from(scope.querySelectorAll<HTMLElement>(focusable)).filter(visible);
}
// The nearest element in the arrow's direction. Gaps are measured edge to edge, so a big card beats a small
// button sitting inside it, and elements in line with the current one win over ones off to the side.
function nextFocus(from:DOMRect,key:string,els:HTMLElement[]){
 const horizontal=key==='ArrowLeft'||key==='ArrowRight',sign=key==='ArrowRight'||key==='ArrowDown'?1:-1;
 const mid=(r:DOMRect)=>horizontal?r.y+r.height/2:r.x+r.width/2;
 let best:HTMLElement|null=null,score=Infinity;
 for(const el of els){
  const r=el.getBoundingClientRect();
  const along=horizontal?r.x+r.width/2-(from.x+from.width/2):r.y+r.height/2-(from.y+from.height/2);
  if(along*sign<=4)continue;
  const gap=Math.max(0,sign>0?(horizontal?r.left-from.right:r.top-from.bottom):(horizontal?from.left-r.right:from.top-r.bottom));
  const off=Math.max(0,horizontal?Math.max(r.top-from.bottom,from.top-r.bottom):Math.max(r.left-from.right,from.left-r.right));
  // Left and right stay on the row, so the end of a row stops instead of jumping to another one.
  if(horizontal&&off>0)continue;
  const s=gap+off*4+Math.abs(mid(r)-mid(from))*.2;
  if(s<score){score=s;best=el}
 }
 return best;
}
function move(el:HTMLElement){el.focus({preventScroll:true});el.scrollIntoView({block:'nearest',inline:'nearest'})}
// Arrow keys move focus between buttons and links; Back calls `back`. A dialog keeps focus inside it.
export function useRemote(back:()=>void){
 const latest=useRef(back);
 useEffect(()=>{latest.current=back});
 useEffect(()=>{
  function key(e:KeyboardEvent){
   if(e.defaultPrevented||e.altKey||e.ctrlKey||e.metaKey)return;
   const cur=document.activeElement as HTMLElement|null,field=typing(cur);
   const isBack=backKeys.includes(e.key)||backCodes.includes(e.keyCode)||(e.key==='Backspace'&&!field)||(e.key==='Escape'&&!document.querySelector('dialog[open]'));
   if(isBack){if(e.key==='Escape'&&field){cur!.blur();return}e.preventDefault();latest.current();return}
   if(!arrows.includes(e.key))return;
   // Text fields keep Left and Right for the cursor until it reaches an end.
   if(field&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){
    const input=cur as HTMLInputElement,end=input.value.length,at=input.selectionStart??0;
    if(input.selectionStart!==input.selectionEnd||(e.key==='ArrowLeft'?at>0:at<end))return;
   }
   const els=targets();if(!els.length)return;
   e.preventDefault();
   if(!cur||cur===document.body||!document.contains(cur)){move(els.find(el=>el.matches('[data-remote-start]'))??els[0]);return}
   const next=nextFocus(cur.getBoundingClientRect(),e.key,els.filter(el=>el!==cur));
   if(next)move(next);
  }
  document.addEventListener('keydown',key);return ()=>document.removeEventListener('keydown',key);
 },[]);
}
