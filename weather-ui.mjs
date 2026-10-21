import {HOUR,validateWeather,frameAt,cellBounds,sampleWeather,associateRain,followRain,nullschoolUrl,forecastEligible} from './weather-engine.mjs';
const $ = id => document.getElementById(id);
const label = epoch => new Date(epoch).toLocaleString('fr-FR',{timeZone:'UTC',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})+' UTC';
const fmt = (n,d=1) => n===null||!Number.isFinite(n)?'—':n.toLocaleString('fr-FR',{maximumFractionDigits:d});

export class WeatherUI {
  constructor(map) {
    this.map=map;this.epoch=0;this.pack=null;this.catalogue=null;this.state=null;this.enabled=true;
    this.mode='both';this.opacity=.6;this.lead=0;this.manualCell=null;this.station=null;
    map.createPane('weatherPane').style.zIndex=420;
    this.outlines=L.layerGroup().addTo(map);
    const Raster=L.Layer.extend({
      onAdd: target=>{this.canvas=L.DomUtil.create('canvas','weather-raster');target.getPane('weatherPane').append(this.canvas);target.on('moveend zoomend resize',this.paint,this);this.paint();},
      onRemove: target=>{target.off('moveend zoomend resize',this.paint,this);this.canvas.remove();}
    });
    this.raster=new Raster().addTo(map);
    $('weather-toggle').onclick=()=>{this.enabled=!this.enabled;$('weather-toggle').setAttribute('aria-pressed',this.enabled);this.render();};
    for(const b of document.querySelectorAll('[data-weather-layer]'))b.onclick=()=>{this.mode=b.dataset.weatherLayer;this.render();};
    $('weather-opacity').oninput=()=>{this.opacity=Number($('weather-opacity').value)/100;this.paint();};
    $('weather-wind').onchange=()=>this.paint();
    $('weather-source').onchange=()=>this.loadEntry(this.catalogue.entries.find(e=>e.id===$('weather-source').value));
    $('weather-lead').onchange=()=>{this.lead=Number($('weather-lead').value);this.render();};
    $('weather-auto').onclick=()=>{this.manualCell=null;this.render();};
    $('weather-import-open').onclick=()=>$('weather-import').click();
    $('weather-import').onchange=async()=>{
      const file=$('weather-import').files[0];if(!file)return;
      const token=++this.epoch;
      try{if(file.size>30000000)throw new Error('Fichier météo trop volumineux.');const candidate=await this.decode(new Response(file),file.name.endsWith('.gz'));
        if(token!==this.epoch)return;this.pack=candidate;this.manualCell=null;this.entryName='Fichier local';
        const option=new Option('Fichier météo importé','local-weather');$('weather-source').append(option);$('weather-source').value='local-weather';this.render();
      }catch(e){if(token===this.epoch)$('weather-status').textContent='Import refusé : '+e.message+' Les données précédentes sont conservées.';}
    };
    map.on('click',event=>{
      if(!this.enabled||!this.pack||!this.state)return;
      const frame=frameAt(this.pack,this.radioTime()),sample=sampleWeather(this.pack,frame,{lat:event.latlng.lat,lon:event.latlng.lng});
      if(!sample)return;this.manualCell=sample.index;this.render();
    });
  }

  async decode(response,compressed) {
    if(!response.ok)throw new Error('Données météo indisponibles.');
    let data;
    if(compressed){if(typeof DecompressionStream==='undefined')throw new Error('Ce navigateur ne peut pas ouvrir les archives météo comprimées.');data=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).json();}
    else data=await response.json();
    return validateWeather(data);
  }

  async loadDataset(datasetId) {
    const token=++this.epoch;this.pack=null;this.manualCell=null;this.station=null;this.entryName='';this.outlines.clearLayers();this.paint();
    this.clearContext();
    $('weather-status').textContent='Chargement des champs d’eau et de précipitations…';
    try{
      if(!this.catalogue){const r=await fetch('./data/weather/catalogue.json');if(!r.ok)throw new Error('Catalogue météo indisponible.');this.catalogue=await r.json();}
      if(token!==this.epoch)return;
      const entries=this.catalogue.entries.filter(e=>e.datasets.includes(datasetId));
      $('weather-source').replaceChildren(...entries.map(e=>new Option(e.label,e.id)));
      const entry=entries.find(e=>e.kind==='archive');
      if(!entry)throw new Error('Aucune météo embarquée pour cette collecte. Importez un fichier météo ou ouvrez Nullschool.');
      await this.loadEntry(entry);
    }catch(e){if(token===this.epoch)$('weather-status').textContent=e.message;}
  }

  async loadEntry(entry) {
    if(!entry)return;const token=++this.epoch;this.pack=null;this.manualCell=null;this.outlines.clearLayers();this.paint();
    this.clearContext();
    $('weather-status').textContent='Chargement : '+entry.label+'…';
    try{
      const pack=await this.decode(await fetch(entry.path),entry.path.endsWith('.gz'));
      if(token!==this.epoch)return;
      this.pack=pack;this.entryName=entry.label;this.render();
    }catch(e){if(token===this.epoch)$('weather-status').textContent=e.message+' La carte radiologique reste disponible.';}
  }

  update(state) {
    if(this.state?.meta!==state.meta||this.state?.selected?.id!==state.selected?.id)this.manualCell=null;
    this.state=state;this.render();
  }

  inspectStation(station) {this.station=station;this.renderStation();}
  clearContext() {
    $('weather-map-tag').hidden=true;
    $('weather-provenance').textContent='';
    $('weather-association').textContent='Association en attente des nouveaux champs météo.';
    $('weather-station').textContent='Valeurs météo en cours de chargement.';
  }
  gifSnapshot() {return this.enabled&&this.pack?{pack:this.pack,mode:this.mode,opacity:this.opacity,lead:this.lead}:null;}
  radioTime() {return this.state.meta.origin+this.state.instant*HOUR;}

  render() {
    for(const b of document.querySelectorAll('[data-weather-layer]'))b.setAttribute('aria-pressed',b.dataset.weatherLayer===this.mode);
    this.outlines.clearLayers();
    if(!this.state)return;
    const epoch=this.radioTime(),target=epoch+this.lead*HOUR;
    $('weather-nullschool-water').href=nullschoolUrl(target,'total_precipitable_water');
    $('weather-nullschool-cloud').href=nullschoolUrl(target,'total_cloud_water');
    $('weather-nullschool-rain').href=nullschoolUrl(target,'precip_3hr');
    $('weather-time').textContent=label(target);
    $('weather-time-note').textContent=this.lead?`Météo +${this.lead} h · mesures radio au ${label(epoch)}`:'Météo et mesures radio à la même heure';
    $('weather-map-tag').hidden=!this.enabled||!this.pack;
    $('weather-map-time').textContent=(this.pack?.source.kind==='forecast'?'PRÉVISION MÉTÉO':'MÉTÉO RECONSTITUÉE')+' · '+label(target);
    $('weather-map-time').title='Les balises restent à l’heure indiquée dans le repère radiologique.';
    const pack=this.pack;
    if(!pack){this.paint();return;}
    const source=pack.source;
    $('weather-provenance').textContent=`${source.model} · ${source.provider} · échantillonnage ${pack.grid.step}° · ${source.kind==='forecast'?'calcul initialisé le '+label(Date.parse(source.runInitializedAt)):'archive de prévisions assemblées a posteriori'} · CC BY 4.0`;
    this.blocked=!forecastEligible(pack,epoch);
    this.frame=this.blocked?null:frameAt(pack,target);
    const base=this.blocked?null:frameAt(pack,epoch);
    if(!this.enabled)$('weather-status').textContent='Couches météo masquées. Réactivez Météo pour les comparer au cluster.';
    else if(this.blocked)$('weather-status').textContent='Ce calcul est trop récent pour ce repère historique : marge prudente de 6 h après son initialisation. Choisissez une heure plus tardive ou l’archive.';
    else if(!this.frame)$('weather-status').textContent='Pas de champ météo à cette heure dans ce fichier. Aucune valeur n’est extrapolée.';
    else $('weather-status').textContent=(source.kind==='forecast'?'Prévision météo issue d’un calcul daté. L’heure exacte de publication n’est pas archivée.':'Reconstitution météo : les heures suivantes ne constituent pas une prévision émise à l’époque.')+' Les balises restent des mesures ; aucune dose future n’est calculée.';
    const activeIds=[...new Set(this.state.selected?.nodes.filter(n=>n.t===this.state.instant).flatMap(n=>n.ids)||[])];
    const stations=activeIds.map(i=>this.state.meta.stations[i]);
    const candidates=associateRain(pack,base,stations);
    let candidate=candidates[0];
    if(this.manualCell!==null){
      // Manual selection is a meteorological object, never an assertion of cause.
      const all=associateRain(pack,base,[{lat:pack.grid.lats[Math.floor(this.manualCell/pack.grid.lons.length)],lon:pack.grid.lons[this.manualCell%pack.grid.lons.length]}]);
      candidate=all[0];
    }
    let text;
    if(!base)text='Association indisponible : pas de champ à l’heure radiologique.';
    else if(!candidate)text=stations.length?'Aucune structure pluvieuse ≥ 0,2 mm sur les cellules des balises actives. Cliquez sur une zone pluvieuse pour explorer une autre structure.':'Aucune balise active à cette heure. Cliquez sur une zone pluvieuse pour la suivre.';
    else{
      const cells=new Set(candidate.cells),hits=stations.filter(p=>{const s=sampleWeather(pack,base,p);return s&&cells.has(s.index);}).length;
      text=`Structure ${this.manualCell===null?'candidate':'choisie'} · ${candidate.cells.length} cellules · ${hits}/${stations.length} balises actives sous cette emprise pluvieuse · maximum ${fmt(candidate.maxRain)} mm sur l’heure.`;
      const tracked=followRain(pack,epoch,candidate.cells,this.lead);
      if(this.enabled&&this.frame&&tracked){
        for(const i of tracked.cells)L.rectangle(cellBounds(pack.grid,i),{pane:'radioPane',color:this.lead?'#4055ad':'#136f78',weight:1.3,dashArray:this.lead?'5 5':'3 3',fill:false,interactive:false}).addTo(this.outlines);
        if(this.lead)text+=` Suivi météo à +${this.lead} h : ${tracked.branches} branche(s).`;
      }else if(this.lead)text+=' Suivi interrompu : structure dissipée, déplacement trop grand ou données absentes.';
    }
    $('weather-association').textContent=text;
    $('weather-key-water').hidden=this.mode==='rain';$('weather-key-rain').hidden=this.mode==='water';
    this.renderStation();this.paint();
  }

  renderStation() {
    if(!this.station||!this.pack||!this.state){$('weather-station').textContent='Cliquez sur une balise pour lire l’eau et la pluie dans sa cellule météo.';return;}
    const frame=this.blocked?null:frameAt(this.pack,this.radioTime()+this.lead*HOUR),sample=sampleWeather(this.pack,frame,this.station);
    $('weather-station').textContent=`${this.station.id} · ${sample?`${fmt(sample.water)} kg/m² d’eau précipitable · ${fmt(sample.rain,2)} mm sur l’heure commençant à ${label(this.radioTime()+this.lead*HOUR)}`:'hors couverture météo à cette heure'}`;
  }

  paint() {
    if(!this.canvas)return;
    const size=this.map.getSize(),canvas=this.canvas;canvas.width=size.x;canvas.height=size.y;
    L.DomUtil.setPosition(canvas,this.map.containerPointToLayerPoint([0,0]));
    const ctx=canvas.getContext('2d');ctx.clearRect(0,0,size.x,size.y);
    if(!this.enabled||!this.pack||!this.state||this.blocked)return;
    const frame=frameAt(this.pack,this.radioTime()+this.lead*HOUR);if(!frame)return;
    const grid=this.pack.grid;
    for(let i=0;i<frame.rain.length;i++){
      const bounds=cellBounds(grid,i),a=this.map.latLngToContainerPoint([bounds[1][0],bounds[0][1]]),b=this.map.latLngToContainerPoint([bounds[0][0],bounds[1][1]]);
      if(b.x<0||a.x>size.x||b.y<0||a.y>size.y)continue;
      const water=frame.water[i],rain=frame.rain[i];
      if(this.mode!=='rain'&&water!==null){const f=Math.min(1,Math.max(0,water/45));ctx.fillStyle=`rgba(${Math.round(215-140*f)},${Math.round(226-150*f)},${Math.round(240-65*f)},${this.opacity*.62})`;ctx.fillRect(a.x,a.y,b.x-a.x+.6,b.y-a.y+.6);}
      if(this.mode!=='water'&&rain!==null&&rain>=.05){const f=Math.min(1,Math.log1p(rain)/Math.log(6));ctx.fillStyle=`rgba(${Math.round(45+100*f)},${Math.round(161-95*f)},${Math.round(190+30*f)},${this.opacity*(.35+.6*f)})`;ctx.fillRect(a.x,a.y,b.x-a.x+.6,b.y-a.y+.6);}
      if($('weather-wind').checked&&i%2===0&&frame.u850[i]!==null&&frame.v850[i]!==null){
        const u=frame.u850[i],v=frame.v850[i],speed=Math.hypot(u,v);if(speed<1)continue;
        const x=(a.x+b.x)/2,y=(a.y+b.y)/2,len=Math.min(23,8+speed*.45),dx=u/speed*len,dy=-v/speed*len;
        ctx.strokeStyle='rgba(29,67,75,.65)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x-dx/2,y-dy/2);ctx.lineTo(x+dx/2,y+dy/2);ctx.moveTo(x+dx/2-dx*.25-dy*.15,y+dy/2-dy*.25+dx*.15);ctx.lineTo(x+dx/2,y+dy/2);ctx.lineTo(x+dx/2-dx*.25+dy*.15,y+dy/2-dy*.25-dx*.15);ctx.stroke();
      }
    }
  }
}
