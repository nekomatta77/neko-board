import { db, ref, push, onChildAdded, query, limitToLast, off } from './firebase-config.js';
import { updateRoomActivity } from './app.js'; // Импортируем функцию обновления активности

// DOM Элементы
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat-btn');

// Локальные переменные
let chatRef = null;
let _roomId = null;
let _currentUser = null;
let _currentAvatarId = 1;

export function startChat(roomId, username, avatarId) {
    _roomId = roomId;
    _currentUser = username;
    _currentAvatarId = avatarId;

    chatMessages.innerHTML = '<div class="chat-welcome">Вы вошли в чат комнаты</div>';

    chatRef = query(ref(db, `rooms/${roomId}/chat`), limitToLast(50));
    
    onChildAdded(chatRef, (snapshot) => {
        const msg = snapshot.val();
        renderMessage(msg);
    });

    sendChatBtn.onclick = sendMessage;

    // Отправка по Enter
    chatInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    };
}

export function stopChat() {
    if (chatRef) {
        off(chatRef); 
        chatRef = null;
    }
    _roomId = null;
    sendChatBtn.onclick = null;
    chatInput.onkeydown = null;
}

function sendMessage() {
    if (!_roomId) return;

    const text = chatInput.value.trim();
    if (text) {
        // Обновляем таймер активности комнаты!
        updateRoomActivity(_roomId);

        push(ref(db, `rooms/${_roomId}/chat`), {
            user: _currentUser,
            text: text,
            avatar: _currentAvatarId
        });
        chatInput.value = '';
        chatInput.focus();
    }
}

function renderMessage(msg) {
    const el = document.createElement('div');
    el.className = 'chat-msg';
    const isMine = msg.user === _currentUser;
    
    el.innerHTML = `
        <span class="msg-author" style="color: ${isMine ? '#bb86fc' : '#03dac6'}">${msg.user}:</span>
        <span class="msg-text">${msg.text}</span>
    `;
    chatMessages.appendChild(el);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}