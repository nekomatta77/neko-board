import { db, ref, set, push, onValue, update, remove, child, get } from './firebase-config.js';
// Импортируем логику чата
import { startChat, stopChat } from './chat.js';

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

// Аватар
const currentAvatarImg = document.getElementById('current-avatar-img');
const nextAvatarBtn = document.getElementById('next-avatar-btn');
const prevAvatarBtn = document.getElementById('prev-avatar-btn');

// Уведомления
const notificationContainer = document.getElementById('notification-container');

// --- СОСТОЯНИЕ ---
let currentUser = null;
let currentAvatarId = 1;
let myUserId = 'user_' + Math.random().toString(36).substr(2, 9);
let currentRoomId = null;
let amIHost = false;

let activeGameCleanup = null; // Функция очистки текущей игры

// --- УВЕДОМЛЕНИЯ ---
function showNotification(message, type = 'info') {
    const notif = document.createElement('div');
    notif.className = `notification ${type}`;
    notif.textContent = message;
    
    notificationContainer.appendChild(notif);

    requestAnimationFrame(() => {
        notif.classList.add('show');
    });

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
    
    // Запуск чата
    startChat(roomId, currentUser, currentAvatarId);
}

function subscribeToRoom(roomId) {
    const roomRef = ref(db, `rooms/${roomId}`);
    
    onValue(roomRef, (snapshot) => {
        const room = snapshot.val();
        
        // 1. Если комната удалена
        if (!room) {
            if (currentRoomId === roomId) {
                showNotification("Комната была закрыта хостом", "info");
                handleLeave();
            }
            return;
        }

        // 2. Обновляем статус хоста (на случай сбоев)
        if (room.players && room.players[myUserId]) {
            amIHost = room.players[myUserId].isHost;
        }

        // 3. Рисуем игроков
        renderPlayersList(room.players);

        // 4. ПРОВЕРКА СТАТУСА: ИГРА ИДЕТ?
        if (room.status && room.status.startsWith('playing_')) {
            const gameName = room.status.split('_')[1]; // Получаем 'tictac'
            loadGameModule(gameName);
            return; // Выходим, чтобы не рисовать меню ожидания
        }

        // 5. Если игра НЕ идет, показываем лобби/меню
        const count = Object.keys(room.players).length;
        const boardArea = document.getElementById('game-board');
        
        // Если поле занято игрой, но статус сменился на waiting (рестарт всей комнаты)
        if (boardArea.getAttribute('data-game')) {
            handleLeaveGameOnly(); // Чистим игру, возвращаем меню
        }

        if (count >= room.maxPlayers) {
            // Комната полная
            if (amIHost) {
                // Хост видит кнопки выбора
                if (!document.getElementById('game-selector')) {
                    renderGameMenu(boardArea);
                }
            } else {
                // Гость ждет
                boardArea.innerHTML = '<div class="waiting-text" style="color:#888">Ждем выбора игры хостом...</div>';
            }
        } else {
            // Ожидание игроков
            boardArea.innerHTML = `<div class="waiting-text">Ожидание... (${count}/${room.maxPlayers})</div>`;
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

// --- МЕНЮ ВЫБОРА ИГР (Только для хоста) ---
function renderGameMenu(container) {
    container.innerHTML = `
        <div id="game-selector" class="game-selector">
            <h3>Выберите игру:</h3>
            <div class="games-list">
                <button class="game-option-btn" onclick="startGameTrigger('tictac')">
                    ❌⭕ Крестики-Нолики
                </button>
                <button class="game-option-btn" style="opacity:0.5; cursor:not-allowed">
                    🃏 Дурак (Скоро)
                </button>
            </div>
        </div>
    `;
}

// Глобальная функция для вызова из HTML (onclick)
window.startGameTrigger = function(gameName) {
    if (!currentRoomId || !amIHost) return;
    
    // Меняем статус в БД -> у всех запустится loadGameModule
    update(ref(db, `rooms/${currentRoomId}`), {
        status: `playing_${gameName}`
    });
}

// --- ДИНАМИЧЕСКАЯ ЗАГРУЗКА ИГРЫ ---
async function loadGameModule(gameName) {
    const boardArea = document.getElementById('game-board');
    
    // Если эта игра уже загружена, ничего не делаем
    if (boardArea.getAttribute('data-game') === gameName) return;
    
    // Очищаем поле
    boardArea.innerHTML = '<div class="waiting-text">Загрузка игры...</div>';
    boardArea.setAttribute('data-game', gameName);

    // 1. Определяем платформу
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const cssFile = isIos ? 'iphone.css' : 'android.css';
    
    // 2. Подключаем CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `games/${gameName}/${cssFile}`;
    link.id = 'game-css';
    document.head.appendChild(link);

    // 3. Импортируем JS модуля
    try {
        const gameModule = await import(`../games/${gameName}/${gameName}.js`);
        
        // Очищаем предыдущую логику если была
        if (activeGameCleanup) activeGameCleanup();
        
        // Запускаем игру
        gameModule.initGame(boardArea, currentRoomId, myUserId, amIHost);
        activeGameCleanup = gameModule.cleanupGame; // Сохраняем функцию очистки

    } catch (error) {
        console.error("Ошибка загрузки:", error);
        boardArea.innerHTML = '<div class="waiting-text error">Ошибка загрузки файла игры</div>';
        showNotification("Не удалось загрузить игру", "error");
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

// Полный выход в лобби
function handleLeave() {
    currentRoomId = null;
    stopChat(); // Останавливаем чат
    handleLeaveGameOnly(); // Чистим игру
    showScreen(lobbyScreen);
}

// Очистка только игрового поля (без выхода из комнаты)
function handleLeaveGameOnly() {
    // Удаляем CSS игры
    const gameCss = document.getElementById('game-css');
    if (gameCss) gameCss.remove();
    
    // Вызываем cleanup самой игры
    if (activeGameCleanup) {
        activeGameCleanup();
        activeGameCleanup = null;
    }
    
    const board = document.getElementById('game-board');
    board.removeAttribute('data-game');
    board.innerHTML = '';
}

function showScreen(screen) {
    authScreen.classList.add('hidden');
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.add('hidden');
    screen.classList.remove('hidden');
}
