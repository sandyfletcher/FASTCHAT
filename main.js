function getUsernameColor(str) { //  uses HSL to parse a colour from username string
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = hash % 360; // get hue value 0 to 360
    return `hsl(${hue}, 80%, 55%)`; // fixed saturation/lightness for readability
}

const socket = io("https://fastchat-0opj.onrender.com/");

socket.on('connect', () => {
    console.log("Connected to server as", socket.id);
});

// PAGE SETUP

document.addEventListener('DOMContentLoaded', () => { 
    if (document.getElementById('start-room-btn')) { // route to correct setup function based on page content
        setupIndexPage();
    } else if (document.querySelector('.room-container')) {
        setupRoomPage();
    }
});
function setupIndexPage() {
    const startButton = document.getElementById('start-room-btn');
    startButton.addEventListener('click', (e) => {
        e.preventDefault();
        console.log("Requesting a new room from server...");
        socket.emit('create_room');
    });
}
function setupRoomPage() {
    const roomId = window.location.hash.substring(1);
    const ui = { // Cache relevant DOM elements into single object
        messagesContainer: document.querySelector('.messages'),
        messageForm: document.getElementById('message-form'),
        messageInput: document.getElementById('message-form').querySelector('input'),
        roomLinkElement: document.getElementById('room-link'),
        qrElement: document.querySelector('.qr-code'),
        memberList: document.querySelector('.member-list'),
        ownerName: document.querySelector('.owner-name')
    };
    if (!roomId) {
        ui.messagesContainer.innerHTML = '<p>ERROR: No room ID specified. Start a new room.</p>';
        ui.messageForm.style.display = 'none';
        return; // stop execution
    }
    initializeRoomUI(roomId, ui);
    setupMessageForm(roomId, ui);
    joinRoom(roomId);
}

// --- Helper Functions for Room Page ---

function showCopyConfirmation(element) { // visual feedback on copy
    element.classList.add('copied');
    setTimeout(() => {
        element.classList.remove('copied');
    }, 1500);
}
function initializeRoomUI(roomId, ui) { //  sets up click-to-copy functionality
    document.title = `FASTCHAT — [${roomId.substring(0, 6)}]`;
    const roomUrl = window.location.href;
    ui.roomLinkElement.textContent = roomUrl;
    ui.roomLinkElement.addEventListener('click', () => { // click to copy text link
        navigator.clipboard.writeText(roomUrl).then(() => {
            showCopyConfirmation(ui.roomLinkElement);
        }).catch(err => console.error('Failed to copy text: ', err));
    });
    ui.qrElement.innerHTML = ''; // clear placeholder
    const qr = qrcode(0, 'L');
    qr.addData(roomUrl);
    qr.make();
    ui.qrElement.innerHTML = qr.createImgTag(4, 4);
    const qrImg = ui.qrElement.querySelector('img');
    ui.qrElement.addEventListener('click', () => { // click to copy QR code image
        if (!qrImg || !navigator.clipboard.write) {
            alert('Image copy not supported in this browser.');
            return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = qrImg.width;
        canvas.height = qrImg.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(qrImg, 0, 0);
        canvas.toBlob((blob) => {
            navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
            .then(() => showCopyConfirmation(ui.qrElement))
            .catch(err => console.error('Failed to copy image: ', err));
        }, 'image/png');
    });
}
function setupMessageForm(roomId, ui) {
    ui.messageForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const message = ui.messageInput.value.trim();
        if (message) {
            socket.emit('send_message', { roomId, message });
            ui.messageInput.value = '';
        }
    });
}
function joinRoom(roomId) {
    const oldSocketId = sessionStorage.getItem('previousSocketId');
    sessionStorage.removeItem('previousSocketId');
    socket.emit('join_room', { roomId, oldSocketId });
}

// --- Rendering Functions ---

function renderUserMessage(data) { // renders a standard user message
    const messagesContainer = document.querySelector('.messages');
    if (!messagesContainer) return;
    const messageElement = document.createElement('p');
    const sender = data.sender;
    const userColor = getUsernameColor(sender.username);
    const usernameStrong = document.createElement('strong');
    const usernameSpan = document.createElement('span');
    usernameSpan.style.color = userColor;
    usernameSpan.textContent = sender.username;
    usernameStrong.appendChild(document.createTextNode('<')); // explicitly create text nodes for characters that could be interpreted as HTML
    usernameStrong.appendChild(usernameSpan);
    usernameStrong.appendChild(document.createTextNode('>'));
    const messageText = document.createTextNode(` ${data.message}`);
    messageElement.appendChild(usernameStrong);
    messageElement.appendChild(messageText);
    messagesContainer.appendChild(messageElement);
}

function renderEventMessage(data) { // renders a join/leave event message
    const messagesContainer = document.querySelector('.messages');
    if (!messagesContainer) return;
    const eventElement = document.createElement('p');
    eventElement.classList.add('event-message');
    eventElement.textContent = data.text;
    messagesContainer.appendChild(eventElement);
}

// --- Socket Event Listeners ---

socket.on('room_created', (roomId) => {
    console.log(`Server created room. ID: ${roomId}`);
    sessionStorage.setItem('previousSocketId', socket.id);
    window.location.href = `room.html#${roomId}`;
});

socket.on('load_history', (history) => { // handles receiving message history when joining a room
    const messagesContainer = document.querySelector('.messages');
    if (!messagesContainer) return;
    messagesContainer.innerHTML = ''; // clear "Connecting..."
    history.forEach(item => {
        if (item.type === 'message') {
            renderUserMessage(item.data);
        } else if (item.type === 'event') {
            renderEventMessage(item.data);
        }
    });
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
});

socket.on('update_participants', (participants) => {
    console.log('Updating participants:', participants);
    const memberList = document.querySelector('.member-list');
    const ownerName = document.querySelector('.owner-name');
    if (!memberList || !ownerName) return;

    memberList.innerHTML = '';
    participants.forEach((p, index) => {
        const li = document.createElement('li');
        let displayName = p.username;

        if (index === 0) {
            ownerName.textContent = `${p.username}`;
            displayName += ' (Owner)';
        }

        if (p.id === socket.id) {
            displayName += ' (You)';
            if (index === 0) {
                ownerName.textContent += ' (You)';
            }
        }
        li.textContent = displayName;
        memberList.appendChild(li);
    });
});

socket.on('user_event', (data) => { // handles a user join/leave event
    renderEventMessage(data);
    const messagesContainer = document.querySelector('.messages');
    if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
});

socket.on('receive_message', (data) => { // uses reusable rendering function
    renderUserMessage(data);
    const messagesContainer = document.querySelector('.messages');
    if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
});

socket.on('room_closed', (message) => {
    alert(message);
    window.location.href = 'index.html';
});

socket.on('join_error', (message) => {
    alert(message);
    window.location.href = 'index.html';
});