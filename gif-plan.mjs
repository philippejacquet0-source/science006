export const gifSize={width:1280,height:1000};
// GIF delays are integral hundredths of a second. Keep the exact total of 3 s.
export function framePlan(start,end){
 if(!Number.isInteger(start)||!Number.isInteger(end)||end<start)throw new Error('Période du cluster invalide.');
 const count=Math.min(60,end-start+1);
 return Array.from({length:count},(_,i)=>({t:count===1?start:start+Math.round(i*(end-start)/(count-1)),delay:10*(Math.floor((i+1)*300/count)-Math.floor(i*300/count))}));
}
export function europeView(stations,event,box){
 // Fixed European extent, expanded only when the selected cluster requires it.
 let west=-13,east=36,south=34,north=71;
 for(const s of event.ids){const p=stations[s];west=Math.min(west,p.lon-2);east=Math.max(east,p.lon+2);south=Math.min(south,p.lat-2);north=Math.max(north,p.lat+2);}
 const merc=lat=>Math.log(Math.tan(Math.PI/4+Math.max(-85,Math.min(85,lat))*Math.PI/360));
 const left=west*Math.PI/180,right=east*Math.PI/180,top=merc(north),bottom=merc(south),scale=Math.min(box.w/(right-left),box.h/(top-bottom)),cx=(left+right)/2,cy=(top+bottom)/2;
 const project=(lon,lat)=>[box.x+box.w/2+(lon*Math.PI/180-cx)*scale,box.y+box.h/2-(merc(lat)-cy)*scale];
 return {project,visible:([x,y])=>x>=box.x&&x<=box.x+box.w&&y>=box.y&&y<=box.y+box.h};
}
