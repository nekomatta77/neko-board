import { db, ref, set, push, onValue, update, remove, child, get } from './firebase-config.js';
import { startChat, stopChat } from './chat.js';

// --- 1. ОПРЕДЕЛЕНИЕ ПЛАТФОРМЫ И ЗАГРУЗКА СТИЛЕЙ ---
const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const currentPlatform = isIos ? 'iphone' : (isMobile ? 'android' : 'pc');

function loadPlatformStyles() {
    const files = ['main', 'menu', 'lobby', 'game', 'chat'];
    files.forEach(file => {
        let link = document.querySelector(`link[href*="/${file}.css"]`) || document.querySelector(`link[href$="${file}.css"]`);
        if (!link) {
            link = document.createElement('link');
            link.rel = 'stylesheet';
            document.head.appendChild(link);
        }
        link.href = `css/${currentPlatform}/${file}.css`;
    });
}
loadPlatformStyles();

// --- 2. ГЕНЕРАЦИЯ И СОХРАНЕНИЕ ID (ИСПРАВЛЕНИЕ ОШИБКИ) ---
// Пытаемся найти сохраненный ID. Если нет — создаем и сохраняем навсегда.
let myUserId = localStorage.getItem('neko_user_id');
if (!myUserId) {
    myUserId = 'user_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('neko_user_id', myUserId);
}

// --- DOM ЭЛЕМЕНТЫ ---
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
let currentRoomId = null;
let amIHost = false;
let activeGameCleanup = null;
let roomListener = null;

// --- ВОССТАНОВЛЕНИЕ ДАННЫХ ПРИ ВХОДЕ ---
window.addEventListener('DOMContentLoaded', () => {
    const savedName = localStorage.getItem('neko_username');
    const savedAva = localStorage.getItem('neko_avatar');
    
    if (savedName) usernameInput.value = savedName;
    if (savedAva) {
        currentAvatarId = parseInt(savedAva);
        currentAvatarImg.src = `assets/avatars/ava${currentAvatarId}.png`;
    }
});

// --- УВЕДОМЛЕНИЯ ---
function showNotification(message, type = 'info') {
    let container = document.getElementById('notification-container');
    if (!container) return; 

    const notif = document.createElement('div');
    notif.className = `notification ${type}`;
    notif.textContent = message;
    container.appendChild(notif);
    
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
        localStorage.setItem('neko_username', currentUser);
        localStorage.setItem('neko_avatar', currentAvatarId);

        updateProfileDisplay();
        showScreen(lobbyScreen);
        loadRooms();
    } else {
        showNotification('Пожалуйста, введите ник!', 'error');
    }
});

function updateProfileDisplay() {
    userDisplay.innerHTML = `
        <div class="profile-info">
            <img src="assets/avatars/ava${currentAvatarId}.png" class="profile-avatar">
            <div class="profile-text">
                <span class="profile-name">${currentUser}</span>
                <span class="profile-status">● Online</span>
            </div>
        </div>
    `;
}

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
            
            // Проверка: я внутри этой комнаты?
            const amIIn = room.players && room.players[myUserId];

            // Показываем комнату если она "ждет" ИЛИ если мы уже в ней (реконнект)
            if (room.status === "waiting" || amIIn) { 
                const roomEl = document.createElement('div');
                roomEl.className = 'room-card';
                
                let hostAvatar = 1;
                if (room.players) {
                    const hostPlayer = Object.values(room.players).find(p => p.isHost);
                    if (hostPlayer) hostAvatar = hostPlayer.avatar;
                }
                
                const isFull = playersCount >= room.maxPlayers;
                
                // Текст кнопки меняется
                let btnText = isFull ? "Полная" : "Войти";
                let btnClass = isFull ? "join-btn full" : "join-btn";
                
                if (amIIn) {
                    btnText = "Вернуться"; // Если мы уже там
                    btnClass = "join-btn"; // Кнопка активна
                }

                roomEl.innerHTML = `
                    <div class="room-info">
                        <img src="assets/avatars/ava${hostAvatar}.png" class="room-avatar">
                        <div class="room-text">
                            <span><b>${room.hostName}</b></span>
                            <small>Игроки: ${playersCount} / ${room.maxPlayers}</small>
                        </div>
                    </div>
                    <button class="${btnClass}" ${(!amIIn && isFull) ? 'disabled' : ''}>${btnText}</button>
                `;
                
                if (amIIn || !isFull) {
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
        
        // 1. ИСПРАВЛЕНИЕ: Если мы уже в комнате (по ID), просто обновляем данные
        if (players[myUserId]) {
            const existingData = players[myUserId];
            
            // Обновляем ник и аватар (вдруг сменили), но статус хоста оставляем старый
            update(ref(db, `rooms/${roomId}/players/${myUserId}`), {
                name: currentUser,
                avatar: currentAvatarId
            }).then(() => {
                currentRoomId = roomId;
                amIHost = existingData.isHost; // Восстанавливаем права хоста
                enterGameScreen(roomId);
                showNotification('С возвращением!');
            });
            return;
        }

        // 2. Если нас нет и комната полная
        if (Object.keys(players).length >= maxPlayers) {
            showNotification("Комната уже заполнена!", "error");
            return;
        }

        // 3. Заходим как новый игрок
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

// --- ЭКРАН ИГРЫ ---
function enterGameScreen(roomId) {
    showScreen(gameScreen);
    roomIdDisplay.textContent = `Комната`;
    subscribeToRoom(roomId);
    startChat(roomId, currentUser, currentAvatarId);
}

function subscribeToRoom(roomId) {
    const roomRef = ref(db, `rooms/${roomId}`);
    
    if (roomListener) roomListener(); // Сброс старой подписки если была

    roomListener = onValue(roomRef, (snapshot) => {
        const room = snapshot.val();
        
        // 1. Комната удалена
        if (!room) {
            if (currentRoomId === roomId) {
                showNotification("Комната закрыта", "info");
                handleLeave(true);
            }
            return;
        }

        // 2. Нас кикнули? (Меня нет в списке)
        if (room.players && !room.players[myUserId]) {
             showNotification("Вы были исключены", "error");
             handleLeave(true);
             return;
        }

        // 3. Актуализируем статус хоста
        if (room.players && room.players[myUserId]) {
            amIHost = room.players[myUserId].isHost;
        }

        // 4. Старт игры / Синхронизация
        if (room.status && room.status.startsWith('playing_')) {
            const gameName = room.status.split('_')[1];
            if (fullscreenOverlay.classList.contains('hidden') || fullscreenMount.getAttribute('data-game') !== gameName) {
                loadGameModule(gameName);
            }
        } else {
             if (!fullscreenOverlay.classList.contains('hidden')) {
                 closeFullscreenGame();
             }
        }

        // 5. Рендер игроков
        renderPlayersList(room.players);

        // 6. Меню выбора (для хоста)
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
    
    Object.entries(playersObj).forEach(([pid, player]) => {
        const el = document.createElement('div');
        el.className = 'player-slot';
        
        let kickButtonHtml = '';
        // Кнопка кика: видит только хост, нельзя кикнуть себя
        if (amIHost && pid !== myUserId) {
            kickButtonHtml = `<button class="kick-btn" onclick="kickPlayer('${pid}')" title="Выгнать">×</button>`;
        }

        el.innerHTML = `
            <div class="avatar-wrapper">
                <img src="assets/avatars/ava${player.avatar}.png">
            </div>
            <span class="player-name">${player.name}</span>
            ${player.isHost ? '<span class="host-badge">👑</span>' : ''}
            ${kickButtonHtml}
        `;
        playersContainer.appendChild(el);
    });
}

// Глобальная функция для кика
window.kickPlayer = function(playerId) {
    if (!currentRoomId || !amIHost) return;
    if (confirm("Исключить игрока?")) {
        remove(ref(db, `rooms/${currentRoomId}/players/${playerId}`));
    }
}

// --- МЕНЮ ВЫБОРА ИГР ---
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

// --- ЗАГРУЗКА МОДУЛЯ ИГРЫ ---
async function loadGameModule(gameName) {
    fullscreenMount.innerHTML = '<div class="waiting-text">Загрузка...</div>';
    fullscreenMount.setAttribute('data-game', gameName);
    fullscreenOverlay.classList.remove('hidden');
    
    activeGameTitle.textContent = (gameName === 'tictac') ? "Крестики-Нолики" : "Игра";

    let gameCssFile = 'android.css';
    if (currentPlatform === 'iphone') gameCssFile = 'iphone.css';
    
    const oldCss = document.getElementById('game-module-css');
    if (oldCss) oldCss.remove();

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `games/${gameName}/${gameCssFile}`;
    link.id = 'game-module-css';
    document.head.appendChild(link);

    try {
        const gameModule = await import(`../games/${gameName}/${gameName}.js`);
        if (activeGameCleanup) activeGameCleanup();
        
        gameModule.initGame(fullscreenMount, currentRoomId, myUserId, amIHost);
        activeGameCleanup = gameModule.cleanupGame;

    } catch (error) {
        console.error(error);
        fullscreenMount.innerHTML = '<div class="waiting-text error">Ошибка загрузки игры</div>';
    }
}

closeFullscreenBtn.addEventListener('click', () => {
    if (amIHost && currentRoomId) {
        if(confirm("Завершить игру для всех?")) {
            update(ref(db, `rooms/${currentRoomId}`), { status: 'waiting' });
            closeFullscreenGame();
        }
    } else {
        if(confirm("Свернуть игру?")) {
             closeFullscreenGame();
        }
    }
});

function closeFullscreenGame() {
    fullscreenOverlay.classList.add('hidden');
    fullscreenMount.innerHTML = '';
    fullscreenMount.removeAttribute('data-game');
    
    if (activeGameCleanup) {
        activeGameCleanup();
        activeGameCleanup = null;
    }
}

// --- ВЫХОД ---
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

function handleLeave(forced = false) {
    if (roomListener) { // Отписка при выходе
        // В Firebase v9 onValue возвращает функцию отписки (unsubscribe)
        // Но так как мы не сохраняем возврат onValue в переменную отписки корректно в некоторых версиях кода, 
        // лучше использовать off() если мы использовали старый стиль, или вызывать сохраненную функцию.
        // Здесь roomListener - это unsubscribe функция.
        if (typeof roomListener === 'function') roomListener(); 
        roomListener = null;
    }
    currentRoomId = null;
    amIHost = false;
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