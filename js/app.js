import { db } from './firebase-config.js';

// DOM Элементы
const authScreen = document.getElementById('auth-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');

const usernameInput = document.getElementById('username-input');
const loginBtn = document.getElementById('login-btn');
const userDisplay = document.getElementById('user-display');

// Состояние игрока
let currentUser = null;

// Логика входа
loginBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    
    if (username) {
        currentUser = username;
        userDisplay.textContent = `Игрок: ${currentUser}`;
        showScreen(lobbyScreen);
        console.log(`Вход выполнен: ${currentUser}`);
    } else {
        alert('Пожалуйста, введите ник!');
    }
});

// Функция переключения экранов
function showScreen(screen) {
    // Скрываем все экраны
    authScreen.classList.add('hidden');
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.add('hidden');
    
    // Показываем нужный
    screen.classList.remove('hidden');
}

console.log("App loaded. Firebase DB instance:", db);
