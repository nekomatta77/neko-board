import { db, ref, update, onValue, off, set } from '../../../js/firebase-config.js';

let gameRef = null;
let boardSubscription = null;
let currentUserId = null;
let isMyTurn = false;
let mySymbol = null; // 'X' или 'O'

// Основная функция запуска
export function initGame(container, roomId, userId, isHost) {
    currentUserId = userId;
    mySymbol = isHost ? 'X' : 'O'; // Хост всегда Крестики
    
    // 1. Рисуем разметку
    container.innerHTML = `
        <div id="tictac-game">
            <div class="status-bar" id="game-status">Ожидание хода...</div>
            <div class="grid">
                ${Array(9).fill('').map((_, i) => `<div class="cell" data-index="${i}"></div>`).join('')}
            </div>
            ${isHost ? '<button id="restart-btn" class="hidden">Играть снова</button>' : ''}
        </div>
    `;

    // 2. Ссылки на DOM
    const cells = container.querySelectorAll('.cell');
    const statusText = container.querySelector('#game-status');
    const restartBtn = container.querySelector('#restart-btn');

    // 3. Подписка на данные игры в Firebase
    gameRef = ref(db, `rooms/${roomId}/gameData`);
    
    // Если мы хост и игры еще нет - инициализируем поле
    if (isHost) {
        set(gameRef, {
            board: Array(9).fill(''),
            turn: 'X', // Первыми ходят крестики
            winner: null
        });
    }

    // Слушаем изменения поля
    boardSubscription = onValue(gameRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        // Обновляем клетки
        data.board.forEach((val, i) => {
            cells[i].textContent = val;
            cells[i].className = `cell ${val}`; // Добавляем класс X или O для стилей
        });

        // Проверяем победителя
        if (data.winner) {
            isMyTurn = false;
            if (data.winner === 'draw') {
                statusText.textContent = "Ничья! 🤝";
            } else {
                statusText.textContent = data.winner === mySymbol ? "Ты победил! 🎉" : "Ты проиграл 💀";
                statusText.className = data.winner === mySymbol ? "status-bar win" : "status-bar lose";
            }
            if (restartBtn) restartBtn.classList.remove('hidden');
        } else {
            // Чей ход?
            isMyTurn = data.turn === mySymbol;
            statusText.textContent = isMyTurn ? `Твой ход (${mySymbol})` : `Ход противника...`;
            statusText.className = "status-bar";
            if (restartBtn) restartBtn.classList.add('hidden');
        }
    });

    // 4. Логика клика по клетке
    cells.forEach(cell => {
        cell.addEventListener('click', () => {
            if (!isMyTurn) return; // Не твой ход
            const index = cell.dataset.index;
            
            // Проверка: клетка пуста?
            if (cell.textContent === '') {
                makeMove(roomId, index, mySymbol);
            }
        });
    });

    // 5. Рестарт
    if (restartBtn) {
        restartBtn.addEventListener('click', () => {
            set(gameRef, {
                board: Array(9).fill(''),
                turn: 'X',
                winner: null
            });
        });
    }
}

// Функция отправки хода
function makeMove(roomId, index, symbol) {
    // Считываем текущее состояние, чтобы проверить победу
    // (В реальном проекте лучше Cloud Functions, но для нас сойдет и так)
    // Мы просто шлем обновление в базу
    
    // ВАЖНО: Мы не можем просто обновить одну ячейку и поменять ход одной командой атомарно без транзакции,
    // но для простоты сначала получим текущие данные.
    // Упрощение: мы обновляем массив локально и шлем целиком.
    
    // ! Внимание: здесь упрощенная логика для учебного проекта.
    // Мы предполагаем, что данные у нас актуальны из onValue.
    
    const cells = document.querySelectorAll('.cell');
    const currentBoard = Array.from(cells).map(c => c.textContent);
    currentBoard[index] = symbol;

    const winner = checkWinner(currentBoard);
    const isDraw = !winner && currentBoard.every(c => c !== '');
    const nextTurn = symbol === 'X' ? 'O' : 'X';

    const updates = {
        board: currentBoard,
        turn: nextTurn,
        winner: winner ? winner : (isDraw ? 'draw' : null)
    };

    update(ref(db, `rooms/${roomId}/gameData`), updates);
}

function checkWinner(board) {
    const lines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // Горизонтали
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // Вертикали
        [0, 4, 8], [2, 4, 6]             // Диагонали
    ];
    for (let line of lines) {
        const [a, b, c] = line;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return board[a];
        }
    }
    return null;
}

// Очистка при выходе
export function cleanupGame() {
    if (gameRef) off(gameRef);
}
