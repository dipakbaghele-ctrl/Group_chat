// ======== CONFIG ========
const BASE_URL = window.location.origin;
const API = {
  createRoom: `${BASE_URL}/rooms/`,
  getMessages: (roomId, skip = 0, limit = 20) =>
    `${BASE_URL}/rooms/${roomId}/messages/?skip=${skip}&limit=${limit}`,
  upload: `${BASE_URL}/upload/`
};

// ======== STATE ========
let socket = null;
let currentRoom = null;
let currentRoomId = null;
let username = null;
let skipCount = 0;

// ======== DOM ========
const chatEl = document.getElementById("chat");
const connDot = document.getElementById("connDot");
const connText = document.getElementById("connText");
const roomBadge = document.getElementById("roomBadge");
const el = id => document.getElementById(id);

// ======== UI HELPERS ========
function setConnected(yes) {
  connDot.className = `w-2.5 h-2.5 rounded-full ${
    yes ? "bg-emerald-500" : "bg-red-500"
  }`;
  connText.textContent = yes ? "Connected" : "Disconnected";
}

function appendMessage({ sender, content, content_type, timestamp }, isYou = false, prepend = false) {
  const wrapper = document.createElement("div");
  wrapper.className = `max-w-[80%] px-3 py-2 rounded-2xl shadow ${
    isYou ? "msg-you" : "msg-other"
  }`;

  const top = document.createElement("div");
  top.className = `text-xs opacity-80 mb-1 ${
    isYou ? "text-indigo-100" : "text-gray-500"
  }`;
  const timeStr = timestamp
    ? new Date(timestamp).toLocaleString()
    : new Date().toLocaleString();
  top.textContent = `${sender} • ${timeStr}`;

  let body;
  if (content_type === "image") {
    body = document.createElement("img");
    body.src = content;
    body.alt = "image";
    body.className = "rounded-xl border max-w-full";
  } else {
    body = document.createElement("div");
    body.textContent = content;
  }

  wrapper.appendChild(top);
  wrapper.appendChild(body);

  const line = document.createElement("div");
  line.className = "flex";
  line.appendChild(wrapper);

  if (prepend) {
    chatEl.prepend(line);
  } else {
    chatEl.appendChild(line);
    chatEl.scrollTop = chatEl.scrollHeight;
  }
}

function toast(msg) {
  const t = document.createElement("div");
  t.textContent = msg;
  t.className =
    "fixed bottom-6 right-6 bg-black text-white px-4 py-2 rounded-xl shadow-lg opacity-90";
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

// ======== SOCKET ========
function connectSocket() {
  if (socket) return socket;

  socket = io(BASE_URL, { transports: ["websocket"] });

  socket.on("connect", () => setConnected(true));
  socket.on("disconnect", () => setConnected(false));
  socket.on("notification", data => toast(data.msg || "Notification"));
  socket.on("receive_message", data => {
    const isYou = data.sender === username;
    appendMessage(data, isYou);
  });

  return socket;
}

// ======== ACTIONS ========
async function doCreateRoom() {
  const name = el("newRoomName").value.trim();
  if (!name) return toast("Enter room name");

  try {
    const res = await axios.post(API.createRoom, { name });
    el("createRoomResult").textContent = `Room created: id=${res.data.id}, name=${res.data.name}`;
    el("roomId").value = res.data.id;
    el("roomName").value = res.data.name;
    toast("Room created ✅");
  } catch (e) {
    console.error(e);
    toast("Failed to create room");
  }
}

function doJoinRoom() {
  username = el("username").value.trim();
  currentRoom = el("roomName").value.trim();
  currentRoomId = Number(el("roomId").value);

  if (!username || !currentRoom || !currentRoomId) {
    return toast("Enter username, room name, and room ID");
  }

  connectSocket();
  socket.emit("join_room", { room: currentRoom, user: username });
  roomBadge.textContent = `${currentRoom} (#${currentRoomId})`;
  skipCount = 0;
  chatEl.innerHTML = "";
  loadHistory(true);
}

function doLeaveRoom() {
  if (socket && currentRoom) {
    socket.emit("leave_room", { room: currentRoom, user: username });
    toast(`Left ${currentRoom}`);
  }
  currentRoom = null;
  currentRoomId = null;
  roomBadge.textContent = "—";
}

function doSend() {
  const msg = el("messageInput").value.trim();
  if (!msg || !socket || !currentRoom || !currentRoomId || !username) return;

  socket.emit("send_message", {
    room: currentRoom,
    room_id: currentRoomId,
    sender: username,
    content: msg,
    content_type: "text"
  });

  appendMessage({ sender: username, content: msg, content_type: "text" }, true);
  el("messageInput").value = "";
}

async function doUploadAndSend() {
  const file = el("fileInput").files[0];
  if (!file) return toast("Choose an image first");
  if (!currentRoom || !currentRoomId || !username || !socket)
    return toast("Join a room first");

  const form = new FormData();
  form.append("file", file);

  try {
    const res = await axios.post(API.upload, form, {
      headers: { "Content-Type": "multipart/form-data" }
    });
    const url = res.data.url;
    socket.emit("send_message", {
      room: currentRoom,
      room_id: currentRoomId,
      sender: username,
      content: url,
      content_type: "image"
    });
    appendMessage({ sender: username, content: url, content_type: "image" }, true);
    el("uploadMsg").textContent = `Uploaded: ${res.data.filename}`;
    el("fileInput").value = "";
    el("preview").classList.add("hidden");
  } catch (e) {
    console.error(e);
    toast("Upload failed");
  }
}

async function loadHistory(initial = false) {
  if (!currentRoomId) return;
  try {
    const res = await axios.get(API.getMessages(currentRoomId, skipCount, 20));
    const list = res.data || [];
    if (list.length === 0 && initial) {
      appendMessage(
        { sender: "System", content: "No previous messages", content_type: "text" },
        false
      );
    } else {
      for (let i = list.length - 1; i >= 0; i--) {
        const m = list[i];
        appendMessage(m, m.sender === username, true);
      }
      skipCount += list.length;
    }
  } catch (e) {
    console.error(e);
    toast("Failed to load history");
  }
}

// ======== EVENTS ========
el("btnCreateRoom").addEventListener("click", doCreateRoom);
el("btnJoin").addEventListener("click", doJoinRoom);
el("btnLeave").addEventListener("click", doLeaveRoom);
el("btnSend").addEventListener("click", doSend);
el("btnUpload").addEventListener("click", doUploadAndSend);
el("btnLoadHistory").addEventListener("click", () => loadHistory(true));
el("btnLoadMore").addEventListener("click", () => loadHistory(false));

// image preview
el("fileInput").addEventListener("change", e => {
  const file = e.target.files[0];
  const img = el("preview");
  if (file) {
    img.src = URL.createObjectURL(file);
    img.classList.remove("hidden");
  } else {
    img.classList.add("hidden");
  }
});
