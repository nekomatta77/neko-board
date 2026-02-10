import { db, ref, set, push, onValue, update, remove, child, get } from './firebase-config.js';
import { startChat, stopChat } from './chat.js';

// --- НАСТРОЙКИ ---
const INACTIVITY_LIMIT = 30 * 60 * 1000;
const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const currentPlatform = isIos ? 'iphone' : (isMobile ? 'android' : 'pc');

// Загрузка стилей
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

    if (isMobile) {
        let style = document.getElementById('orientation-style');
        if (!style) {
            style = document.createElement('style');
            style.id = 'orientation-style';
            style.textContent = `
                #orientation-warning {
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    background: #111; z-index: 100000;
                    display: none; flex-direction: column; align-items: center; justify-content: center;
                    color: white; text-align: center;
                }
                #orientation-warning img { width: 80px; margin-bottom: 20px; animation: rotate-phone 2s infinite ease-in-out; }
                @keyframes rotate-phone { 0% { transform: rotate(0deg); } 50% { transform: rotate(90deg); } 100% { transform: rotate(0deg); } }
            `;
            document.head.appendChild(style);

            const warningDiv = document.createElement('div');
            warningDiv.id = 'orientation-warning';
            warningDiv.innerHTML = `
                <div style="font-size:40px;">📱</div>
                <h3>Пожалуйста, переверните устройство</h3>
                <p>Режим "Brawl" работает горизонтально</p>
            `;
            document.body.appendChild(warningDiv);
        }

        function checkOrientation() {
            const warning = document.getElementById('orientation-warning');
            const isInGame = document.body.classList.contains('in-game');
            const isPortrait = window.innerHeight > window.innerWidth;

            if (isInGame && isPortrait) {
                warning.style.display = 'flex';
            } else {
                warning.style.display = 'none';
            }
        }
        window.addEventListener('resize', checkOrientation);
        const observer = new MutationObserver(checkOrientation);
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
}
loadPlatformStyles();

let myUserId = localStorage.getItem('neko_user_id');
if (!myUserId) {
    myUserId = 'user_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('neko_user_id', myUserId);
}

// DOM Elements
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
const fullscreenOverlay = document.getElementById('fullscreen-overlay');
const closeFullscreenBtn = document.getElementById('close-fullscreen-btn');
const activeGameTitle = document.getElementById('active-game-title');
const fullscreenMount = document.getElementById('fullscreen-game-mount');

let currentUser = null;
let currentAvatarId = 1;
let currentRoomId = null;
let amIHost = false;
let activeGameCleanup = null;
let roomListener = null;

// --- INIT ---
window.addEventListener('DOMContentLoaded', () => {
    const savedName = localStorage.getItem('neko_username');
    const savedAva = localStorage.getItem('neko_avatar');
    if (savedName) usernameInput.value = savedName;
    if (savedAva) {
        currentAvatarId = parseInt(savedAva);
        currentAvatarImg.src = `assets/avatars/ava${currentAvatarId}.png`;
    }
});

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

export function updateRoomActivity(roomId) {
    if (!roomId) return;
    update(ref(db, `rooms/${roomId}`), { lastActive: Date.now() }).catch(err => console.error(err));
}

// --- AVATAR & LOGIN ---
nextAvatarBtn.addEventListener('click', () => changeAvatar(1));
prevAvatarBtn.addEventListener('click', () => changeAvatar(-1));

function changeAvatar(direction) {
    currentAvatarId += direction;
    if (currentAvatarId > 20) currentAvatarId = 1;
    if (currentAvatarId < 1) currentAvatarId = 20;
    currentAvatarImg.src = `assets/avatars/ava${currentAvatarId}.png`;
}

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

// --- ROOM CREATION ---
createGameBtn.addEventListener('click', () => {
    const maxPlayers = parseInt(playersCountSelect.value);
    const roomsRef = ref(db, 'rooms');
    const newRoomRef = push(roomsRef);

    const initialPlayers = {};
    initialPlayers[myUserId] = { name: currentUser, avatar: currentAvatarId, isHost: true, isReady: false };

    const roomData = {
        hostName: currentUser,
        maxPlayers: maxPlayers,
        players: initialPlayers,
        status: "waiting",
        selectedGame: null,
        createdAt: Date.now(),
        lastActive: Date.now()
    };

    set(newRoomRef, roomData).then(() => {
        currentRoomId = newRoomRef.key;
        amIHost = true;
        enterGameScreen(currentRoomId);
        showNotification('Комната создана!');
    });
});

// --- ROOM LIST ---
function loadRooms() {
    const roomsRef = ref(db, 'rooms');
    onValue(roomsRef, (snapshot) => {
        roomsList.innerHTML = '';
        const data = snapshot.val();
        if (!data) {
            roomsList.innerHTML = '<div class="empty-state">Нет активных комнат</div>';
            return;
        }
        const now = Date.now();
        Object.keys(data).forEach(key => {
            const room = data[key];
            if (room.lastActive && (now - room.lastActive > INACTIVITY_LIMIT)) {
                remove(ref(db, `rooms/${key}`));
                return;
            }
            const playersCount = room.players ? Object.keys(room.players).length : 0;
            const amIIn = room.players && room.players[myUserId];

            if (room.status === "waiting" || amIIn) {
                const roomEl = document.createElement('div');
                roomEl.className = 'room-card';
                
                let hostAvatar = 1;
                if (room.players) {
                    const hostPlayer = Object.values(room.players).find(p => p.isHost);
                    if (hostPlayer) hostAvatar = hostPlayer.avatar;
                }

                const isFull = playersCount >= room.maxPlayers;
                let btnText = isFull ? "Полная" : "Войти";
                let btnClass = isFull ? "join-btn full" : "join-btn";
                if (amIIn) { btnText = "Вернуться"; btnClass = "join-btn"; }

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
        updateRoomActivity(roomId);

        if (players[myUserId]) {
            update(ref(db, `rooms/${roomId}/players/${myUserId}`), {
                name: currentUser,
                avatar: currentAvatarId
            }).then(() => {
                currentRoomId = roomId;
                amIHost = players[myUserId].isHost;
                enterGameScreen(roomId);
            });
            return;
        }

        if (Object.keys(players).length >= maxPlayers) {
            showNotification("Комната заполнена!", "error");
            return;
        }

        const myPlayerData = { name: currentUser, avatar: currentAvatarId, isHost: false, isReady: false };
        update(ref(db, `rooms/${roomId}/players/${myUserId}`), myPlayerData)
            .then(() => {
                currentRoomId = roomId;
                amIHost = false;
                enterGameScreen(roomId);
                showNotification('Вы вошли в комнату');
            });
    });
}

// --- GAME LOBBY SCREEN ---
function enterGameScreen(roomId) {
    showScreen(gameScreen);
    roomIdDisplay.textContent = `Комната`;
    subscribeToRoom(roomId);
    startChat(roomId, currentUser, currentAvatarId);
}

function subscribeToRoom(roomId) {
    const roomRef = ref(db, `rooms/${roomId}`);
    if (roomListener) roomListener();

    roomListener = onValue(roomRef, (snapshot) => {
        const room = snapshot.val();
        if (!room) {
            if (currentRoomId === roomId) { showNotification("Комната закрыта", "info"); handleLeave(true); }
            return;
        }
        if (room.players && !room.players[myUserId]) {
             showNotification("Вы были исключены", "error"); handleLeave(true); return;
        }
        if (room.players && room.players[myUserId]) {
            amIHost = room.players[myUserId].isHost;
        }

        if (room.status && room.status.startsWith('playing_')) {
            const gameName = room.status.split('_')[1];
            if (fullscreenOverlay.classList.contains('hidden')) {
                loadGameModule(gameName);
            }
        } else {
             if (!fullscreenOverlay.classList.contains('hidden')) closeFullscreenGame();
        }

        renderPlayersList(room.players);
        renderGameControls(room);
    });
}

function renderPlayersList(playersObj) {
    playersContainer.innerHTML = '';
    if (!playersObj) return;
    
    Object.entries(playersObj).forEach(([pid, player]) => {
        const el = document.createElement('div');
        el.className = 'player-slot';
        
        let kickButtonHtml = '';
        if (amIHost && pid !== myUserId) {
            kickButtonHtml = `<button class="kick-btn" onclick="kickPlayer('${pid}')">×</button>`;
        }

        const readyStatus = player.isReady ? '<span class="status-ready">ГОТОВ</span>' : '<span class="status-waiting">...</span>';

        el.innerHTML = `
            <div class="avatar-wrapper">
                <img src="assets/avatars/ava${player.avatar}.png">
            </div>
            <div class="player-details">
                <span class="player-name">${player.name}</span>
                <small>${readyStatus}</small>
            </div>
            ${player.isHost ? '<span class="host-badge">👑</span>' : ''}
            ${kickButtonHtml}
        `;
        playersContainer.appendChild(el);
    });
}

function renderGameControls(room) {
    const selectionArea = document.getElementById('game-selection-area');
    const players = room.players || {};
    
    // ИСПРАВЛЕНИЕ ОШИБКИ: Проверяем, существует ли мой игрок
    if (!players[myUserId]) return;

    const allReady = Object.values(players).every(p => p.isReady);

    if (amIHost) {
        let gameCards = `
            <div class="games-grid-menu host-view">
                <button class="game-card-btn ${room.selectedGame === 'tictac' ? 'selected' : ''}" onclick="selectGame('tictac')">
                   <span>Крестики-Нолики</span>
                </button>
                <button class="game-card-btn ${room.selectedGame === 'brawl' ? 'selected' : ''}" onclick="selectGame('brawl')">
                   <span>Бравл</span>
                </button>
            </div>
        `;
        
        let startBtnState = (room.selectedGame && allReady) ? '' : 'disabled';
        let startBtnText = !room.selectedGame ? "Выберите игру" : (!allReady ? "Ждем готовности..." : "НАЧАТЬ ИГРУ");
        
        // БЕЗОПАСНЫЙ ДОСТУП к isReady
        const myReady = players[myUserId]?.isReady;
        const readyBtnHtml = `
            <button onclick="toggleReady()" class="ready-btn ${myReady ? 'is-ready' : ''}">
                ${myReady ? 'ОТМЕНА' : 'Я ГОТОВ'}
            </button>
        `;

        selectionArea.innerHTML = readyBtnHtml + gameCards + `
            <div class="host-controls">
                <button id="host-start-btn" class="action-btn" ${startBtnState}>${startBtnText}</button>
            </div>
        `;

        setTimeout(() => {
            const btn = document.getElementById('host-start-btn');
            if (btn && !btn.disabled) {
                btn.onclick = () => startGameTrigger(room.selectedGame);
            }
        }, 0);

    } else {
        // БЕЗОПАСНЫЙ ДОСТУП
        const myReady = players[myUserId]?.isReady;
        let statusText = "Хост выбирает игру...";
        if (room.selectedGame === 'tictac') statusText = "Выбрано: Крестики-Нолики";
        if (room.selectedGame === 'brawl') statusText = "Выбрано: Бравл";

        selectionArea.innerHTML = `
            <div class="client-view">
                <h3>${statusText}</h3>
                <button onclick="toggleReady()" class="ready-btn ${myReady ? 'is-ready' : ''}">
                    ${myReady ? 'Я ГОТОВ (Отмена)' : 'ГОТОВ!'}
                </button>
            </div>
        `;
    }
}

window.selectGame = function(gameName) {
    if (!currentRoomId || !amIHost) return;
    updateRoomActivity(currentRoomId);
    update(ref(db, `rooms/${currentRoomId}`), { selectedGame: gameName });
}

window.toggleReady = function() {
    if (!currentRoomId) return;
    updateRoomActivity(currentRoomId);
    get(ref(db, `rooms/${currentRoomId}/players/${myUserId}/isReady`)).then(snap => {
        const current = snap.val();
        update(ref(db, `rooms/${currentRoomId}/players/${myUserId}`), { isReady: !current });
    });
}

window.kickPlayer = function(playerId) {
    if (!currentRoomId || !amIHost) return;
    if (confirm("Исключить игрока?")) {
        remove(ref(db, `rooms/${currentRoomId}/players/${playerId}`));
    }
}

window.startGameTrigger = function(gameName) {
    if (!currentRoomId || !amIHost) return;
    update(ref(db, `rooms/${currentRoomId}`), { status: `playing_${gameName}` });
}

// --- ЗАГРУЗКА ИГРЫ ---
async function loadGameModule(gameName) {
    document.body.classList.add('in-game');

    fullscreenMount.innerHTML = '<div class="waiting-text">Подключение...</div>';
    fullscreenOverlay.classList.remove('hidden');
    activeGameTitle.textContent = gameName.toUpperCase();

    let gameCssFile = 'android.css'; 
    if (currentPlatform === 'iphone') gameCssFile = 'iphone.css';
    if (currentPlatform === 'pc') gameCssFile = 'pc.css';
    
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
        
        // Ждем загрузки данных, чтобы не было ошибки
        const snap = await get(ref(db, `rooms/${currentRoomId}/players`));
        const playersData = snap.val();

        if (!playersData) throw new Error("Нет данных игроков!");

        gameModule.initGame(fullscreenMount, currentRoomId, myUserId, amIHost, playersData);
        activeGameCleanup = gameModule.cleanupGame;

    } catch (error) {
        console.error("Game Load Error:", error);
        fullscreenMount.innerHTML = `<div class="waiting-text error">Ошибка: ${error.message}</div>`;
        document.body.classList.remove('in-game');
    }
}

closeFullscreenBtn.addEventListener('click', () => {
    if (amIHost && currentRoomId) {
        if(confirm("Завершить игру для всех?")) {
            const updates = { status: 'waiting', selectedGame: null };
            update(ref(db, `rooms/${currentRoomId}`), updates);
            get(ref(db, `rooms/${currentRoomId}/players`)).then(snap => {
                 const p = snap.val();
                 if (p) {
                     Object.keys(p).forEach(k => {
                         update(ref(db, `rooms/${currentRoomId}/players/${k}`), { isReady: false });
                     });
                 }
            });
            closeFullscreenGame();
        }
    } else {
        if(confirm("Свернуть игру?")) closeFullscreenGame();
    }
});

function closeFullscreenGame() {
    document.body.classList.remove('in-game');

    fullscreenOverlay.classList.add('hidden');
    fullscreenMount.innerHTML = '';
    if (activeGameCleanup) {
        activeGameCleanup();
        activeGameCleanup = null;
    }
}

leaveGameBtn.addEventListener('click', () => {
    if (currentRoomId) {
        remove(ref(db, `rooms/${currentRoomId}/players/${myUserId}`)).then(() => {
            get(ref(db, `rooms/${currentRoomId}/players`)).then(s => {
                if (!s.exists()) remove(ref(db, `rooms/${currentRoomId}`));
            });
        });
    }
    handleLeave();
});

function handleLeave(forced = false) {
    if (typeof roomListener === 'function') roomListener();
    roomListener = null;
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