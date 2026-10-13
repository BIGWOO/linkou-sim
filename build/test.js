const fs=require('fs');require('./sim.js');if(!process.env.NOSURF)require('./surf.js');
const D=JSON.parse(fs.readFileSync(__dirname+'/data.json','utf8'));const LK=globalThis.LK;
const terr=LK.Terrain(D);
const arg=process.argv.slice(2);const scen=arg[0]||'before',h0=+(arg[1]||7),dur=+(arg[2]||1.5);
const net=LK.buildNet(D,scen,terr);
if(arg[3]==='net'){
  net.edges.forEach(e=>{console.log(e.id.padEnd(16),e.k,'n'+e.n,'L'+e.len.toFixed(0).padStart(5),'z',e.Z[0].toFixed(1),e.Z[e.np-1].toFixed(1),'off',Math.max(...e.OFF).toFixed(1),e.source||'',e.sink||'',e.merge?'YIELD->'+e.merge.major.id+' lane'+e.merge.mlane:'',Object.keys(e.tr).map(k=>k+'['+e.tr[k].lo+'-'+e.tr[k].hi+' s'+e.tr[k].shift+']').join(' '));});
  console.log('sources',Object.keys(net.sources),'sinks',Object.keys(net.sinks));
  let mg=0;net.edges.forEach(e=>{if(e.k==='m')for(const g of e.GR)mg=Math.max(mg,Math.abs(g));});console.log('max mainline grade',mg);
}
const sim=new LK.Sim(net,D,arg[4]?JSON.parse(arg[4]):{},h0*3600);
if(net.surf){const S=net.surf;console.log('surf links',S.links.length,'nodes',Object.keys(S.nodes).length,'signals',S.sigs.length,'ext',S.sigs.filter(c=>c.ext).map(c=>c.ext),'orig',S.orig.length,'dest',S.dest.length);for(const k in net.sources)if(net.sources[k].stub)console.log(' in',k,S.inE[k]?S.inE[k].d.toFixed(1)+' m '+D.roads[S.inE[k].e.ri].n:'NO SNAP');for(const k in net.sinks)if(net.sinks[k].stub)console.log(' out',k,S.outE[k]?S.outE[k].d.toFixed(1)+' m '+D.roads[S.outE[k].e.ri].n:'NO SNAP');}
for(const [a,b] of [['S_in','S_out'],['S_in','A_S'],['S_in','A_S_T'],['S_in','A_S_L'],['S_in','B_S'],['S_in','FLY1'],['S_in','FLY2'],['N_in','N_out'],['N_in','A_N'],['N_in','B_N'],['A_S_on','S_out'],['B_S_on','S_out'],['A_N_on','N_out'],['A_N_on2','N_out'],['B_N_on','N_out'],['VS_in','VS_out'],['VN_in','VN_out']]){const p=sim.pathFor(a,b);console.log(a,'>',b,p?p.len.toFixed(0)+' m: '+p.e.map((e,i)=>e.id+'('+p.need[i]+')').join(' '):'NO PATH');}
const T0=Date.now();const steps=dur*3600/0.25;
for(let i=0;i<steps;i++){sim.step(0.25);if(i%(1200*2)===0){const s=sim.snapshot();console.log(((sim.t/3600).toFixed(2)),'veh',s.n,'slow',s.queued,'spill',JSON.stringify(s.spill),'srcQ',JSON.stringify(s.srcQ),'forced',sim.forced||0,net.surf?'surf '+JSON.stringify(net.surf.count())+JSON.stringify(net.surf.stat):'');}}
console.log('wall ms',Date.now()-T0,'done',sim.done);
const b0=Math.floor(h0*12),b1=Math.floor((h0+dur)*12);
for(const d in sim.detG){let n=0,m=0;for(let b=b0+3;b<b1;b++){n+=(sim.bins['q:'+d]||{})[b]?sim.bins['q:'+d][b].n:0;m+=D.vol[sim.detG[d]][b].reduce((a,c)=>a+c,0);}console.log(d,'sim',n,'meas',m);}
for(const pk in sim.pairs){let o=[];for(let b=b0+3;b<b1;b+=3){const B=(sim.bins['v:'+pk]||{})[b];o.push((B&&B.n?(B.sd/B.st*3.6).toFixed(0):'-')+'/'+D.spd[sim.pairs[pk]][b].toFixed(0));}console.log(pk,'sim/meas km/h',o.join(' '));}
const mv={};for(const k in sim.bins)if(k[0]==='m'){let n=0,st=0;for(const b in sim.bins[k]){n+=sim.bins[k][b].n;st+=sim.bins[k][b].st;}mv[k]=n+' veh, '+(st/n).toFixed(0)+' s';}console.log(mv);
