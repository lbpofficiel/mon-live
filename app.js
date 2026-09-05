// ===== CONFIGURATION =====
const ADMIN_PASSWORD = "Foot1234!";   // ← ton mot de passe
const HOST_ID = "mon-live-host-lb";   // ID fixe (ne change pas)

const peer = new Peer(HOST_ID, {
  debug: 1
});

let role = "viewer";
let screenStream = null;
let viewerConnections = new Map();
let viewerCount = 0;
let hostConn = null;

const $ = id => document.getElementById(id);

const addMessage = (name, text) => {
  const d = document.createElement("div");
  d.className = "msg";
  const b = document.createElement("b");
  b.textContent = name + ":";
  const s = document.createElement("span");
  s.textContent = text;
  d.append(b, s);
  $("messages").appendChild(d);
  $("messages").scrollTop = $("messages").scrollHeight;
};

const setLive = (on) => {
  $("status").textContent = on ? "● LIVE" : "● HORS LIGNE";
  $("status").className = "status " + (on ? "live" : "offline");
  $("offline").classList.toggle("hidden", on);
  $("chatState").textContent = on ? "En direct" : "En attente";
};

const updateCount = () => {
  $("viewerCount").textContent = `${viewerCount} / 10 spectateurs`;
  if ($("adminCount")) $("adminCount").textContent = `${viewerCount} / 10`;
};

peer.on("open", (id) => {
  console.log("Mon ID:", id);

  // Si on est le host (ID fixe)
  if (id === HOST_ID) {
    role = "host";
  }

  peer.on("connection", (conn) => {
    if (role !== "host") return;

    if (viewerConnections.size >= 10) {
      conn.on("open", () => conn.send({ type: "full" }));
      setTimeout(() => conn.close(), 800);
      return;
    }

    viewerConnections.set(conn.peer, conn);
    viewerCount = viewerConnections.size;
    updateCount();

    conn.on("data", (data) => {
      if (!data || data.type !== "chat") return;
      const name = (data.name || "Invité").slice(0, 18);
      const text = (data.text || "").slice(0, 250);
      broadcast({ type: "chat", name, text });
      addMessage(name, text);
    });

    conn.on("close", () => {
      viewerConnections.delete(conn.peer);
      viewerCount = viewerConnections.size;
      updateCount();
    });

    // Si on est déjà en direct, on envoie le flux
    if (screenStream) {
      peer.call(conn.peer, screenStream);
      conn.send({ type: "live", count: viewerCount });
    }
  });
});

function broadcast(data) {
  for (const c of viewerConnections.values()) {
    try { c.send(data); } catch (e) {}
  }
}

async function becomeHost() {
  role = "host";
  setLive(true);
  if ($("adminStatus")) $("adminStatus").textContent = "LIVE";
}

$("startBtn").onclick = async () => {
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true
    });

    await becomeHost();

    screenStream.getVideoTracks()[0].addEventListener("ended", stopLive);

    // Appeler tous les spectateurs déjà connectés
    for (const [id] of viewerConnections) {
      peer.call(id, screenStream);
    }

    broadcast({ type: "live", count: viewerCount });

  } catch (e) {
    alert("Le partage d'écran a été annulé ou refusé.");
  }
};

function stopLive() {
  if (screenStream) {
    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
  }
  broadcast({ type: "offline" });
  for (const c of viewerConnections.values()) c.close();
  viewerConnections.clear();
  viewerCount = 0;
  updateCount();
  setLive(false);
  if ($("adminStatus")) $("adminStatus").textContent = "HORS LIGNE";
}

$("stopBtn").onclick = stopLive;

$("adminOpen").onclick = () => $("adminModal").classList.remove("hidden");
$("adminClose").onclick = () => $("adminModal").classList.add("hidden");

$("loginBtn").onclick = () => {
  if ($("adminPassword").value === ADMIN_PASSWORD) {
    $("loginArea").classList.add("hidden");
    $("adminArea").classList.remove("hidden");
  } else {
    $("loginError").textContent = "Mot de passe incorrect.";
  }
};

$("clearChatBtn").onclick = () => {
  $("messages").innerHTML = "";
  broadcast({ type: "clear" });
};

// === Côté spectateur ===
function joinAsViewer() {
  const conn = peer.connect(HOST_ID, { reliable: true });
  hostConn = conn;

  conn.on("open", () => {
    $("chatState").textContent = "Connecté";
    conn.send({ type: "hello" });
  });

  conn.on("data", (data) => {
    if (data.type === "full") {
      alert("Le direct est complet (10/10).");
      conn.close();
      return;
    }
    if (data.type === "chat") addMessage(data.name, data.text);
    if (data.type === "clear") $("messages").innerHTML = "";
    if (data.type === "offline") {
      setLive(false);
      $("remoteVideo").srcObject = null;
    }
    if (data.type === "live") {
      viewerCount = data.count || 0;
      updateCount();
      setLive(true);
    }
  });

  conn.on("close", () => {
    $("chatState").textContent = "Déconnecté";
  });
}

peer.on("call", (call) => {
  call.answer();
  call.on("stream", (stream) => {
    $("remoteVideo").srcObject = stream;
    setLive(true);
  });
});

// Au chargement : on essaie de rejoindre le host
peer.on("open", () => {
  // Si on n'est pas le host, on rejoint
  if (peer.id !== HOST_ID) {
    joinAsViewer();
  }
});

$("chatForm").onsubmit = (e) => {
  e.preventDefault();
  if (!hostConn || hostConn.open === false) return;
  const name = $("nameInput").value.trim() || "Invité";
  const text = $("messageInput").value.trim();
  if (!text) return;
  hostConn.send({ type: "chat", name, text });
  $("messageInput").value = "";
};
