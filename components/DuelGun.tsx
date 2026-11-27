'use client';
// A revolver seen from behind the hand, pointing at the TV. The classes in duel.css raise, fire and lower it.
const chambers=Array.from({length:6},(_,i)=>i*60);
export default function DuelGun({spent}:{spent:boolean}){
 return <svg className="dg-gun" viewBox="0 0 300 440" aria-hidden="true">
  <defs>
   <linearGradient id="dg-steel" x1="0" x2="1"><stop offset="0" stopColor="#2b3038"/><stop offset=".28" stopColor="#8c96a3"/><stop offset=".5" stopColor="#d9e0e8"/><stop offset=".72" stopColor="#7b8490"/><stop offset="1" stopColor="#22262d"/></linearGradient>
   <linearGradient id="dg-dark" x1="0" x2="1"><stop offset="0" stopColor="#15181d"/><stop offset=".5" stopColor="#5b636f"/><stop offset="1" stopColor="#12151a"/></linearGradient>
   <linearGradient id="dg-wood" x1="0" x2="1"><stop offset="0" stopColor="#3a1d10"/><stop offset=".5" stopColor="#9a5a30"/><stop offset="1" stopColor="#321809"/></linearGradient>
   <linearGradient id="dg-skin" x1="0" x2="1"><stop offset="0" stopColor="#8a5338"/><stop offset=".5" stopColor="#d79a70"/><stop offset="1" stopColor="#8a5338"/></linearGradient>
   <radialGradient id="dg-fire"><stop offset="0" stopColor="#fff"/><stop offset=".35" stopColor="#fff2a0"/><stop offset=".7" stopColor="#ff9a2e"/><stop offset="1" stopColor="#ff5a1f00"/></radialGradient>
  </defs>
  <g className="dg-flash"><circle cx="150" cy="44" r="92" fill="url(#dg-fire)"/><path d="M150-70 166 16 226-34 186 34 262 44 186 56 222 118 166 72 150 130 134 72 78 118 114 56 38 44 114 34 74-34 134 16Z" fill="#fff3b0"/></g>
  <g className="dg-smoke" fill="#e8e4dc"><circle cx="150" cy="36" r="22"/><circle cx="132" cy="24" r="17"/><circle cx="170" cy="20" r="19"/></g>
  <path d="M96 440c-8-46 2-84 30-96h48c28 12 38 50 30 96Z" fill="url(#dg-wood)"/>
  <path d="M134 178 139 52h22l5 126Z" fill="url(#dg-steel)"/><path d="M145 178 148 52h4l3 126Z" fill="#f3f7fb" opacity=".5"/>
  <ellipse cx="150" cy="52" rx="11" ry="4" fill="#0c0e11"/><path d="M147 50V34q3-5 6 0v16Z" fill="#ff5a3c"/>
  <path d="M104 172q46-18 92 0l8 86q-54 20-108 0Z" fill="url(#dg-steel)"/>
  <g fill="#1a1e24" opacity=".65"><path d="M116 176h9l2 62h-13ZM145 170h10v66h-10ZM175 176h9l2 62h-13Z"/></g>
  <path d="M92 250q58 24 116 0l6 62q-64 26-128 0Z" fill="url(#dg-dark)"/>
  <g className="dg-drum"><circle cx="150" cy="282" r="30" fill="#0d1014"/>{chambers.map(a=><circle key={a} cx={150+19*Math.sin(a*Math.PI/180)} cy={282-19*Math.cos(a*Math.PI/180)} r="7.5" fill={spent&&a===0?'#07090b':'#d7a441'} stroke="#5e4414" strokeWidth="2"/>)}</g>
  <path d="M139 160h7v-12h8v12h7v12h-22Z" fill="#14171c"/>
  <g className="dg-hammer"><path d="M141 322 144 276q6-10 12 0l3 46Z" fill="url(#dg-steel)"/><path d="M140 290h20M141 297h18M141 304h18" stroke="#23272e" strokeWidth="2.5"/></g>
  <path d="M54 440c-10-60 6-112 46-124 18-5 26 8 22 24-5 22 0 60 6 100Z" fill="url(#dg-skin)"/><path d="M246 440c10-60-6-112-46-124-18-5-26 8-22 24 5 22 0 60-6 100Z" fill="url(#dg-skin)"/>
  <path d="M76 372q22-10 44-4M74 404q24-9 48-3M180 368q22-6 44 4M178 401q24-6 48 3" stroke="#6f3f28" strokeWidth="4" fill="none" strokeLinecap="round" opacity=".6"/>
 </svg>;
}
