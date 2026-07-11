export class Minimap {
  constructor(canvas, onCommand) {
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.onCommand=onCommand;
    canvas.addEventListener('pointerdown',e=>{const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height,b=this.bounds||78;this.onCommand?.({x:(x*2-1)*b,z:(y*2-1)*b})});
  }
  update(world, teams, combatants, player, observer = null) {
    if(!world)return;const ctx=this.ctx,w=this.canvas.width,h=this.canvas.height,b=world.bounds||78;this.bounds=b;ctx.clearRect(0,0,w,h);
    const map=(x,z)=>({x:(x/b*.5+.5)*w,y:(z/b*.5+.5)*h});
    const grad=ctx.createLinearGradient(0,0,0,h);grad.addColorStop(0,'#415f4c');grad.addColorStop(1,'#284736');ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);
    if(world.hasWater){const riverA=map(-b,-5),riverB=map(b,11);ctx.fillStyle='rgba(51,174,225,.7)';ctx.fillRect(0,riverA.y,w,riverB.y-riverA.y)}
    ctx.strokeStyle='rgba(255,255,255,.13)';ctx.lineWidth=1;for(let i=1;i<4;i++){ctx.beginPath();ctx.moveTo(i*w/4,0);ctx.lineTo(i*w/4,h);ctx.stroke();ctx.beginPath();ctx.moveTo(0,i*h/4);ctx.lineTo(w,i*h/4);ctx.stroke()}
    for(const team of teams){const base=world.basePositions[team.id];if(!base)continue;const p=map(base.x,base.z),color=`#${team.color.toString(16).padStart(6,'0')}`;ctx.save();ctx.shadowColor=color;ctx.shadowBlur=9;ctx.fillStyle=color;ctx.fillRect(p.x-7,p.y-7,14,14);ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.strokeRect(p.x-8,p.y-8,16,16);ctx.restore()}
    for(const zone of world.crateDropZones||[]){const p=map(zone.position.x,zone.position.z),color=`#${zone.color.toString(16).padStart(6,'0')}`;ctx.save();ctx.strokeStyle=color;ctx.fillStyle='rgba(10,18,27,.8)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,zone.kind==='rare'?6:5,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle=color;ctx.font='bold 7px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(zone.kind==='rare'?'R':'C',p.x,p.y+.5);ctx.restore()}
    for(const crate of world.crates){if(crate.carried||crate.placed)continue;const p=map(crate.group.position.x,crate.group.position.z),color=`#${crate.crateType.color.toString(16).padStart(6,'0')}`;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.PI/4);ctx.fillStyle=color;ctx.fillRect(-2.5,-2.5,5,5);ctx.restore();if(crate.dropMarker){ctx.strokeStyle='#ff263d';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(p.x-5,p.y-5);ctx.lineTo(p.x+5,p.y+5);ctx.moveTo(p.x+5,p.y-5);ctx.lineTo(p.x-5,p.y+5);ctx.stroke()}}
    for(const unit of combatants){if(unit.dead||!unit.team)continue;const t=teams.find(v=>v.id===unit.team);if(!t)continue;const p=map(unit.group.position.x,unit.group.position.z),color=`#${t.color.toString(16).padStart(6,'0')}`;ctx.fillStyle=color;ctx.beginPath();ctx.arc(p.x,p.y,unit===player?4:2.7,0,Math.PI*2);ctx.fill();if(unit===player){ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.stroke()}}
    if(observer?.camera){const focus=observer.focus||player?.group?.position||{x:0,z:0},p=map(focus.x,focus.z);ctx.save();ctx.translate(p.x,p.y);ctx.strokeStyle='#fff';ctx.fillStyle='rgba(255,210,63,.25)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,8,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(0,-13);ctx.lineTo(-5,-5);ctx.lineTo(5,-5);ctx.closePath();ctx.fillStyle='#ffd23f';ctx.fill();ctx.restore()}
    ctx.strokeStyle='rgba(255,255,255,.8)';ctx.lineWidth=2;ctx.strokeRect(1,1,w-2,h-2);
  }
}
