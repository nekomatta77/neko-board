import { db, ref, set, push, onValue, update, remove, child, get } from './firebase-config.js';
import { startChat, stopChat } from './chat.js';

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

// Аватар
const currentAvatarImg = document.getElementById('current-avatar-img');
const nextAvatarBtn = document.getElementById('next-avatar-btn');
const prevAvatarBtn = document.getElementById('prev-avatar-btn');
const notificationContainer = document.getElementById('notification-container');

// Полноэкранный режим
const fullscreenOverlay = document.getElementById('fullscreen-overlay');
const closeFullscreenBtn = document.getElementById('close-fullscreen-btn');
const activeGameTitle = document.getElementById('active-game-title');
const fullscreenMount = document.getElementById('fullscreen-game-mount');

// Состояние
let currentUser = null;
let currentAvatarId = 1;
let myUserId = 'user_' + Math.random().toString(36).substr(2, 9);
let currentRoomId = null;
let amIHost = false;
let activeGameCleanup = null;

// --- УВЕДОМЛЕНИЯ ---
function showNotification(message, type = 'info') {
    const notif = document.createElement('div');
    notif.className = `notification ${type}`;
    notif.textContent = message;
    notificationContainer.appendChild(notif);
    requestAnimationFrame(() => notif.classList.add('show'));
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

// --- СОЗДАНИЕ КОМНАТЫ ---
createGameBtn.addEventListener('click', () => {
    const maxPlayers = parseInt(playersCountSelect.value);
    const roomsRef = ref(db, 'rooms');
    const newRoomRef = push(roomsRef);
    
    const initialPlayers = {};
    initialPlayers[myUserId] = { name: currentUser, avatar: currentAvatarId, isHost: true };

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
            if (room.status === "waiting") { // Показываем только если статус waiting
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
                    roomEl.querySelector('.join-btn').addEventListener('click', () => joinRoom(key, room.maxPlayers));
                }
                roomsList.appendChild(roomEl);
            }
        });
    });
}

function joinRoom(roomId, maxPlayers) {
    get(ref(db, `rooms/${roomId}/players`)).then((snapshot) => {
        const players = snapshot.val() || {};
        if (Object.keys(players).length >= maxPlayers) {
            showNotification("Комната уже заполнена!", "error");
            return;
        }
        const myPlayerData = { name: currentUser, avatar: currentAvatarId, isHost: false };
        update(ref(db, `rooms/${roomId}/players/${myUserId}`), myPlayerData)
            .then(() => {
                currentRoomId = roomId;
                amIHost = false;
                enterGameScreen(roomId);
                showNotification('Вы вошли в комнату');
            })
            .catch(err => showNotification("Ошибка: " + err.message, "error"));
    });
}

// --- ЭКРАН ИГРЫ (КОМНАТА) ---
function enterGameScreen(roomId) {
    showScreen(gameScreen);
    roomIdDisplay.textContent = `Комната`;
    subscribeToRoom(roomId);
    startChat(roomId, currentUser, currentAvatarId);
}

function subscribeToRoom(roomId) {
    const roomRef = ref(db, `rooms/${roomId}`);
    
    onValue(roomRef, (snapshot) => {
        const room = snapshot.val();
        
        // 1. Комната удалена
        if (!room) {
            if (currentRoomId === roomId) {
                showNotification("Комната закрыта", "info");
                handleLeave();
            }
            return;
        }

        // 2. Обновляем статус хоста
        if (room.players && room.players[myUserId]) {
            amIHost = room.players[myUserId].isHost;
        }

        // 3. ВАЖНО: Проверка старта игры ПЕРЕД всем остальным
        // Если статус игра, и у нас еще не открыт fullscreen с этой игрой
        if (room.status && room.status.startsWith('playing_')) {
            const gameName = room.status.split('_')[1];
            if (fullscreenOverlay.classList.contains('hidden') || fullscreenMount.getAttribute('data-game') !== gameName) {
                loadGameModule(gameName);
            }
            // Не делаем return, чтобы список игроков в лобби (под оверлеем) тоже обновлялся
        } else {
             // Если статус waiting, но оверлей открыт -> закрываем его (рестарт в меню)
             if (!fullscreenOverlay.classList.contains('hidden')) {
                 closeFullscreenGame();
             }
        }

        // 4. Рисуем игроков
        renderPlayersList(room.players);

        // 5. Рисуем меню выбора (только если не играем)
        const count = Object.keys(room.players).length;
        const selectionArea = document.getElementById('game-selection-area');
        
        if (count >= room.maxPlayers) {
            if (amIHost) {
                if (!document.getElementById('game-selector')) {
                    renderGameMenu(selectionArea);
                }
            } else {
                selectionArea.innerHTML = '<div class="waiting-text" style="color:#888">Хост выбирает игру...</div>';
            }
        } else {
            selectionArea.innerHTML = `<div class="waiting-text">Ожидание... (${count}/${room.maxPlayers})</div>`;
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

// --- МЕНЮ ВЫБОРА ИГР (КРАСИВОЕ) ---
function renderGameMenu(container) {
    container.innerHTML = `
        <div id="game-selector" class="game-selector">
            <h3>Выберите игру:</h3>
            <div class="games-grid-menu">
                
                <button class="game-card-btn tictac" onclick="startGameTrigger('tictac')">
                    <div class="game-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 6L6 18M6 6l12 12"/>
                            <circle cx="12" cy="12" r="10" stroke-opacity="0.2"/>
                        </svg>
                    </div>
                    <span>Крестики-Нолики</span>
                </button>

                <button class="game-card-btn durak disabled">
                    <div class="game-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                           <rect x="6" y="2" width="12" height="20" rx="2" />
                           <path d="M12 8v8M9 12h6" />
                        </svg>
                    </div>
                    <span>Дурак (Скоро)</span>
                </button>

            </div>
        </div>
    `;
}

window.startGameTrigger = function(gameName) {
    if (!currentRoomId || !amIHost) return;
    update(ref(db, `rooms/${currentRoomId}`), { status: `playing_${gameName}` });
}

// --- ДИНАМИЧЕСКАЯ ЗАГРУЗКА (FULLSCREEN) ---
async function loadGameModule(gameName) {
    // 1. Показываем оверлей
    fullscreenMount.innerHTML = '<div class="waiting-text">Загрузка...</div>';
    fullscreenMount.setAttribute('data-game', gameName);
    fullscreenOverlay.classList.remove('hidden');
    
    // Меняем заголовок
    activeGameTitle.textContent = (gameName === 'tictac') ? "Крестики-Нолики" : "Игра";

    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const cssFile = isIos ? 'iphone.css' : 'android.css';
    
    // Подключаем CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `games/${gameName}/${cssFile}`;
    link.id = 'game-css';
    document.head.appendChild(link);

    try {
        const gameModule = await import(`../games/${gameName}/${gameName}.js`);
        if (activeGameCleanup) activeGameCleanup();
        
        // Рендерим игру
        gameModule.initGame(fullscreenMount, currentRoomId, myUserId, amIHost);
        activeGameCleanup = gameModule.cleanupGame;

    } catch (error) {
        console.error(error);
        fullscreenMount.innerHTML = '<div class="waiting-text error">Ошибка игры</div>';
    }
}

// Кнопка "Свернуть/Выйти" в игре (только локально для хоста, либо сброс для всех)
closeFullscreenBtn.addEventListener('click', () => {
    // Если ты хост, ты сбрасываешь игру для всех
    if (amIHost && currentRoomId) {
        if(confirm("Завершить игру для всех?")) {
            update(ref(db, `rooms/${currentRoomId}`), { status: 'waiting' });
            closeFullscreenGame();
        }
    } else {
        // Если гость - просто спрашиваем выход из комнаты?
        if(confirm("Выйти из игры?")) {
             // Логика выхода гостя
             leaveGameBtn.click();
        }
    }
});

function closeFullscreenGame() {
    fullscreenOverlay.classList.add('hidden');
    fullscreenMount.innerHTML = '';
    fullscreenMount.removeAttribute('data-game');
    
    const gameCss = document.getElementById('game-css');
    if (gameCss) gameCss.remove();

    if (activeGameCleanup) {
        activeGameCleanup();
        activeGameCleanup = null;
    }
}


// --- ВЫХОД ИЗ КОМНАТЫ ---
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
    stopChat();
    closeFullscreenGame();
    showScreen(lobbyScreen);
}

function showScreen(screen) {
    authScreen.classList.add('hidden');
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.add('hidden');
    screen.classList.remove('hidden');
}
