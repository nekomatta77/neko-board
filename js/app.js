import { db, ref, set, push, onValue, update, remove, child, get, query, limitToLast, onChildAdded, off } from './firebase-config.js';

// DOM Элементы
const authScreen = document.getElementById('auth-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');

const usernameInput = document.getElementById('username-input');
const loginBtn = document.getElementById('login-btn');
const userDisplay = document.getElementById('user-display');

const createGameBtn = document.getElementById('create-game-btn');
const playersCountSelect = document.getElementById('players-count-select');
const roomsList = document.getElementById('rooms-list');

const leaveGameBtn = document.getElementById('leave-game-btn');
const roomIdDisplay = document.getElementById('room-id-display');
const playersContainer = document.getElementById('players-container');

// Чат
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat-btn');

// Аватар
const currentAvatarImg = document.getElementById('current-avatar-img');
const nextAvatarBtn = document.getElementById('next-avatar-btn');
const prevAvatarBtn = document.getElementById('prev-avatar-btn'); // Новая кнопка

// Уведомления
const notificationContainer = document.getElementById('notification-container');

// Состояние
let currentUser = null;
let currentAvatarId = 1;
let myUserId = 'user_' + Math.random().toString(36).substr(2, 9);
let currentRoomId = null;
let amIHost = false;

// --- УВЕДОМЛЕНИЯ ---
function showNotification(message, type = 'info') {
    const notif = document.createElement('div');
    notif.className = `notification ${type}`;
    notif.textContent = message;
    
    notificationContainer.appendChild(notif);

    // Анимация появления
    requestAnimationFrame(() => {
        notif.classList.add('show');
    });

    // Удаление через 3 секунды
    setTimeout(() => {
        notif.classList.remove('show');
        setTimeout(() => notif.remove(), 300);
    }, 3000);
}

// --- ЛОГИКА АВАТАРА ---
nextAvatarBtn.addEventListener('click', () => changeAvatar(1));
prevAvatarBtn.addEventListener('click', () => changeAvatar(-1));

function changeAvatar(direction) {
    currentAvatarId += direction;
    if (currentAvatarId > 20) currentAvatarId = 1;
    if (currentAvatarId < 1) currentAvatarId = 20;
    
    currentAvatarImg.src = `assets/avatars/ava${currentAvatarId}.png`;
    
    // Анимация кнопок
    const btn = direction === 1 ? nextAvatarBtn : prevAvatarBtn;
    btn.style.transform = "scale(0.8)";
    setTimeout(() => btn.style.transform = "scale(1)", 150);
}

// --- АВТОРИЗАЦИЯ ---
loginBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    if (username) {
        currentUser = username;
        userDisplay.innerHTML = `
            <div class="profile-info">
                <img src="assets/avatars/ava${currentAvatarId}.png" class="profile-avatar">
                <div class="profile-text">
                    <span class="profile-name">${currentUser}</span>
                    <span class="profile-status">● Online</span>
                </div>
            </div>
        `;
        showScreen(lobbyScreen);
        loadRooms();
    } else {
        showNotification('Пожалуйста, введите ник!', 'error');
    }
});

// --- ЧАТ КОМНАТЫ ---
let roomChatRef = null;

function initRoomChat(roomId) {
    chatMessages.innerHTML = '<div class="chat-welcome">Вы вошли в чат комнаты</div>';
    roomChatRef = query(ref(db, `rooms/${roomId}/chat`), limitToLast(50));
    
    onChildAdded(roomChatRef, (snapshot) => {
        const msg = snapshot.val();
        renderMessage(msg);
    });
}

sendChatBtn.addEventListener('click', sendMessage);

function sendMessage() {
    if (!currentRoomId) return;
    const text = chatInput.value.trim();
    if (text) {
        push(ref(db, `rooms/${currentRoomId}/chat`), {
            user: currentUser,
            text: text,
            avatar: currentAvatarId
        });
        chatInput.value = '';
    }
}

function renderMessage(msg) {
    const el = document.createElement('div');
    el.className = 'chat-msg';
    const isMine = msg.user === currentUser;
    
    el.innerHTML = `
        <span class="msg-author" style="color: ${isMine ? '#bb86fc' : '#03dac6'}">${msg.user}:</span>
        <span class="msg-text">${msg.text}</span>
    `;
    chatMessages.appendChild(el);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// --- СОЗДАНИЕ КОМНАТЫ ---
createGameBtn.addEventListener('click', () => {
    const maxPlayers = parseInt(playersCountSelect.value);
    const roomsRef = ref(db, 'rooms');
    const newRoomRef = push(roomsRef);
    
    const initialPlayers = {};
    initialPlayers[myUserId] = {
        name: currentUser,
        avatar: currentAvatarId,
        isHost: true
    };

    const roomData = {
        hostName: currentUser,
        maxPlayers: maxPlayers,
        players: initialPlayers,
        status: "waiting",
        createdAt: Date.now()
    };

    set(newRoomRef, roomData).then(() => {
        currentRoomId = newRoomRef.key;
        amIHost = true;
        enterGameScreen(currentRoomId);
        showNotification('Комната создана!');
    });
});

// --- СПИСОК КОМНАТ ---
function loadRooms() {
    const roomsRef = ref(db, 'rooms');
    
    onValue(roomsRef, (snapshot) => {
        roomsList.innerHTML = ''; 
        const data = snapshot.val();

        if (!data) {
            roomsList.innerHTML = '<div class="empty-state">Нет активных комнат</div>';
            return;
        }

        Object.keys(data).forEach(key => {
            const room = data[key];
            const playersCount = room.players ? Object.keys(room.players).length : 0;

            if (room.status === "waiting") {
                const roomEl = document.createElement('div');
                roomEl.className = 'room-card';
                
                let hostAvatar = 1;
                if (room.players) {
                    const hostPlayer = Object.values(room.players).find(p => p.isHost);
                    if (hostPlayer) hostAvatar = hostPlayer.avatar;
                }

                const isFull = playersCount >= room.maxPlayers;
                const btnText = isFull ? "Полная" : "Войти";
                const btnClass = isFull ? "join-btn full" : "join-btn";

                roomEl.innerHTML = `
                    <div class="room-info">
                        <img src="assets/avatars/ava${hostAvatar}.png" class="room-avatar">
                        <div class="room-text">
                            <span><b>${room.hostName}</b></span>
                            <small>Игроки: ${playersCount} / ${room.maxPlayers}</small>
                        </div>
                    </div>
                    <button class="${btnClass}" ${isFull ? 'disabled' : ''}>${btnText}</button>
                `;
                
                if (!isFull) {
                    roomEl.querySelector('.join-btn').addEventListener('click', () => {
                        joinRoom(key, room.maxPlayers);
                    });
                }
                roomsList.appendChild(roomEl);
            }
        });
    });
}

function joinRoom(roomId, maxPlayers) {
    const roomPlayersRef = ref(db, `rooms/${roomId}/players`);
    
    get(roomPlayersRef).then((snapshot) => {
        const players = snapshot.val() || {};
        if (Object.keys(players).length >= maxPlayers) {
            showNotification("Комната уже заполнена!", "error");
            return;
        }

        const myPlayerData = {
            name: currentUser,
            avatar: currentAvatarId,
            isHost: false
        };

        update(ref(db, `rooms/${roomId}/players/${myUserId}`), myPlayerData)
            .then(() => {
                currentRoomId = roomId;
                amIHost = false;
                enterGameScreen(roomId);
                showNotification('Вы вошли в комнату');
            })
            .catch(err => showNotification("Ошибка входа: " + err.message, "error"));
    });
}

// --- ЭКРАН ИГРЫ ---
function enterGameScreen(roomId) {
    showScreen(gameScreen);
    roomIdDisplay.textContent = `Комната`;
    subscribeToRoom(roomId);
    initRoomChat(roomId);
}

function subscribeToRoom(roomId) {
    const roomRef = ref(db, `rooms/${roomId}`);
    
    onValue(roomRef, (snapshot) => {
        const room = snapshot.val();
        if (!room) {
            // Если комната удалена, а мы еще на экране игры
            if (currentRoomId === roomId) {
                showNotification("Комната была закрыта хостом", "info");
                handleLeave();
            }
            return;
        }

        if (room.players && room.players[myUserId]) {
            amIHost = room.players[myUserId].isHost;
        }

        renderPlayersList(room.players);

        const count = Object.keys(room.players).length;
        const statusText = document.querySelector('.waiting-text');
        
        if (statusText) {
            if (count >= room.maxPlayers) {
                if (amIHost) {
                    statusText.innerHTML = `<span style="color:#03dac6">Вы Хост! Скоро здесь будет выбор игры...</span>`;
                } else {
                    statusText.textContent = "Ждем выбора игры хостом...";
                    statusText.style.color = "#888";
                }
            } else {
                statusText.textContent = `Ожидание... (${count}/${room.maxPlayers})`;
            }
        }
    });
}

function renderPlayersList(playersObj) {
    playersContainer.innerHTML = '';
    if (!playersObj) return;

    Object.values(playersObj).forEach(player => {
        const el = document.createElement('div');
        el.className = 'player-slot';
        el.innerHTML = `
            <div class="avatar-wrapper">
                <img src="assets/avatars/ava${player.avatar}.png">
            </div>
            <span class="player-name">${player.name}</span>
            ${player.isHost ? '<span class="host-badge">👑</span>' : ''}
        `;
        playersContainer.appendChild(el);
    });
}

leaveGameBtn.addEventListener('click', () => {
    if (currentRoomId) {
        const playerRef = ref(db, `rooms/${currentRoomId}/players/${myUserId}`);
        const roomRef = ref(db, `rooms/${currentRoomId}`);

        remove(playerRef).then(() => {
            get(child(roomRef, 'players')).then((snapshot) => {
                if (!snapshot.exists()) {
                    remove(roomRef);
                }
            });
        });
    }
    handleLeave();
});

function handleLeave() {
    currentRoomId = null;
    if (roomChatRef) {
        off(roomChatRef);
        roomChatRef = null;
    }
    showScreen(lobbyScreen);
}

function showScreen(screen) {
    authScreen.classList.add('hidden');
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.add('hidden');
    screen.classList.remove('hidden');
}
