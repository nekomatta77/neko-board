import { db, ref, update, onValue, off, set, get } from '../../js/firebase-config.js';
import { getConfig, SYMBOLS } from './rules.js';

let gameRef = null;
let currentUserId = null;
let myIndex = 0; // Наш номер в очереди (0..5)
let mySymbol = null; 
let localBoard = [];
let isGameActive = true;
let playersData = {};
let config = {}; // Текущие настройки (размер, длина)

let lastBoardStr = ""; 
let isFirstLoad = true; 

const notifySound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');

export function initGame(container, roomId, userId, isHost) {
    currentUserId = userId;
    isGameActive = true;
    isFirstLoad = true;
    lastBoardStr = "";

    // 1. Получаем игроков, чтобы понять настройки
    get(ref(db, `rooms/${roomId}/players`)).then((playerSnap) => {
        playersData = playerSnap.val() || {};
        const playerIds = Object.keys(playersData);
        const playerCount = playerIds.length;
        
        // Определяем настройки игры
        config = getConfig(playerCount);
        localBoard = Array(config.size * config.size).fill('');

        // Определяем мой символ
        // Сортируем ID, чтобы порядок у всех был одинаковый
        const sortedIds = playerIds.sort(); 
        myIndex = sortedIds.indexOf(userId);
        mySymbol = SYMBOLS[myIndex];

        // 2. Рисуем интерфейс
        renderBoard(container, isHost);

        // 3. Инициализация БД (только Хост)
        gameRef = ref(db, `rooms/${roomId}/gameData`);
        if (isHost) {
            get(gameRef).then((snap) => {
                // Если игры нет или размер доски не совпадает (сменилось кол-во игроков)
                const data = snap.val();
                if (!snap.exists() || (data.board && data.board.length !== localBoard.length)) {
                    resetGameData(sortedIds[0]); // Первым ходит игрок с индексом 0
                }
            });
        }

        // 4. Подписка
        subscribeToGame(container, roomId);
    });
}

function renderBoard(container, isHost) {
    container.innerHTML = `
        <div id="tictac-game">
            <div class="header-row">
                <div class="status-bar" id="game-status">Загрузка...</div>
                <button id="rules-btn" class="icon-btn">?</button>
            </div>

            <div id="rules-modal" class="hidden">
                <div class="rules-content">
                    <h4>Правила (${Object.keys(playersData).length} игр.)</h4>
                    <p>${config.desc}</p>
                    <button id="close-rules">Понятно</button>
                </div>
            </div>
            
            <div class="game-container">
                <div class="grid" style="grid-template-columns: repeat(${config.size}, 1fr); grid-template-rows: repeat(${config.size}, 1fr);">
                    ${Array(config.size * config.size).fill('').map((_, i) => `<div class="cell" data-index="${i}"></div>`).join('')}
                </div>
                <svg class="win-overlay" viewBox="0 0 300 300">
                    <line id="win-line" x1="0" y1="0" x2="0" y2="0" stroke-linecap="round" />
                </svg>
            </div>
            
            ${isHost ? '<button id="restart-btn" class="hidden">ИГРАТЬ СНОВА</button>' : ''}
        </div>
    `;

    // Логика кнопки правил
    container.querySelector('#rules-btn').onclick = () => {
        container.querySelector('#rules-modal').classList.remove('hidden');
    };
    container.querySelector('#close-rules').onclick = () => {
        container.querySelector('#rules-modal').classList.add('hidden');
    };

    if (isHost) {
        container.querySelector('#restart-btn').onclick = () => {
             // Первым ходит тот, кто первый в списке ID (обычно Хост, но для стабильности берем sorted)
             const sortedIds = Object.keys(playersData).sort();
             resetGameData(SYMBOLS[0]);
        };
    }
}

function resetGameData(firstTurnSymbol) {
    set(gameRef, {
        board: Array(config.size * config.size).fill(''),
        turn: SYMBOLS[0], // Всегда начинает "X" (первый игрок)
        winner: null
    });
}

function subscribeToGame(container, roomId) {
    const cells = container.querySelectorAll('.cell');
    const statusText = container.querySelector('#game-status');
    const restartBtn = container.querySelector('#restart-btn');
    const winLine = container.querySelector('#win-line');

    onValue(gameRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        localBoard = data.board;
        const currentBoardStr = JSON.stringify(localBoard);
        const isMyTurn = data.turn === mySymbol;

        // Звук
        if (currentBoardStr !== lastBoardStr && !isFirstLoad) {
            if (isMyTurn && !data.winner) playSound();
        }
        lastBoardStr = currentBoardStr;
        isFirstLoad = false;

        // Рендер клеток
        cells.forEach((cell, i) => {
            cell.textContent = localBoard[i];
            cell.className = 'cell'; // сброс
            if (localBoard[i] !== '') {
                // Добавляем класс символа (X, O, triangle, etc.)
                // Для CSS используем не сам символ, а его имя или индекс, но у нас символы простые.
                // Заменяем спецсимволы на английские названия для CSS классов
                let cssClass = getSymbolClass(localBoard[i]);
                cell.classList.add(cssClass);
            }
        });

        // Статус игры
        if (data.winner) {
            isGameActive = false;
            if (data.winner === 'draw') {
                statusText.textContent = "Ничья";
                statusText.className = "status-bar";
                winLine.style.display = 'none';
            } else {
                // Ищем линию локально
                const winInfo = checkDynamicWinner(localBoard, config.size, config.winLength);
                
                if (winInfo) {
                    drawDynamicWinLine(winInfo.line, winLine, config.size);
                    winLine.style.display = 'block';
                } else {
                    winLine.style.display = 'none';
                }

                if (data.winner === mySymbol) {
                    statusText.textContent = "Ты победил! 🎉";
                    statusText.className = "status-bar win";
                    playSound();
                } else {
                    statusText.textContent = "Ты проиграл";
                    statusText.className = "status-bar lose";
                }
            }
            if (restartBtn) {
                restartBtn.classList.remove('hidden');
                restartBtn.style.display = 'block';
            }
        } else {
            isGameActive = true;
            winLine.style.display = 'none';
            if (restartBtn) {
                restartBtn.classList.add('hidden');
                restartBtn.style.display = 'none';
            }

            if (isMyTurn) {
                statusText.innerHTML = `Твой ход <span style="font-size:1.2em">(${mySymbol})</span>`;
                statusText.className = "status-bar win";
            } else {
                // Показываем, чей ход (ищем игрока по символу)
                const turnSymbol = data.turn;
                // Находим индекс символа
                const turnIndex = SYMBOLS.indexOf(turnSymbol);
                // Находим ID игрока
                const sortedIds = Object.keys(playersData).sort();
                const playerId = sortedIds[turnIndex];
                const player = playersData[playerId];

                if (player) {
                    statusText.innerHTML = `
                        <div class="turn-info">
                            <span style="opacity:0.7; margin-right:5px">Ход:</span>
                            <img src="assets/avatars/ava${player.avatar}.png" class="status-avatar">
                            <span>${player.name} (${turnSymbol})</span>
                        </div>
                    `;
                } else {
                    statusText.textContent = `Ход игрока ${turnSymbol}`;
                }
                statusText.className = "status-bar";
            }
        }
    });

    // Клики
    cells.forEach(cell => {
        cell.addEventListener('click', () => {
            const index = parseInt(cell.dataset.index);
            
            // Быстрая локальная проверка
            if (!isGameActive || localBoard[index] !== '') return;
            
            // Проверка через базу
            get(gameRef).then(snap => {
                const sData = snap.val();
                if(sData.turn !== mySymbol) return; 
                
                makeMove(index, mySymbol, sData.board);
            });
        });
    });
}

// Помощник для CSS классов
function getSymbolClass(symbol) {
    if (symbol === 'X') return 'symbol-x';
    if (symbol === 'O') return 'symbol-o';
    if (symbol === '∆') return 'symbol-tri';
    if (symbol === '□') return 'symbol-sq';
    if (symbol === '☆') return 'symbol-star';
    if (symbol === '◇') return 'symbol-dia';
    return '';
}

function playSound() {
    notifySound.currentTime = 0;
    notifySound.volume = 0.5; 
    notifySound.play().catch(e => {});
}

function makeMove(index, symbol, currentBoard) {
    const newBoard = [...currentBoard];
    newBoard[index] = symbol;

    const winInfo = checkDynamicWinner(newBoard, config.size, config.winLength);
    const winner = winInfo ? winInfo.winner : null;
    const isDraw = !winner && !newBoard.includes('');

    // Вычисляем следующий ход
    // Берем текущий индекс, +1, берем по модулю количества игроков
    const sortedIds = Object.keys(playersData).sort();
    const currentTurnIndex = SYMBOLS.indexOf(symbol);
    const nextTurnIndex = (currentTurnIndex + 1) % sortedIds.length;
    const nextTurnSymbol = SYMBOLS[nextTurnIndex];

    update(gameRef, {
        board: newBoard,
        turn: nextTurnSymbol,
        winner: winner ? winner : (isDraw ? 'draw' : null)
    });
}

// --- УНИВЕРСАЛЬНЫЙ АЛГОРИТМ ПОБЕДЫ ---
// Работает для любого размера поля и любой длины линии
function checkDynamicWinner(board, size, winLen) {
    const getCell = (x, y) => {
        if (x < 0 || x >= size || y < 0 || y >= size) return null;
        return board[y * size + x];
    };

    // Направления: вправо, вниз, диаг-вниз-право, диаг-вниз-лево
    const directions = [[1,0], [0,1], [1,1], [1,-1]];

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const current = getCell(x, y);
            if (!current) continue;

            for (let [dx, dy] of directions) {
                let count = 1;
                let line = [y * size + x];

                // Смотрим вперед по направлению
                for (let step = 1; step < winLen; step++) {
                    if (getCell(x + dx * step, y + dy * step) === current) {
                        count++;
                        line.push((y + dy * step) * size + (x + dx * step));
                    } else {
                        break;
                    }
                }

                if (count === winLen) {
                    return { winner: current, line: line };
                }
            }
        }
    }
    return null;
}

// Отрисовка линии для любого размера
function drawDynamicWinLine(indices, lineElement, size) {
    if (!indices || indices.length < 2) return;
    
    // Сбрасываем анимацию
    lineElement.style.animation = 'none';
    lineElement.offsetHeight; 
    lineElement.style.animation = null; 

    // Вычисляем координаты. Размер viewBox 300x300.
    // Размер одной клетки = 300 / size
    const cellSize = 300 / size;
    const halfCell = cellSize / 2;

    const getCoord = (index) => ({
        x: (index % size) * cellSize + halfCell,
        y: Math.floor(index / size) * cellSize + halfCell
    });

    const start = getCoord(indices[0]);
    const end = getCoord(indices[indices.length - 1]);
    
    lineElement.setAttribute('x1', start.x);
    lineElement.setAttribute('y1', start.y);
    lineElement.setAttribute('x2', end.x);
    lineElement.setAttribute('y2', end.y);
    lineElement.style.display = 'block';
}

export function cleanupGame() {
    if (gameRef) off(gameRef);
}
