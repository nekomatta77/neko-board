import { db, ref, set, push, onValue, update, remove, child, get } from './firebase-config.js';
import { startChat, stopChat } from './chat.js';

// --- НАСТРОЙКИ ---
const INACTIVITY_LIMIT = 30 * 60 * 1000;

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
        showNotification('Введите имя', 'error');
    }
});

function updateProfileDisplay() {
    userDisplay.innerHTML = `
        <div class="profile-info">
            <img src="assets/avatars/ava${currentAvatarId}.png" class="profile-avatar">
            <div class="profile-text">
                <span class="profile-name">${currentUser}</span>
                <span class="profile-status">В сети</span>
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
        showNotification('Комната создана');
    });
});

// --- ROOM LIST ---
function loadRooms() {
    const roomsRef = ref(db, 'rooms');
    onValue(roomsRef, (snapshot) => {
        roomsList.innerHTML = '';
        const data = snapshot.val();
        if (!data) {
            roomsList.innerHTML = '<div style="text-align:center; padding:30px; color:#555;">Нет активных игр</div>';
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
            showNotification("Комната полная", "error");
            return;
        }

        const myPlayerData = { name: currentUser, avatar: currentAvatarId, isHost: false, isReady: false };
        update(ref(db, `rooms/${roomId}/players/${myUserId}`), myPlayerData)
            .then(() => {
                currentRoomId = roomId;
                amIHost = false;
                enterGameScreen(roomId);
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
            if (currentRoomId === roomId) { 
                showNotification("Хост закрыл комнату", "info"); 
                handleLeave(true); 
            }
            return;
        }

        if (room.players && !room.players[myUserId]) {
             showNotification("Вас исключили", "error"); 
             handleLeave(true); 
             return;
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

        const readyStatus = player.isReady ? '<span style="color:var(--success)">●</span>' : '<span style="color:#555">●</span>';

        el.innerHTML = `
            ${kickButtonHtml}
            <div class="avatar-wrapper">
                <img src="assets/avatars/ava${player.avatar}.png">
            </div>
            <div class="player-details">
                <div class="player-name">${player.name}</div>
                <div>${readyStatus}</div>
            </div>
            ${player.isHost ? '<span style="position:absolute; bottom:-5px; font-size:12px;">👑</span>' : ''}
        `;
        playersContainer.appendChild(el);
    });
}

function renderGameControls(room) {
    const selectionArea = document.getElementById('game-selection-area');
    const players = room.players || {};
    
    if (!players[myUserId]) return;

    const allReady = Object.values(players).length > 1 && Object.values(players).every(p => p.isReady);

    if (amIHost) {
        let gameCards = `
            <div class="games-grid-menu host-view">
                <button class="game-card-btn ${room.selectedGame === 'tictac' ? 'selected' : ''}" onclick="selectGame('tictac')">
                   <span>⭕❌</span> Крестики
                </button>
                <button class="game-card-btn ${room.selectedGame === 'brawl' ? 'selected' : ''}" onclick="selectGame('brawl')">
                   <span>🥊</span> Бравл
                </button>
            </div>
        `;
        
        let startBtnState = (room.selectedGame && allReady) ? '' : 'disabled';
        let startBtnText = !room.selectedGame ? "Выберите игру" : (!allReady ? "Ждем игроков..." : "НАЧАТЬ");
        
        const myReady = players[myUserId]?.isReady;
        const readyBtnHtml = `
            <button onclick="toggleReady()" class="ready-btn ${myReady ? 'is-ready' : ''}">
                ${myReady ? 'ОТМЕНА' : 'Я ГОТОВ'}
            </button>
        `;

        selectionArea.innerHTML = `
            ${readyBtnHtml}
            ${gameCards}
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
        const myReady = players[myUserId]?.isReady;
        let statusText = "Ожидание хоста...";
        if (room.selectedGame === 'tictac') statusText = "Игра: Крестики";
        if (room.selectedGame === 'brawl') statusText = "Игра: Бравл";

        selectionArea.innerHTML = `
            <div class="client-view" style="text-align:center;">
                <h3 style="margin-bottom:20px; color:#aaa; font-weight:400;">${statusText}</h3>
                <button onclick="toggleReady()" class="ready-btn ${myReady ? 'is-ready' : ''}">
                    ${myReady ? 'ОТМЕНА' : 'ГОТОВ!'}
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

    fullscreenMount.innerHTML = '<div style="color:white; text-align:center; padding-top:40vh; opacity:0.7;">Загрузка...</div>';
    fullscreenOverlay.classList.remove('hidden');
    // activeGameTitle - удалено
    
    try {
        const gameModule = await import(`../games/${gameName}/${gameName}.js`);
        if (activeGameCleanup) activeGameCleanup();
        
        const snap = await get(ref(db, `rooms/${currentRoomId}/players`));
        const playersData = snap.val();

        if (!playersData) throw new Error("Нет данных игроков!");

        gameModule.initGame(fullscreenMount, currentRoomId, myUserId, amIHost, playersData);
        activeGameCleanup = gameModule.cleanupGame;

    } catch (error) {
        console.error("Game Load Error:", error);
        fullscreenMount.innerHTML = `<div class="notification error" style="margin-top:100px;">Ошибка: ${error.message}</div>`;
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
    if (!currentRoomId) return;

    if (amIHost) {
        if(confirm("Вы хост. Комната будет удалена. Выйти?")) {
            remove(ref(db, `rooms/${currentRoomId}`))
                .then(() => {
                    handleLeave(false);
                    showNotification("Комната удалена");
                })
                .catch(err => console.error(err));
        }
    } else {
        remove(ref(db, `rooms/${currentRoomId}/players/${myUserId}`))
            .then(() => {
                handleLeave(false);
            })
            .catch(err => console.error(err));
    }
});

function handleLeave(forced = false) {
    if (typeof roomListener === 'function') {
        roomListener(); 
    }
    roomListener = null;
    currentRoomId = null;
    amIHost = false;
    stopChat();
    closeFullscreenGame();
    showScreen(lobbyScreen);
    if (!forced) loadRooms();
}

function showScreen(screen) {
    authScreen.classList.add('hidden');
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.add('hidden');
    screen.classList.remove('hidden');
}