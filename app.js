// ===== CONFIGURATION =====
// Change ONLY these two values before publishing.
const ADMIN_PASSWORD = "Foot1234!";
const ROOM_ID = "mon-live-room-v1";

// PeerJS uses its free public signaling server. Your browser-to-browser video/chat
// is WebRTC; there is no video server in this simple version.
const peer = new Peer();
let role = "viewer";
let hostPeerId = null;
let screenStream = null;
let viewerConnections = new Map();
let viewerCount = 0;
let hostConn = null;
let bannedNames = new Set();

const $ = id => document.getElementById(id);
const addMessage = (name, text) => {
  const d=document.createElement("div"); d.className="msg";
  const b=document.createElement("b"); b.textContent=name+":";
  const s=document.createElement("span"); s.textContent=text;
  d.append(b,s); $("messages").appendChild(d); $("messages").scrollTop=$("messages").scrollHeight;
};
const setLive = (on) => {
  $("status").textContent = on ? "● LIVE" : "● HORS LIGNE";
  $("status").className = "status " + (on ? "live" : "offline");
  $("offline").classList.toggle("hidden", on);
  $("chatState").textContent = on ? "En direct" : "En attente";
};
const updateCount = () => {
  $("viewerCount").textContent = `${viewerCount} / 10 spectateurs`;
  $("adminCount").textContent = `${viewerCount} / 10`;
};

peer.on("open", id => {
  // One deterministic room: the broadcaster registers this ID.
  if (location.hash === "#admin") $("adminOpen").click();
  peer.on("connection", conn => {
    if (role !== "host") return;
    if (viewerConnections.size >= 10) { conn.on("open",()=>conn.send({type:"full"})); setTimeout(()=>conn.close(),500); return; }
    viewerConnections.set(conn.peer, conn);
    viewerCount = viewerConnections.size; updateCount();
    conn.on("data", data => {
      if (!data || data.type !== "chat") return;
      const name=(data.name||"Invité").slice(0,18);
      const text=(data.text||"").slice(0,250);
      if(bannedNames.has(name)) return;
      broadcast({type:"chat",name,text});
      addMessage(name,text);
    });
    conn.on("close",()=>{viewerConnections.delete(conn.peer);viewerCount=viewerConnections.size;updateCount();});
    if(screenStream){
      const call=peer.call(conn.peer,screenStream);
      call.on("close",()=>{});
    }
    conn.send({type:"live",count:viewerCount});
  });
});

function broadcast(data){ for(const c of viewerConnections.values()) try{c.send(data)}catch{} }

async function becomeHost(){
  role="host"; hostPeerId=peer.id;
  setLive(true); $("adminStatus").textContent="LIVE";
  await navigator.clipboard?.writeText(location.origin + location.pathname + "?host="+encodeURIComponent(hostPeerId));
}

$("startBtn").onclick = async ()=>{
  try{
    screenStream = await navigator.mediaDevices.getDisplayMedia({video:true,audio:true});
    await becomeHost();
    screenStream.getVideoTracks()[0].addEventListener("ended", stopLive);
    for(const [id,conn] of viewerConnections){
      const call=peer.call(id,screenStream);
    }
  }catch(e){ alert("Le partage d'écran a été annulé ou refusé."); }
};
function stopLive(){
  if(screenStream){screenStream.getTracks().forEach(t=>t.stop());screenStream=null;}
  broadcast({type:"offline"});
  for(const c of viewerConnections.values()) c.close();
  viewerConnections.clear(); viewerCount=0; updateCount();
  setLive(false); $("adminStatus").textContent="HORS LIGNE";
}
$("stopBtn").onclick=stopLive;

$("adminOpen").onclick=()=>{ $("adminModal").classList.remove("hidden"); };
$("adminClose").onclick=()=>{$("adminModal").classList.add("hidden")};
$("loginBtn").onclick=()=>{
  if($("adminPassword").value===ADMIN_PASSWORD){
    $("loginArea").classList.add("hidden");$("adminArea").classList.remove("hidden");
  } else $("loginError").textContent="Mot de passe incorrect.";
};
$("clearChatBtn").onclick=()=>{$("messages").innerHTML="";broadcast({type:"clear"})};

async function joinHost(id){
  hostPeerId=id; role="viewer";
  const conn=peer.connect(id,{reliable:true});
  hostConn=conn;
  conn.on("open",()=>{ $("chatState").textContent="Connecté"; conn.send({type:"hello"}); });
  conn.on("data",data=>{
    if(data.type==="full"){alert("Le direct est complet (10/10).");conn.close();return;}
    if(data.type==="chat") addMessage(data.name,data.text);
    if(data.type==="clear") $("messages").innerHTML="";
    if(data.type==="offline"){setLive(false);$("remoteVideo").srcObject=null;}
    if(data.type==="live"){viewerCount=data.count;updateCount();setLive(true);}
  });
  conn.on("close",()=>{$("chatState").textContent="Déconnecté";});
  peer.on("call",call=>{
    call.answer();
    call.on("stream",stream=>{ $("remoteVideo").srcObject=stream; setLive(true); });
  });
}

$("chatForm").onsubmit=e=>{
  e.preventDefault();
  if(!hostConn || hostConn.open===false) return;
  const name=$("nameInput").value.trim()||"Invité", text=$("messageInput").value.trim();
  if(!text)return;
  hostConn.send({type:"chat",name,text}); $("messageInput").value="";
};

// Host advertises its peer ID in the URL by using ?host=...
const params=new URLSearchParams(location.search);
const advertisedHost=params.get("host");
if(advertisedHost) joinHost(advertisedHost);
else {
  // If no host URL exists, this page is simply waiting.
  setLive(false);
}

// Admin login can be opened with #admin, but the password is still required.
