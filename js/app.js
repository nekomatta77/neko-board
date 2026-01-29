import { db, ref, set, push, onValue, update, remove, child, get } from './firebase-config.js';

// DOM Элементы
const authScreen = document.getElementById('auth-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');

const usernameInput = document.getElementById('username-input');
const loginBtn = document.getElementById('login-btn');
const userDisplay = document.getElementById('user-display');
const createGameBtn = document.getElementById('create-game-btn');
const roomsList = document.getElementById('rooms-list');
const leaveGameBtn = document.getElementById('leave-game-btn');
const roomIdDisplay = document.getElementById('room-id-display');

// Аватар
const currentAvatarImg = document.getElementById('current-avatar-img');
const nextAvatarBtn = document.getElementById('next-avatar-btn');

// Состояние
let currentUser = null;
let currentAvatarId = 1; 
let currentRoomId = null;

// --- ЛОГИКА АВАТАРА ---
nextAvatarBtn.addEventListener('click', nextAvatar);

function nextAvatar() {
    currentAvatarId++;
    if (currentAvatarId > 20) {
        currentAvatarId = 1;
    }
    currentAvatarImg.src = `assets/avatars/ava${currentAvatarId}.png`;
    
    nextAvatarBtn.style.transform = "scale(0.9)";
    setTimeout(() => {
        nextAvatarBtn.style.transform = "scale(1)";
    }, 150);
}

// --- АВТОРИЗАЦИЯ И ПРОФИЛЬ ---
loginBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    if (username) {
        currentUser = username;
        
        // Вставляем красивый профиль в лобби
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

// --- ЛОББИ ---
createGameBtn.addEventListener('click', () => {
    const roomsRef = ref(db, 'rooms');
    const newRoomRef = push(roomsRef);
    
    const roomData = {
        host: currentUser,
        hostAvatar: currentAvatarId, 
        player2: "",
        player2Avatar: null,
        status: "waiting", 
        board: [0,0,0,0,0,0,0,0,0], 
        turn: currentUser 
    };

    set(newRoomRef, roomData).then(() => {
        currentRoomId = newRoomRef.key;
        enterGameScreen(currentRoomId, "waiting");
    });
});

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
            if (room.status === "waiting") {
                const roomEl = document.createElement('div');
                roomEl.className = 'room-card';
                const hostAva = room.hostAvatar || 1; 
                roomEl.innerHTML = `
                    <div class="room-info">
                        <img src="assets/avatars/ava${hostAva}.png" class="room-avatar">
                        <div class="room-text">
                            <span><b>${room.host}</b></span>
                            <small>ждет игрока</small>
                        </div>
                    </div>
                    <button class="join-btn">Войти</button>
                `;
                roomEl.querySelector('.join-btn').addEventListener('click', () => {
                    joinRoom(key);
                });
                roomsList.appendChild(roomEl);
            }
        });
    });
}

function joinRoom(roomId) {
    const roomRef = ref(db, `rooms/${roomId}`);
    update(roomRef, {
        player2: currentUser,
        player2Avatar: currentAvatarId,
        status: "playing"
    }).then(() => {
        currentRoomId = roomId;
        enterGameScreen(roomId, "playing");
    }).catch(error => {
        alert("Не удалось войти: " + error.message);
    });
}

function enterGameScreen(roomId, status) {
    showScreen(gameScreen);
    roomIdDisplay.textContent = (status === 'waiting') ? "Ожидание игрока..." : "Игра началась!";
}

leaveGameBtn.addEventListener('click', () => {
    if (currentRoomId) {
        remove(ref(db, `rooms/${currentRoomId}`));
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
