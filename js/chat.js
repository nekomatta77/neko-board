import { db, ref, push, onChildAdded, query, limitToLast, off } from './firebase-config.js';

// DOM Элементы (они общие, но управление ими берет на себя этот модуль)
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat-btn');

// Локальные переменные модуля
let chatRef = null;
let _roomId = null;
let _currentUser = null;
let _currentAvatarId = 1;

/**
 * Запускает чат для конкретной комнаты
 * @param {string} roomId - ID комнаты
 * @param {string} username - Ник игрока
 * @param {number} avatarId - ID аватара
 */
export function startChat(roomId, username, avatarId) {
    _roomId = roomId;
    _currentUser = username;
    _currentAvatarId = avatarId;

    // Очистка и приветствие
    chatMessages.innerHTML = '<div class="chat-welcome">Вы вошли в чат комнаты</div>';

    // Подписка на Firebase
    chatRef = query(ref(db, `rooms/${roomId}/chat`), limitToLast(50));
    
    onChildAdded(chatRef, (snapshot) => {
        const msg = snapshot.val();
        renderMessage(msg);
    });

    // Привязываем событие клика (перезаписываем onclick, чтобы не дублировать слушатели)
    sendChatBtn.onclick = sendMessage;
}

/**
 * Останавливает чат (отключает слушатели)
 */
export function stopChat() {
    if (chatRef) {
        off(chatRef); // Отключаем Firebase слушатель
        chatRef = null;
    }
    _roomId = null;
    sendChatBtn.onclick = null; // Убираем клик
}

/**
 * Внутренняя функция отправки
 */
function sendMessage() {
    if (!_roomId) return;

    const text = chatInput.value.trim();
    if (text) {
        push(ref(db, `rooms/${_roomId}/chat`), {
            user: _currentUser,
            text: text,
            avatar: _currentAvatarId
        });
        chatInput.value = '';
    }
}

/**
 * Внутренняя функция рендеринга сообщения
 */
function renderMessage(msg) {
    const el = document.createElement('div');
    el.className = 'chat-msg';
    const isMine = msg.user === _currentUser;
    
    el.innerHTML = `
        <span class="msg-author" style="color: ${isMine ? '#bb86fc' : '#03dac6'}">${msg.user}:</span>
        <span class="msg-text">${msg.text}</span>
    `;
    chatMessages.appendChild(el);
    chatMessages.scrollTop = chatMessages.scrollHeight; // Автоскролл
}
