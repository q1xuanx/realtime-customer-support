// Configuration
const API_CONFIG = {
    apiKey: "YjM2MWIzMmJlZDVjNDE5MjljNDc5MmIwNDA5OGM5MWUtMTc0NzI3ODEzMA==",
    serverUrl: "https://api.heygen.com",
};

// Global variables
let sessionInfo = null;
let room = null;
let mediaStream = null;
let webSocket = null;
let sessionToken = null;

// DOM Elements
const statusElement = document.getElementById("status");
const mediaElement = document.getElementById("mediaElement");
const avatarID = document.getElementById("avatarID");
const avatarImage = document.getElementById("avatarImage");
const avatarLoading = document.getElementById("avatarLoading");
const avatarStatusText = document.getElementById("avatarStatusText");
const voiceID = document.getElementById("voiceID");
const taskInput = document.getElementById("taskInput");

// Helper function to update status
function updateStatus(message) {
    const timestamp = new Date().toLocaleTimeString();
    statusElement.innerHTML += `[${timestamp}] ${message}<br>`;
    statusElement.scrollTop = statusElement.scrollHeight;
}

// Get session token
async function getSessionToken() {
    const response = await fetch(
        `${API_CONFIG.serverUrl}/v1/streaming.create_token`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Api-Key": API_CONFIG.apiKey,
            },
        }
    );

    const data = await response.json();
    sessionToken = data.data.token;
    updateStatus("Session token obtained");
}

// Connect WebSocket
async function connectWebSocket(sessionId) {
    const params = new URLSearchParams({
        session_id: sessionId,
        session_token: sessionToken,
        silence_response: false,
        opening_text: "Xin chào, mình có thể giúp gì cho bạn",
        stt_language: "vi",
    });

    const wsUrl = `wss://${new URL(API_CONFIG.serverUrl).hostname
        }/v1/ws/streaming.chat?${params}`;

    webSocket = new WebSocket(wsUrl);

    // Handle WebSocket events
    webSocket.addEventListener("message", (event) => {
    const eventData = JSON.parse(event.data);
    console.log("Raw WebSocket event:", eventData);

    // Nếu là phản hồi từ avatar
    if (eventData.event === "chat_response" && eventData.text) {
        updateStatus(`🤖 Avatar: ${eventData.text}`);
        displayAvatarResponse(eventData.text);
        setAvatarStatus(null); // Avatar đã nói xong
    }
});

}

function displayAvatarResponse(text) {
    const responseText = document.getElementById("responseText");
    responseText.textContent = `🤖 ${text}`;
}

// Create new session
async function createNewSession() {
    if (!sessionToken) {
        await getSessionToken();
    }
    let knowledgeTxt = ''
    const readFile = await fetch('knowledge.txt');
    knowledgeTxt = await readFile.text();
    const response = await fetch(
        `${API_CONFIG.serverUrl}/v1/streaming.new`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${sessionToken}`,
            },
            body: JSON.stringify({
                quality: "high",
                avatar_id: avatarID.value,
                voice: {
                    voice_id: voiceID.value,
                    rate: 1.0,
                },
                knowledge_base: knowledgeTxt,
                version: "v2",
                video_encoding: "H264",
            }),
        }
    );

    const data = await response.json();
    sessionInfo = data.data;

    // Create LiveKit Room
    room = new LivekitClient.Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: {
            resolution: LivekitClient.VideoPresets.h720.resolution,
        },
    });

    // Handle room events
    room.on(LivekitClient.RoomEvent.DataReceived, (message) => {
        const data = new TextDecoder().decode(message);
        console.log("Room message:", JSON.parse(data));
    });

    // Handle media streams
    mediaStream = new MediaStream();
    room.on(LivekitClient.RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === "video" || track.kind === "audio") {
            mediaStream.addTrack(track.mediaStreamTrack);
            if (
                mediaStream.getVideoTracks().length > 0 &&
                mediaStream.getAudioTracks().length > 0
            ) {
                mediaElement.srcObject = mediaStream;
                updateStatus("Media stream ready");
            }
        }
    });

    // Handle media stream removal
    room.on(LivekitClient.RoomEvent.TrackUnsubscribed, (track) => {
        const mediaTrack = track.mediaStreamTrack;
        if (mediaTrack) {
            mediaStream.removeTrack(mediaTrack);
        }
    });

    // Handle room connection state changes
    room.on(LivekitClient.RoomEvent.Disconnected, (reason) => {
        updateStatus(`Room disconnected: ${reason}`);
    });

    await room.prepareConnection(sessionInfo.url, sessionInfo.access_token);
    updateStatus("Connection prepared");

    // Connect WebSocket after room preparation
    await connectWebSocket(sessionInfo.session_id);

    updateStatus("Session created successfully");
    avatarLoading.style.display = "none";
avatarImage.style.display = "block";
setAvatarStatus("idle");

}
// Set avatar status
function setAvatarStatus(status) {
    if (!avatarStatusText) return;

    if (status === "talking") {
        avatarStatusText.textContent = "🗣️ Đang trả lời...";
        avatarStatusText.style.display = "block";
    } else if (status === "listening") {
        avatarStatusText.textContent = "👂 Đang nghe bạn...";
        avatarStatusText.style.display = "block";
    } else {
        avatarStatusText.style.display = "none";
    }
}

// Start listening
function startListening() {
    const recognition = new (window.SpeechRecognition ||
        window.webkitSpeechRecognition)();
    recognition.lang = "vi-VN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    document.getElementById("transcript").textContent = `🗣️ Bạn nói: "${transcript}"`;
    if (transcript) {
        setAvatarStatus("talking");
        sendText(transcript, "talk");
    }
};


    recognition.onerror = (event) => {
        alert("Lỗi nhận diện giọng nói: " + event.error);
    };
    recognition.start();
}

// Start streaming session
async function startStreamingSession() {
    const startResponse = await fetch(
        `${API_CONFIG.serverUrl}/v1/streaming.start`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${sessionToken}`,
            },
            body: JSON.stringify({
                session_id: sessionInfo.session_id,
            }),
        }
    );

    // Connect to LiveKit room
    await room.connect(sessionInfo.url, sessionInfo.access_token);
    updateStatus("Connected to room");

    document.querySelector("#startBtn").disabled = true;
    updateStatus("Streaming started successfully");
}

// Send text to avatar
async function sendText(text, taskType = "talk") {
    if (!sessionInfo) {
        updateStatus("No active session");
        return;
    }

    const response = await fetch(
        `${API_CONFIG.serverUrl}/v1/streaming.task`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${sessionToken}`,
            },
            body: JSON.stringify({
                session_id: sessionInfo.session_id,
                text: text,
                task_type: taskType,
            }),
        }
    );

    updateStatus(`Sent text (${taskType}): ${text}`);
setAvatarStatus("talking");

}

function sendTextFromInput() {
    const input = document.getElementById("textMessageInput");
    const message = input.value.trim();
    if (message) {
        sendText(message, "talk");
        input.value = "";
        setAvatarStatus("talking");
    }
}


// Close session
async function closeSession() {
    if (!sessionInfo) {
        updateStatus("No active session");
        return;
    }

    const response = await fetch(
        `${API_CONFIG.serverUrl}/v1/streaming.stop`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${sessionToken}`,
            },
            body: JSON.stringify({
                session_id: sessionInfo.session_id,
            }),
        }
    );

    // Close WebSocket
    if (webSocket) {
        webSocket.close();
    }
    // Disconnect from LiveKit room
    if (room) {
        room.disconnect();
    }

    mediaElement.srcObject = null;
    sessionInfo = null;
    room = null;
    mediaStream = null;
    sessionToken = null;
    document.querySelector("#startBtn").disabled = false;
avatarImage.style.display = "none";
avatarLoading.style.display = "block";
setAvatarStatus(null);

    updateStatus("Session closed");
}

// Event Listeners
document
    .querySelector("#startBtn")
    .addEventListener("click", async () => {
        await createNewSession();
        await startStreamingSession();
    });
document
    .querySelector("#closeBtn")
    .addEventListener("click", closeSession);