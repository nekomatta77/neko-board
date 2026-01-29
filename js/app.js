import { db, ref, set, push, onValue, update, remove, child, get } from './firebase-config.js';

// DOM Элементы
const authScreen = document.getElementById('auth-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');

const usernameInput = document.getElementById('username-input');
const loginBtn = document.getElementById('login-btn');
const userDisplay = document.getElementById('user-display');

const createGameBtn = document.getElementById('create-game-btn');
const playersCountSelect = document.getElementById('players-count-select'); // Select
const roomsList = document.getElementById('rooms-list');

const leaveGameBtn = document.getElementById('leave-game-btn');
const roomIdDisplay = document.getElementById('room-id-display');
const playersContainer = document.getElementById('players-container'); // Контейнер игроков

const currentAvatarImg = document.getElementById('current-avatar-img');
const nextAvatarBtn = document.getElementById('next-avatar-btn');

// Состояние
let currentUser = null;
let currentAvatarId = 1;
// Генерируем уникальный ID для текущей сессии, чтобы различать игроков с одинаковыми именами
let myUserId = 'user_' + Math.random().toString(36).substr(2, 9);
let currentRoomId = null;

// --- ЛОГИКА АВАТАРА ---
nextAvatarBtn.addEventListener('click', nextAvatar);

function nextAvatar() {
    currentAvatarId++;
    if (currentAvatarId > 20) currentAvatarId = 1;
    currentAvatarImg.src = `assets/avatars/ava${currentAvatarId}.png`;
    
    nextAvatarBtn.style.transform = "scale(0.9)";
    setTimeout(() => nextAvatarBtn.style.transform = "scale(1)", 150);
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
        alert('Пожалуйста, введите ник!');
    }
});

// --- СОЗДАНИЕ КОМНАТЫ ---
createGameBtn.addEventListener('click', () => {
    const maxPlayers = parseInt(playersCountSelect.value);
    const roomsRef = ref(db, 'rooms');
    const newRoomRef = push(roomsRef);
    
    // Создаем объект игроков. Ключ - уникальный ID, значение - данные
    const initialPlayers = {};
    initialPlayers[myUserId] = {
        name: currentUser,
        avatar: currentAvatarId,
        isHost: true
    };

    const roomData = {
        hostName: currentUser, // Для отображения в списке комнат
        maxPlayers: maxPlayers,
        players: initialPlayers,
        status: "waiting", // waiting | playing
        createdAt: Date.now()
    };

    set(newRoomRef, roomData).then(() => {
        currentRoomId = newRoomRef.key;
        enterGameScreen(currentRoomId);
    });
});

// --- СПИСОК КОМНАТ (LOBBY) ---
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
            
            // Считаем текущее количество игроков
            const playersCount = room.players ? Object.keys(room.players).length : 0;

            if (room.status === "waiting") {
                const roomEl = document.createElement('div');
                roomEl.className = 'room-card';
                
                // Находим аватар хоста
                let hostAvatar = 1;
                if (room.players) {
                    const hostPlayer = Object.values(room.players).find(p => p.isHost);
                    if (hostPlayer) hostAvatar = hostPlayer.avatar;
                }

                // Кнопка активна только если есть место
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

// --- ВХОД В КОМНАТУ ---
function joinRoom(roomId, maxPlayers) {
    // Сначала проверяем, есть ли место (через транзакцию или просто get)
    const roomPlayersRef = ref(db, `rooms/${roomId}/players`);
    
    get(roomPlayersRef).then((snapshot) => {
        const players = snapshot.val() || {};
        if (Object.keys(players).length >= maxPlayers) {
            alert("Комната уже заполнена!");
            return;
        }

        // Добавляем себя в список игроков
        const myPlayerData = {
            name: currentUser,
            avatar: currentAvatarId,
            isHost: false
        };

        // Записываем по своему ID
        update(ref(db, `rooms/${roomId}/players/${myUserId}`), myPlayerData)
            .then(() => {
                currentRoomId = roomId;
                enterGameScreen(roomId);
            })
            .catch(err => alert("Ошибка входа: " + err.message));
    });
}

// --- ЭКРАН ИГРЫ И ОТОБРАЖЕНИЕ ИГРОКОВ ---
function enterGameScreen(roomId) {
    showScreen(gameScreen);
    roomIdDisplay.textContent = `Комната`;
    
    // Подписываемся на изменения в этой комнате
    subscribeToRoom(roomId);
}

function subscribeToRoom(roomId) {
    const roomRef = ref(db, `rooms/${roomId}`);
    
    onValue(roomRef, (snapshot) => {
        const room = snapshot.val();
        if (!room) {
            // Комната удалена
            alert("Комната была закрыта хостом");
            currentRoomId = null;
            showScreen(lobbyScreen);
            return;
        }

        // Рендерим игроков
        renderPlayersList(room.players);

        // Проверка: Если игроков столько же сколько maxPlayers -> игра начинается (визуально)
        const count = Object.keys(room.players).length;
        const statusText = document.querySelector('.waiting-text');
        
        if (statusText) {
            if (count >= room.maxPlayers) {
                statusText.textContent = "Все игроки на месте! Игра начинается...";
                statusText.style.color = "#4CAF50";
            } else {
                statusText.textContent = `Ожидание... (${count}/${room.maxPlayers})`;
                statusText.style.color = "#888";
            }
        }
    });
}

// Функция отрисовки кружков с игроками
function renderPlayersList(playersObj) {
    playersContainer.innerHTML = ''; // Чистим
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
        // Удаляем себя из списка игроков
        remove(ref(db, `rooms/${currentRoomId}/players/${myUserId}`))
            .then(() => {
                // Если мы были хостом, можно удалить комнату целиком или передать права
                // Пока просто выходим. Если игроков 0 - Firebase сам оставит пустую запись, 
                // но в реальном проекте лучше чистить пустые комнаты.
            });
        currentRoomId = null;
    }
    showScreen(lobbyScreen);
});

function showScreen(screen) {
    authScreen.classList.add('hidden');
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.add('hidden');
    screen.classList.remove('hidden');
}
