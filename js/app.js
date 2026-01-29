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

// Состояние
let currentUser = null;
let currentRoomId = null;

// --- АВТОРИЗАЦИЯ ---
loginBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    if (username) {
        currentUser = username;
        userDisplay.textContent = `Игрок: ${currentUser}`;
        showScreen(lobbyScreen);
        loadRooms(); // Запускаем прослушку списка комнат
    } else {
        alert('Пожалуйста, введите ник!');
    }
});

// --- ЛОГИКА ЛОББИ ---

// 1. Создание комнаты
createGameBtn.addEventListener('click', () => {
    const roomsRef = ref(db, 'rooms');
    const newRoomRef = push(roomsRef); // Генерирует уникальный ключ
    
    const roomData = {
        host: currentUser,
        player2: "",
        status: "waiting", // waiting, playing
        board: [0,0,0,0,0,0,0,0,0], // Для крестиков-ноликов (пусто)
        turn: currentUser // Кто ходит первым
    };

    set(newRoomRef, roomData).then(() => {
        currentRoomId = newRoomRef.key;
        enterGameScreen(currentRoomId, "waiting");
    });
});

// 2. Отображение списка комнат (слушаем Firebase)
function loadRooms() {
    const roomsRef = ref(db, 'rooms');
    
    onValue(roomsRef, (snapshot) => {
        roomsList.innerHTML = ''; // Очищаем список перед обновлением
        const data = snapshot.val();

        if (!data) {
            roomsList.innerHTML = '<div class="empty-state">Нет активных комнат</div>';
            return;
        }

        // Пробегаем по всем комнатам
        Object.keys(data).forEach(key => {
            const room = data[key];
            
            // Показываем только комнаты, где ждут игрока
            if (room.status === "waiting") {
                const roomEl = document.createElement('div');
                roomEl.className = 'room-card';
                roomEl.innerHTML = `
                    <span>🎮 Комната игрока <b>${room.host}</b></span>
                    <button class="join-btn">Войти</button>
                `;
                
                // Обработка клика "Войти"
                roomEl.querySelector('.join-btn').addEventListener('click', () => {
                    joinRoom(key);
                });

                roomsList.appendChild(roomEl);
            }
        });
    });
}

// 3. Присоединение к комнате
function joinRoom(roomId) {
    const roomRef = ref(db, `rooms/${roomId}`);
    
    // Обновляем данные комнаты: добавляем второго игрока и меняем статус
    update(roomRef, {
        player2: currentUser,
        status: "playing"
    }).then(() => {
        currentRoomId = roomId;
        enterGameScreen(roomId, "playing");
    }).catch(error => {
        alert("Не удалось войти: " + error.message);
    });
}

// --- ЭКРАН ИГРЫ ---

function enterGameScreen(roomId, status) {
    showScreen(gameScreen);
    roomIdDisplay.textContent = (status === 'waiting') ? "Ожидание игрока..." : "Игра началась!";
    
    // Здесь мы позже добавим слушатель изменений в самой игре
}

leaveGameBtn.addEventListener('click', () => {
    // Если вышел хост - удаляем комнату, если гость - просто выходим (пока упрощенно)
    if (currentRoomId) {
        // Простая логика: удаляем комнату при выходе
        // В будущем улучшим (сдаться и т.д.)
        remove(ref(db, `rooms/${currentRoomId}`));
        currentRoomId = null;
    }
    showScreen(lobbyScreen);
});


// Утилита переключения экранов
function showScreen(screen) {
    authScreen.classList.add('hidden');
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.add('hidden');
    screen.classList.remove('hidden');
}
