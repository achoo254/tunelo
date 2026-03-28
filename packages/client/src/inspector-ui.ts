/** Inline HTML dashboard for the request inspector — no external dependencies */

export function getInspectorHtml(): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tunelo Inspector</title>
<style>
:root{--bg:#0f172a;--bg2:#1e293b;--bg3:#334155;--fg:#e2e8f0;--fg2:#94a3b8;--accent:#38bdf8;--green:#4ade80;--yellow:#fbbf24;--red:#f87171;--border:#475569;font-family:system-ui,-apple-system,sans-serif}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--fg);font-size:14px;height:100vh;display:flex;flex-direction:column}
header{background:var(--bg2);padding:8px 16px;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--border)}
header h1{font-size:16px;color:var(--accent);font-weight:600}
header .stats{color:var(--fg2);font-size:12px;margin-left:auto}
.filters{background:var(--bg2);padding:6px 16px;display:flex;gap:8px;border-bottom:1px solid var(--border)}
.filters select,.filters input{background:var(--bg3);color:var(--fg);border:1px solid var(--border);padding:4px 8px;border-radius:4px;font-size:12px}
.filters input{flex:1;max-width:250px}
.filters button{background:var(--bg3);color:var(--fg2);border:1px solid var(--border);padding:4px 12px;border-radius:4px;cursor:pointer;font-size:12px}
.filters button:hover{background:var(--border)}
.main{flex:1;display:flex;overflow:hidden}
.list{flex:1;overflow-y:auto;min-width:0}
.detail{width:45%;border-left:1px solid var(--border);overflow-y:auto;display:none}
.detail.open{display:block}
table{width:100%;border-collapse:collapse}
th{background:var(--bg2);position:sticky;top:0;text-align:left;padding:6px 10px;font-size:11px;color:var(--fg2);text-transform:uppercase;letter-spacing:.5px}
tr.row{cursor:pointer;border-bottom:1px solid var(--bg2)}
tr.row:hover{background:var(--bg2)}
tr.row.active{background:var(--bg3)}
tr.row.replay{opacity:.8;font-style:italic}
td{padding:6px 10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:300px;font-size:13px}
.method{font-weight:700;font-family:monospace}
.s2xx{color:var(--green)}.s3xx{color:var(--accent)}.s4xx{color:var(--yellow)}.s5xx{color:var(--red)}
.badge{font-size:10px;padding:1px 5px;border-radius:3px;background:var(--bg3);color:var(--fg2);margin-left:4px}
.badge.replay{background:#7c3aed;color:#fff}
.detail-header{padding:12px 16px;background:var(--bg2);border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center}
.detail-header h2{font-size:14px;font-weight:600}
.tabs{display:flex;gap:0;border-bottom:1px solid var(--border)}
.tabs button{background:none;border:none;color:var(--fg2);padding:8px 16px;cursor:pointer;font-size:12px;border-bottom:2px solid transparent}
.tabs button.active{color:var(--accent);border-bottom-color:var(--accent)}
.tab-content{padding:12px 16px;font-family:monospace;font-size:12px;white-space:pre-wrap;word-break:break-all;line-height:1.5}
.empty{text-align:center;padding:60px 20px;color:var(--fg2)}
.empty h2{font-size:18px;margin-bottom:8px;color:var(--fg)}
.modal-overlay{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.6);z-index:100;align-items:center;justify-content:center}
.modal-overlay.open{display:flex}
.modal{background:var(--bg2);border:1px solid var(--border);border-radius:8px;width:600px;max-height:80vh;display:flex;flex-direction:column}
.modal h3{padding:12px 16px;border-bottom:1px solid var(--border);font-size:14px}
.modal-body{padding:12px 16px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:8px}
.modal-body label{font-size:11px;color:var(--fg2);text-transform:uppercase}
.modal-body input,.modal-body textarea,.modal-body select{background:var(--bg3);color:var(--fg);border:1px solid var(--border);padding:6px 8px;border-radius:4px;font-family:monospace;font-size:12px;width:100%}
.modal-body textarea{min-height:120px;resize:vertical}
.modal-footer{padding:12px 16px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end}
.modal-footer button{padding:6px 16px;border-radius:4px;cursor:pointer;font-size:12px;border:none}
.btn-primary{background:var(--accent);color:#000}.btn-secondary{background:var(--bg3);color:var(--fg)}
@media(prefers-color-scheme:light){:root{--bg:#f8fafc;--bg2:#e2e8f0;--bg3:#cbd5e1;--fg:#0f172a;--fg2:#475569;--border:#94a3b8}}
</style>
</head>
<body>
<header>
<h1>tunelo inspector</h1>
<span class="stats" id="stats">0 requests</span>
</header>
<div class="filters">
<select id="fSub"><option value="">All tunnels</option></select>
<select id="fStatus"><option value="">All status</option><option value="2">2xx</option><option value="3">3xx</option><option value="4">4xx</option><option value="5">5xx</option></select>
<input id="fSearch" type="text" placeholder="Search path...">
<button id="btnClear">Clear</button>
</div>
<div class="main">
<div class="list"><table><thead><tr><th>Method</th><th>Path</th><th>Status</th><th>Duration</th><th>Time</th><th>Subdomain</th></tr></thead><tbody id="tbody"></tbody></table>
<div class="empty" id="empty"><h2>Waiting for requests...</h2><p>Send a request through your tunnel to see it here</p></div>
</div>
<div class="detail" id="detail">
<div class="detail-header"><h2 id="dTitle">Request</h2><div style="display:flex;gap:6px"><button id="btnEditReplay" style="background:var(--bg3);color:var(--fg);border:1px solid var(--border);padding:4px 12px;border-radius:4px;cursor:pointer;font-size:12px">Edit & Replay</button><button id="btnReplay" style="background:var(--accent);color:#000;border:none;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:12px">Replay</button></div></div>
<div class="tabs"><button class="active" data-tab="req-headers">Req Headers</button><button data-tab="req-body">Req Body</button><button data-tab="res-headers">Res Headers</button><button data-tab="res-body">Res Body</button></div>
<div class="tab-content" id="tabContent"></div>
</div>
</div>
<div class="modal-overlay" id="editModal">
<div class="modal">
<h3>Edit & Replay</h3>
<div class="modal-body">
<label>Method</label><select id="mMethod"><option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option></select>
<label>Path</label><input id="mPath" type="text">
<label>Headers (JSON)</label><textarea id="mHeaders"></textarea>
<label>Body</label><textarea id="mBody"></textarea>
</div>
<div class="modal-footer"><button class="btn-secondary" id="mCancel">Cancel</button><button class="btn-primary" id="mSend">Send</button></div>
</div>
</div>
<script>
const tbody=document.getElementById("tbody"),detail=document.getElementById("detail"),empty=document.getElementById("empty"),stats=document.getElementById("stats"),tabContent=document.getElementById("tabContent"),dTitle=document.getElementById("dTitle"),fSub=document.getElementById("fSub"),fStatus=document.getElementById("fStatus"),fSearch=document.getElementById("fSearch"),btnClear=document.getElementById("btnClear"),btnReplay=document.getElementById("btnReplay"),btnEditReplay=document.getElementById("btnEditReplay"),editModal=document.getElementById("editModal"),mMethod=document.getElementById("mMethod"),mPath=document.getElementById("mPath"),mHeaders=document.getElementById("mHeaders"),mBody=document.getElementById("mBody"),mCancel=document.getElementById("mCancel"),mSend=document.getElementById("mSend");
let entries=[],selected=null,activeTab="req-headers",knownSubs=new Set();

function statusClass(s){if(s<300)return"s2xx";if(s<400)return"s3xx";if(s<500)return"s4xx";return"s5xx"}
function fmtTime(ts){return new Date(ts).toLocaleTimeString()}
function tryJson(s){if(!s)return"(empty)";try{const b=atob(s);const j=JSON.parse(b);return JSON.stringify(j,null,2)}catch{try{return atob(s)}catch{return s}}}
function fmtHeaders(h){if(!h)return"(none)";return Object.entries(h).map(([k,v])=>k+": "+(Array.isArray(v)?v.join(", "):v)).join("\\n")}

function render(){
const sub=fSub.value,st=fStatus.value,q=fSearch.value.toLowerCase();
let filtered=entries;
if(sub)filtered=filtered.filter(e=>e.subdomain===sub);
if(st)filtered=filtered.filter(e=>String(e.status).startsWith(st));
if(q)filtered=filtered.filter(e=>e.path.toLowerCase().includes(q)||e.method.toLowerCase().includes(q));
tbody.innerHTML="";
empty.style.display=filtered.length?"none":"block";
stats.textContent=entries.length+" requests";
for(const e of filtered){
const tr=document.createElement("tr");tr.className="row"+(e.id===selected?" active":"")+(e.entryType==="replay"?" replay":"");
tr.innerHTML='<td class="method">'+e.method+'</td><td>'+e.path+(e.entryType==="replay"?'<span class="badge replay">replay</span>':"")+'</td><td class="'+statusClass(e.status)+'">'+e.status+"</td><td>"+e.durationMs+"ms</td><td>"+fmtTime(e.timestamp)+"</td><td>"+(e.subdomain||"-")+"</td>";
tr.onclick=()=>showDetail(e.id);tbody.appendChild(tr);
}}

function showDetail(id){
selected=id;render();
const e=entries.find(x=>x.id===id);if(!e){detail.classList.remove("open");return}
detail.classList.add("open");
dTitle.textContent=e.method+" "+e.path;
fetch("/api/requests/"+id).then(r=>r.json()).then(full=>{
window._detail=full;showTab(activeTab);
}).catch(()=>{window._detail=e;showTab(activeTab)});
}

function showTab(tab){
activeTab=tab;
document.querySelectorAll(".tabs button").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
const d=window._detail||{};
if(tab==="req-headers")tabContent.textContent=fmtHeaders(d.requestHeaders);
else if(tab==="req-body")tabContent.textContent=tryJson(d.requestBody);
else if(tab==="res-headers")tabContent.textContent=fmtHeaders(d.responseHeaders);
else tabContent.textContent=tryJson(d.responseBody);
}

document.querySelector(".tabs").addEventListener("click",e=>{if(e.target.dataset.tab)showTab(e.target.dataset.tab)});
fSub.onchange=fStatus.onchange=fSearch.oninput=render;
btnClear.onclick=()=>fetch("/api/requests",{method:"DELETE"}).then(()=>{entries=[];selected=null;detail.classList.remove("open");render()});
btnReplay.onclick=()=>{if(!selected)return;fetch("/api/requests/"+selected+"/replay",{method:"POST"}).catch(()=>{})};
btnEditReplay.onclick=()=>{
if(!selected||!window._detail)return;
const d=window._detail;
mMethod.value=d.method||"GET";mPath.value=d.path||"/";
try{mHeaders.value=JSON.stringify(d.requestHeaders||{},null,2)}catch{mHeaders.value="{}"}
try{mBody.value=d.requestBody?atob(d.requestBody):""}catch{mBody.value=d.requestBody||""}
editModal.classList.add("open");
};
mCancel.onclick=()=>editModal.classList.remove("open");
mSend.onclick=()=>{
let headers;try{headers=JSON.parse(mHeaders.value)}catch{headers={}}
const body=mBody.value?btoa(mBody.value):null;
fetch("/api/replay",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({method:mMethod.value,path:mPath.value,headers,body})}).then(()=>editModal.classList.remove("open")).catch(()=>{});
};

// SSE real-time updates
const sse=new EventSource("/api/events");
sse.onmessage=e=>{
const entry=JSON.parse(e.data);
entries.unshift(entry);
if(entry.subdomain&&!knownSubs.has(entry.subdomain)){knownSubs.add(entry.subdomain);const o=document.createElement("option");o.value=entry.subdomain;o.textContent=entry.subdomain;fSub.appendChild(o)}
render();
};

// Load initial data
fetch("/api/requests").then(r=>r.json()).then(data=>{entries=data;data.forEach(e=>{if(e.subdomain)knownSubs.add(e.subdomain)});knownSubs.forEach(s=>{const o=document.createElement("option");o.value=s;o.textContent=s;fSub.appendChild(o)});render()});
</script>
</body>
</html>`;
}
