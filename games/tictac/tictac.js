import { db, ref, update, onValue, off, set, get } from '../../js/firebase-config.js';

let gameRef = null;
let currentUserId = null;
let mySymbol = null; 
let localBoard = Array(9).fill('');
let isGameActive = true;
let playersData = {};

let lastBoardStr = ""; 
let isFirstLoad = true; 

// Звук
const notifySound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');

export function initGame(container, roomId, userId, isHost) {
    currentUserId = userId;
    mySymbol = isHost ? 'X' : 'O'; 
    isGameActive = true;
    isFirstLoad = true; 
    lastBoardStr = "";
    
    // 1. Рисуем разметку
    container.innerHTML = `
        <div id="tictac-game">
            <div class="status-bar" id="game-status">
                <span class="loading-text">Загрузка...</span>
            </div>
            
            <div class="game-container">
                <div class="grid">
                    ${Array(9).fill('').map((_, i) => `<div class="cell" data-index="${i}"></div>`).join('')}
                </div>
                <svg class="win-overlay" viewBox="0 0 300 300">
                    <line id="win-line" x1="0" y1="0" x2="0" y2="0" stroke-linecap="round" />
                </svg>
            </div>
            
            ${isHost ? '<button id="restart-btn" class="hidden">ИГРАТЬ СНОВА</button>' : ''}
        </div>
    `;

    const cells = container.querySelectorAll('.cell');
    const statusText = container.querySelector('#game-status');
    const restartBtn = container.querySelector('#restart-btn');
    const winLine = container.querySelector('#win-line');

    gameRef = ref(db, `rooms/${roomId}/gameData`);

    if (isHost) {
        get(gameRef).then((snap) => {
            if (!snap.exists()) resetGameData();
        });
    }

    get(ref(db, `rooms/${roomId}/players`)).then((playerSnap) => {
        playersData = playerSnap.val() || {};
        subscribeToGame(statusText, cells, restartBtn, winLine);
    });

    if (restartBtn) {
        restartBtn.addEventListener('click', () => {
            resetGameData();
        });
    }
}

function resetGameData() {
    // При рестарте явно обнуляем линию
    set(gameRef, {
        board: Array(9).fill(''),
        turn: 'X',
        winner: null
    });
}

function subscribeToGame(statusText, cells, restartBtn, winLine) {
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

        // Обновляем клетки
        cells.forEach((cell, i) => {
            cell.textContent = localBoard[i];
            cell.className = 'cell';
            if (localBoard[i] !== '') cell.classList.add(localBoard[i]);
        });

        // Статусы
        if (data.winner) {
            isGameActive = false;
            
            // ИСПРАВЛЕНИЕ БАГА С ЛИНИЕЙ:
            // Мы вычисляем линию ЛОКАЛЬНО на основе текущей доски.
            // Это гарантирует, что линия всегда совпадает с картинкой.
            const winInfo = checkWinner(localBoard);
            
            if (data.winner === 'draw' || !winInfo) {
                statusText.textContent = "Ничья";
                statusText.className = "status-bar";
                winLine.style.display = 'none';
            } else {
                // Рисуем линию на основе локального расчета
                drawWinLine(winInfo.line, winLine);
                
                if (data.winner === mySymbol) {
                    statusText.textContent = "Ты победил";
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
            // Игра идет
            isGameActive = true;
            winLine.style.display = 'none'; // Прячем линию
            
            if (restartBtn) {
                restartBtn.classList.add('hidden');
                restartBtn.style.display = 'none';
            }

            if (isMyTurn) {
                statusText.innerHTML = `Твой ход <span style="font-size:1.2em">(${mySymbol})</span>`;
                statusText.className = "status-bar win"; 
            } else {
                const opponentSymbol = data.turn;
                const isOpponentHost = (opponentSymbol === 'X');
                const opponentEntry = Object.values(playersData).find(p => p.isHost === isOpponentHost);
                
                if (opponentEntry) {
                    statusText.innerHTML = `
                        <div class="turn-info">
                            <span style="opacity:0.7; margin-right:5px">Ход игрока:</span>
                            <img src="assets/avatars/ava${opponentEntry.avatar}.png" class="status-avatar">
                            <span>${opponentEntry.name}</span>
                        </div>
                    `;
                } else {
                    statusText.textContent = `Ход противника (${opponentSymbol})`;
                }
                statusText.className = "status-bar";
            }
        }
    });

    // Клик
    cells.forEach(cell => {
        cell.addEventListener('click', () => {
            const index = parseInt(cell.dataset.index);
            
            get(gameRef).then(snap => {
                const sData = snap.val();
                if(sData.turn !== mySymbol) return; 
                if(!isGameActive) return;
                if(localBoard[index] !== '') return;

                makeMove(index, mySymbol, sData.board);
            });
        });
    });
}

function playSound() {
    notifySound.currentTime = 0;
    notifySound.volume = 0.5; 
    notifySound.play().catch(e => console.log("Audio:", e));
}

function drawWinLine(indices, lineElement) {
    if (!indices || indices.length !== 3) return;
    
    // Сбрасываем анимацию (хак, чтобы линия перерисовалась если она уже была)
    lineElement.style.animation = 'none';
    lineElement.offsetHeight; /* trigger reflow */
    lineElement.style.animation = null; 

    const getCoord = (index) => ({
        x: (index % 3) * 100 + 50,
        y: Math.floor(index / 3) * 100 + 50
    });
    const start = getCoord(indices[0]);
    const end = getCoord(indices[2]);
    
    lineElement.setAttribute('x1', start.x);
    lineElement.setAttribute('y1', start.y);
    lineElement.setAttribute('x2', end.x);
    lineElement.setAttribute('y2', end.y);
    lineElement.style.display = 'block';
}

function makeMove(index, symbol, currentBoard) {
    const newBoard = [...currentBoard];
    newBoard[index] = symbol;
    
    const result = checkWinner(newBoard); 
    const winnerSymbol = result ? result.winner : null;
    // Мы больше не сохраняем winningLine в базу, так как считаем её локально
    // Но winner сохраняем обязательно
    const isDraw = !winnerSymbol && !newBoard.includes('');
    const nextTurn = symbol === 'X' ? 'O' : 'X';

    update(gameRef, {
        board: newBoard,
        turn: nextTurn,
        winner: winnerSymbol ? winnerSymbol : (isDraw ? 'draw' : null)
    });
}

// Эта функция теперь используется и для проверки хода, и для отрисовки линии
function checkWinner(board) {
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (let line of lines) {
        const [a, b, c] = line;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return { winner: board[a], line: line };
        }
    }
    return null;
}

export function cleanupGame() {
    if (gameRef) off(gameRef);
}
