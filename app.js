const $=s=>document.querySelector(s);
let map, routeLayer, routeData=null, lastReport='';
const R=6371008.8;
function hav(a,b){let p=Math.PI/180,dLat=(b.lat-a.lat)*p,dLon=(b.lon-a.lon)*p,x=Math.sin(dLat/2)**2+Math.cos(a.lat*p)*Math.cos(b.lat*p)*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(x))}
function fmtDist(m){return m>=1000?(m/1000).toFixed(m>=10000?1:2).replace('.',',')+' km':Math.round(m)+' m'}
function fmtTime(h){let m=Math.round(h*60),hh=Math.floor(m/60),mm=m%60;return hh+' h '+String(mm).padStart(2,'0')}
function esc(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}

async function readFile(file){
  const ext=file.name.toLowerCase().split('.').pop();
  if(ext==='kmz'){const z=await JSZip.loadAsync(file);let k=Object.keys(z.files).find(x=>x.toLowerCase().endsWith('.kml'));if(!k)throw Error('KMZ sans fichier KML');return parseKml(await z.files[k].async('text'),file.name)}
  const text=await file.text();
  if(ext==='gpx')return parseGpx(text,file.name);
  if(ext==='kml')return parseKml(text,file.name);
  throw Error('Format non supporté');
}
function parseGpx(x,name){
  const d=new DOMParser().parseFromString(x,'application/xml'); if(d.querySelector('parsererror'))throw Error('GPX XML invalide');
  let pts=[...d.querySelectorAll('trkpt,rtept,wpt')].map(n=>({lat:+n.getAttribute('lat'),lon:+n.getAttribute('lon'),ele:+(n.querySelector('ele')?.textContent||NaN),name:n.querySelector('name')?.textContent?.trim()||''})).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon));
  // Prefer track/route points for the line; waypoints are retained separately.
  const line=[...d.querySelectorAll('trkseg')].flatMap(s=>[...s.querySelectorAll('trkpt')]).map(n=>({lat:+n.getAttribute('lat'),lon:+n.getAttribute('lon'),ele:+(n.querySelector('ele')?.textContent||NaN),name:''})).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon));
  if(!line.length)line=[...d.querySelectorAll('rtept')].map(n=>({lat:+n.getAttribute('lat'),lon:+n.getAttribute('lon'),ele:+(n.querySelector('ele')?.textContent||NaN),name:''}));
  if(!line.length)throw Error('Aucune trace exploitable');
  const w=[...d.querySelectorAll('wpt')].map(n=>({lat:+n.getAttribute('lat'),lon:+n.getAttribute('lon'),ele:+(n.querySelector('ele')?.textContent||NaN),name:n.querySelector('name')?.textContent?.trim()||''})).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon));
  return buildData(name,line,w);
}
function parseKml(x,name){
  const d=new DOMParser().parseFromString(x,'application/xml'); if(d.querySelector('parsererror'))throw Error('KML XML invalide');
  let line=[];
  [...d.querySelectorAll('LineString coordinates')].some(n=>{const p=parseCoords(n.textContent);if(p.length>1){line=p;return true}return false});
  if(!line.length)[...d.querySelectorAll('gx\\:Track,Track')].some(n=>{const wh=[...n.querySelectorAll('when')].map(q=>q.textContent);const cs=[...n.querySelectorAll('gx\\:coord,coord')];const p=cs.map(q=>{let a=q.textContent.trim().split(/\\s+/).map(Number);return {lon:a[0],lat:a[1],ele:a[2]??NaN}});if(p.length>1){line=p;return true}return false});
  if(line.length<2)throw Error('Aucune LineString/Track exploitable dans le KML');
  const w=[...d.querySelectorAll('Placemark')].map(pm=>{let c=pm.querySelector('Point coordinates');if(!c)return null;let p=parseCoords(c.textContent)[0];if(!p)return null;return {...p,name:pm.querySelector('name')?.textContent?.trim()||''}}).filter(Boolean);
  return buildData(name,line,w);
}
function parseCoords(s){return s.trim().split(/\\s+/).map(t=>{let a=t.split(',').map(Number);return {lon:a[0],lat:a[1],ele:a[2]??NaN}}).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon))}
function buildData(name,pts,wpts){
  let dist=0,up=0,down=0,max=-Infinity,min=Infinity,hasEle=pts.some(p=>Number.isFinite(p.ele));
  for(let i=1;i<pts.length;i++){let dh=Number.isFinite(pts[i].ele)&&Number.isFinite(pts[i-1].ele)?pts[i].ele-pts[i-1].ele:NaN;let ds=hav(pts[i-1],pts[i]);dist+=ds;if(Number.isFinite(dh)){if(dh>0)up+=dh;else down-=dh;max=Math.max(max,pts[i].ele);min=Math.min(min,pts[i].ele)}}
  if(Number.isFinite(pts[0].ele)){max=Math.max(max,pts[0].ele);min=Math.min(min,pts[0].ele)}
  const slopes=[];for(let i=1;i<pts.length;i++){let ds=hav(pts[i-1],pts[i]);if(ds>2&&Number.isFinite(pts[i].ele)&&Number.isFinite(pts[i-1].ele))slopes.push(Math.abs((pts[i].ele-pts[i-1].ele)/ds*100))}
  let steep=slopes.filter(x=>x>=15).length, very=slopes.filter(x=>x>=25).length;
  const speed=4.5-Math.min(1.5,up/1000*0.25)-Math.min(.8,Math.max(0,dist/1000-15)*.04);
  const duration=Math.max(.7,dist/1000/Math.max(2.2,speed)+up/600);
  const diff=dist/1000<8&&up<300?'Facile':(dist/1000<15&&up<700?'Modérée':(dist/1000<22&&up<1100?'Difficile':'Très difficile'));
  routeData={name,pts,wpts,dist,up,down,max,min,hasEle,steep,very,duration,diff,slopes};
  return routeData;
}

function analyze(){
  const d=routeData;
  $('#dashboard').classList.remove('hidden');
  $('#routeName').textContent=d.name.replace(/\.(gpx|kml|kmz)$/i,'');
  $('#routeMeta').textContent=`${d.pts.length.toLocaleString('fr-FR')} points de trace · ${d.hasEle?'altitudes présentes':'altitudes absentes'}`;
  $('#stats').innerHTML=[
    ['Distance',fmtDist(d.dist)],['Dénivelé +',d.hasEle?Math.round(d.up)+' m':'—'],['Altitude max',d.hasEle?Math.round(d.max)+' m':'—'],
    ['Durée probable',fmtTime(d.duration)],['Difficulté',d.diff]
  ].map(x=>`<div class="stat"><b>${x[1]}</b><span>${x[0]}</span></div>`).join('');
  const warnings=[];
  if(d.steep)warnings.push(`Passages à forte pente : ${d.steep} segment(s) à ≥ 15 %${d.very?`, dont ${d.very} à ≥ 25 %`:''}.`);
  if(d.up>800)warnings.push(`Dénivelé positif important : ${Math.round(d.up)} m.`);
  if(d.dist/1000>20)warnings.push('Distance élevée : prévoir une marge horaire.');
  if(!d.hasEle)warnings.push('⚠️ Le fichier ne contient pas d’altitudes : dénivelé, pentes et durée sont estimés avec une précision limitée.');
  $('#difficulty').innerHTML=warnings.map((x,i)=>`<div class="${x.startsWith('⚠️')?'warn':'item'}">${esc(x)}</div>`).join('')||'<div class="good">Aucune difficulté exceptionnelle détectée à partir des données du fichier.</div>';
  $('#environments').innerHTML=`<div class="item"><b>Analyse géographique</b><small>La détection fine des forêts, crêtes, vallées et villages nécessite une interrogation cartographique (OSM/IGN). Elle sera proposée dans la version connectée.</small></div>`;
  const hs=d.wpts.length?d.wpts.slice(0,12).map(p=>`<div class="item"><b>${esc(p.name||'Waypoint')}</b><small>${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}</small></div>`).join(''):'<div class="muted">Aucun waypoint nommé dans le fichier.</div>';
  $('#highlights').innerHTML=hs;
  $('#summary').innerHTML=`<div class="summary">${makeSummary(d)}</div>`;
  $('#pointCount').textContent=fmtDist(d.dist);
  $('#profileInfo').textContent=d.hasEle?`${Math.round(d.min)}–${Math.round(d.max)} m`:'pas d’altitudes';
  drawMap();drawProfile();
  lastReport=reportText();
}
function makeSummary(d){
  let s=`Cette randonnée développe ${fmtDist(d.dist)} avec une difficulté estimée <b>${d.diff.toLowerCase()}</b>.`;
  if(d.hasEle)s+=` Le parcours cumule environ <b>${Math.round(d.up)} m de montée</b> et atteint <b>${Math.round(d.max)} m</b> d'altitude.`;
  s+=` La durée de marche probable est d'environ <b>${fmtTime(d.duration)}</b>, hors pauses.`;
  if(d.steep)s+=` Plusieurs passages présentent une pente soutenue (${d.steep} segment(s) ≥ 15 %).`;
  if(d.wpts.length)s+=` Le fichier comporte ${d.wpts.length} waypoint(s), pouvant servir de points remarquables.`;
  return s;
}
function drawMap(){
  if(!map){map=L.map('map').setView([46,2],6);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors'}).addTo(map)}
  if(routeLayer)routeLayer.remove();
  routeLayer=L.polyline(routeData.pts.map(p=>[p.lat,p.lon]),{weight:5}).addTo(map);
  routeData.wpts.forEach(p=>L.marker([p.lat,p.lon]).bindPopup(esc(p.name||'Waypoint')).addTo(map));
  map.fitBounds(routeLayer.getBounds(),{padding:[20,20]});
}
function drawProfile(){
  const c=$('#profile'),ctx=c.getContext('2d'),w=c.clientWidth*devicePixelRatio,h=300*devicePixelRatio;c.width=w;c.height=h;ctx.clearRect(0,0,w,h);
  const pts=routeData.pts.filter(p=>Number.isFinite(p.ele));if(pts.length<2){ctx.fillStyle='#6b766f';ctx.font=14*devicePixelRatio+'px system-ui';ctx.fillText('Profil indisponible : aucune altitude dans le fichier.',20*devicePixelRatio,50*devicePixelRatio);return}
  let vals=pts.map(p=>p.ele),lo=Math.min(...vals),hi=Math.max(...vals),range=Math.max(10,hi-lo),pad=35*devicePixelRatio;
  ctx.strokeStyle='#c7d0ca';ctx.beginPath();ctx.moveTo(pad,h-pad);ctx.lineTo(w-pad,h-pad);ctx.stroke();
  ctx.beginPath();pts.forEach((p,i)=>{let x=pad+i/(pts.length-1)*(w-2*pad),y=h-pad-(p.ele-lo)/range*(h-2*pad);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.strokeStyle='#2f704d';ctx.lineWidth=2*devicePixelRatio;ctx.stroke();
}
function reportText(){const d=routeData;return `GPXPREPA — ${d.name}\n\nDistance : ${fmtDist(d.dist)}\nDénivelé positif : ${d.hasEle?Math.round(d.up)+' m':'indisponible'}\nAltitude maximale : ${d.hasEle?Math.round(d.max)+' m':'indisponible'}\nDurée probable : ${fmtTime(d.duration)}\nDifficulté : ${d.diff}\n\nAnalyse : ${strip(makeSummary(d))}\n\nPassages difficiles : ${d.steep?d.steep+' segment(s) à pente ≥ 15 %.' :'Aucun passage à forte pente détecté.'}\n\nWaypoints : ${d.wpts.map(p=>p.name||'Waypoint').join(', ')||'aucun'}`};function strip(s){return s.replace(/<[^>]+>/g,'')}
$('#file').addEventListener('change',e=>e.target.files[0]&&load(e.target.files[0]));
['dragenter','dragover'].forEach(ev=>$('#drop').addEventListener(ev,e=>{e.preventDefault();$('#drop').classList.add('drag')}));
['dragleave','drop'].forEach(ev=>$('#drop').addEventListener(ev,e=>{e.preventDefault();$('#drop').classList.remove('drag')}));
$('#drop').addEventListener('drop',e=>e.dataTransfer.files[0]&&load(e.dataTransfer.files[0]));
async function load(f){$('#status').textContent='Analyse du fichier…';try{routeData=await readFile(f);analyze();$('#status').textContent='';window.scrollTo({top:document.querySelector('#dashboard').offsetTop-60,behavior:'smooth'})}catch(e){$('#status').textContent='Erreur : '+e.message}}
$('#reportBtn').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([lastReport],{type:'text/plain;charset=utf-8'}));a.download='gpxprepa-rapport.txt';a.click()};
const dlg=$('#settings');$('#settingsBtn').onclick=()=>{ $('#apiUrl').value=localStorage.gpxprepa_apiUrl||'https://api.openai.com/v1/chat/completions';$('#apiKey').value=localStorage.gpxprepa_apiKey||'';$('#apiModel').value=localStorage.gpxprepa_apiModel||'gpt-5.6-mini';dlg.showModal()};
$('#saveSettings').onclick=()=>{localStorage.gpxprepa_apiUrl=$('#apiUrl').value.trim();localStorage.gpxprepa_apiKey=$('#apiKey').value.trim();localStorage.gpxprepa_apiModel=$('#apiModel').value.trim()||'gpt-5.6-mini'};
$('#aiBtn').onclick=async()=>{if(!routeData)return;const key=localStorage.gpxprepa_apiKey;if(!key){$('#aiResult').innerHTML='<div class="warn">Aucune clé API configurée. L’analyse locale est déjà disponible. Ouvrez ⚙ IA pour activer l’analyse générative.</div>';return}$('#aiResult').textContent='Analyse IA en cours…';const prompt=`Tu es un expert de la préparation de randonnées. Analyse uniquement les données fournies, sans inventer des informations géographiques. Données: ${JSON.stringify({distance_km:+(routeData.dist/1000).toFixed(2),denivele_m:Math.round(routeData.up),altitude_max_m:Math.round(routeData.max),duree:fmtTime(routeData.duration),difficulte:routeData.diff,pentes_fortes:routeData.steep,waypoints:routeData.wpts.map(x=>x.name).filter(Boolean)})}. Produis en français: 1 résumé, 2 difficultés et passages à surveiller, 3 estimation de durée, 4 points remarquables, 5 conseils de préparation. Indique explicitement ce qui est déduit des données et ce qui ne peut pas être déterminé.`;try{const url=localStorage.gpxprepa_apiUrl||'https://api.openai.com/v1/chat/completions';const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},body:JSON.stringify({model:localStorage.gpxprepa_apiModel||'gpt-5.6-mini',messages:[{role:'system',content:'Tu es un assistant expert en randonnée.'},{role:'user',content:prompt}],temperature:.2})});if(!r.ok)throw Error('API '+r.status);const j=await r.json();const txt=j.choices?.[0]?.message?.content||JSON.stringify(j);$('#aiResult').innerHTML='<div class="summary">'+esc(txt).replace(/\n/g,'<br>')+'</div>'}catch(e){$('#aiResult').innerHTML='<div class="warn">Impossible d’appeler l’IA : '+esc(e.message)+'. Vérifiez l’URL, la clé et les autorisations CORS de votre fournisseur.</div>'}};
if('serviceWorker' in navigator)navigator.serviceWorker.register('brise-cache.js').catch(()=>{});
