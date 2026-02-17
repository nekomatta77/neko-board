// --- CONFIG ---
const firebaseConfig = {
    apiKey: "AIzaSyC5E-bN2LNWElo7I4kcCGqcgMvoy8WX4wY",
    authDomain: "neko-board.firebaseapp.com",
    databaseURL: "https://neko-board-default-rtdb.firebaseio.com",
    projectId: "neko-board",
    storageBucket: "neko-board.firebasestorage.app",
    messagingSenderId: "758590553576",
    appId: "1:758590553576:web:b3d006e91390d1d4f3385d",
    measurementId: "G-G9X92RCNM4"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

// --- PARAMS ---
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');
const maxPlayers = parseInt(urlParams.get('max')) || 2;
const username = urlParams.get('user') || 'Anon';
const userAvatar = urlParams.get('avatar') || 'ava1.png';

// --- RULES ---
let BOARD_SIZE = 3;
let WIN_LENGTH = 3;

if (maxPlayers === 2) {
    BOARD_SIZE = 3; WIN_LENGTH = 3;
} else if (maxPlayers === 3) {
    BOARD_SIZE = 9; WIN_LENGTH = 4;  
} else if (maxPlayers === 4) {
    BOARD_SIZE = 11; WIN_LENGTH = 4;  
} else {
    BOARD_SIZE = 15; WIN_LENGTH = 5;  
}

const SYMBOLS = ['✕', '◯', '△', '□', '☆', '◇'];

// --- REFS ---
const roomRef = db.ref(`rooms/${roomId}`);
const playersRef = roomRef.child('players'); 
const gameRef = roomRef.child('game');
const rouletteRef = roomRef.child('roulette');

// --- STATE ---
let myIndex = -1; 
let myPlayerRef = null;
let activePlayersList = [];
let gameState = { 
    board: Array(BOARD_SIZE * BOARD_SIZE).fill(null), 
    turn: 0, 
    winner: null,
    rouletteFinished: false 
};
let rouletteTimer = null; 

// --- INIT ---
initBoard();
joinGameLogic();

function initBoard() {
    const boardEl = document.getElementById('board');
    boardEl.style.gridTemplateColumns = `repeat(${BOARD_SIZE}, 1fr)`;
    
    let cellSize = '90px';
    let fontSize = '40px';
    
    if (BOARD_SIZE > 3) { cellSize = '38px'; fontSize = '24px'; }
    if (BOARD_SIZE > 10) { cellSize = '24px'; fontSize = '14px'; }

    boardEl.innerHTML = '';
    for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.style.width = cellSize;
        cell.style.height = cellSize;
        cell.style.fontSize = fontSize;
        cell.id = `cell-${i}`;
        cell.onclick = () => handleMove(i);
        boardEl.appendChild(cell);
    }
}

function joinGameLogic() {
    myPlayerRef = playersRef.push();
    myPlayerRef.set({
        name: username,
        avatar: userAvatar,
        joinedAt: firebase.database.ServerValue.TIMESTAMP
    });
    myPlayerRef.onDisconnect().remove();
    window.addEventListener('beforeunload', () => myPlayerRef.remove());
    startListeners(myPlayerRef.key);
}

function startListeners(myKey) {
    // 1. ИГРОКИ
    playersRef.on('value', (snap) => {
        const val = snap.val() || {};
        activePlayersList = Object.keys(val).map(key => ({
            key: key,
            ...val[key]
        })).sort((a, b) => {
            if (a.joinedAt === b.joinedAt) return a.key.localeCompare(b.key);
            return a.joinedAt - b.joinedAt;
        });

        myIndex = activePlayersList.findIndex(p => p.key === myKey);
        updatePlayersUI();
        
        if (myIndex === 0) {
            roomRef.update({ currentPlayers: activePlayersList.length });
            // Проверка при изменении состава игроков
            if (!gameState.rouletteFinished) checkAndStartRoulette();
        }
    });

    // 2. ИГРА
    gameRef.on('value', (snap) => {
        const data = snap.val();
        if (data) {
            gameState = data;
            
            if (gameState.winner === undefined) gameState.winner = null;
            const cleanBoard = Array(BOARD_SIZE * BOARD_SIZE).fill(null);
            if (gameState.board) {
                for (let key in gameState.board) cleanBoard[key] = gameState.board[key];
            }
            gameState.board = cleanBoard;

            if (gameState.rouletteFinished) {
                // ИГРА ИДЕТ
                document.getElementById('roulette-container').classList.remove('active');
                document.getElementById('win-overlay').classList.remove('active');
                updateBoardUI();
                updateGameStatus();
            } else {
                // РЕЖИМ РУЛЕТКИ (СБРОС)
                document.getElementById('win-overlay').classList.remove('active');
                
                // ВАЖНО: Сбрасываем UI рулетки визуально перед запуском
                resetRouletteUI();
                
                // Если я хост, пытаемся запустить логику рулетки
                if (myIndex === 0) checkAndStartRoulette();
            }
        } else {
            if (myIndex === 0) resetGameInDB();
        }
    });

    // 3. РУЛЕТКА (АНИМАЦИЯ)
    rouletteRef.on('value', snap => {
        const data = snap.val();
        // Запускаем ТОЛЬКО если статус spinning
        if (data && data.state === 'spinning') {
            startRouletteAnimation(data.winnerIndex, data.offset);
        }
    });

    // 4. ВЫХОД
    roomRef.on('value', (snap) => {
        if (!snap.exists()) window.parent.postMessage({ type: 'NEKO_EVENT', action: 'EXIT' }, '*');
    });
}

function checkAndStartRoulette() {
    // Условия: достаточно игроков И рулетка еще не завершена
    if (activePlayersList.length >= maxPlayers && !gameState.rouletteFinished) {
        rouletteRef.once('value', rSnap => {
            // Если в базе нет записи о вращении - создаем её
            if (!rSnap.exists()) {
                initRouletteProcess();
            }
        });
    }
}

// --- ROULETTE LOGIC ---
function resetRouletteUI() {
    // Эта функция вызывается когда rouletteFinished = false
    const rContainer = document.getElementById('roulette-container');
    const rStrip = document.getElementById('roulette-strip');
    const rStatus = document.getElementById('roulette-status');
    
    rContainer.classList.add('active');
    rStatus.innerText = "Подготовка...";
    
    // Мгновенный сброс позиции без анимации
    rStrip.style.transition = 'none';
    rStrip.style.transform = 'translateX(0px)';
}

function initRouletteProcess() {
    const winnerIdx = Math.floor(Math.random() * activePlayersList.length);
    const randomOffset = Math.floor(Math.random() * 20) - 10; 
    
    // Записываем в БД команду "КРУТИТЬ"
    rouletteRef.set({
        state: 'spinning',
        winnerIndex: winnerIdx,
        offset: randomOffset
    });
}

function startRouletteAnimation(winnerIdx, randomOffset) {
    if (rouletteTimer) clearTimeout(rouletteTimer);

    const rStrip = document.getElementById('roulette-strip');
    const rStatus = document.getElementById('roulette-status');
    
    document.getElementById('roulette-container').classList.add('active');
    rStatus.innerText = "Выбираем игрока...";

    // Генерация ленты
    rStrip.innerHTML = '';
    const itemWidth = 100; 
    const loops = 50; 
    
    for(let i=0; i<loops; i++) {
        activePlayersList.forEach(p => {
            const div = document.createElement('div');
            div.className = 'roulette-item';
            div.innerHTML = `<img src="../../assets/avatars/${p.avatar || 'ava1.png'}">`;
            rStrip.appendChild(div);
        });
    }

    const playerCount = activePlayersList.length;
    const targetRound = 40 * playerCount; 
    const finalIndex = targetRound + winnerIdx; 
    const centerOffset = 100; // (300/2) - (100/2) = 150 - 50 = 100
    const pixelPos = (finalIndex * itemWidth) - centerOffset + randomOffset;

    // --- МАГИЯ RESET ---
    // 1. Сначала жестко ставим в 0 без анимации
    rStrip.style.transition = 'none';
    rStrip.style.transform = 'translateX(0px)';
    
    // 2. Ждем 2 кадра отрисовки (гарантия сброса)
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            // 3. Включаем анимацию и крутим
            rStrip.style.transition = "transform 4s cubic-bezier(0.15, 0, 0.15, 1)";
            rStrip.style.transform = `translateX(-${pixelPos}px)`;
        });
    });

    rouletteTimer = setTimeout(() => {
        showRouletteResult(winnerIdx);
    }, 4500);
}

function showRouletteResult(winnerIdx) {
    const winner = activePlayersList[winnerIdx];
    if (!winner) {
        if (myIndex === 0) resetGameInDB(); 
        return;
    }

    const modal = document.getElementById('roulette-winner-modal');
    document.getElementById('r-winner-name').innerText = winner.name;
    document.getElementById('r-winner-img').src = `../../assets/avatars/${winner.avatar || 'ava1.png'}`;
    
    modal.classList.add('active');

    setTimeout(() => {
        modal.classList.remove('active');
        if (myIndex === 0) {
            // Завершаем рулетку и передаем ход
            gameRef.update({
                rouletteFinished: true,
                turn: winnerIdx 
            });
        }
    }, 2500);
}

// --- GAME UI ---
function updatePlayersUI() {
    const listEl = document.getElementById('players-list-ui');
    listEl.innerHTML = '';
    
    activePlayersList.forEach((p, idx) => {
        if (idx >= maxPlayers) return; 
        const isMe = idx === myIndex;
        const isTurn = gameState.rouletteFinished && (gameState.turn % maxPlayers) === idx && gameState.winner === null;

        const div = document.createElement('div');
        div.className = `player-item ${isTurn ? 'active' : ''}`;
        div.innerHTML = `
            <div class="player-icon bg${idx}"></div>
            <img src="../../assets/avatars/${p.avatar || 'ava1.png'}" style="width:20px; height:20px; border-radius:50%; margin-right:5px;">
            <span style="${isMe ? 'color:white' : 'color:#aaa'}">${p.name}</span>
            ${isMe ? '(ВЫ)' : ''}
        `;
        listEl.appendChild(div);
    });
}

function updateBoardUI() {
    for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i++) {
        const val = gameState.board[i];
        const cell = document.getElementById(`cell-${i}`);
        if (cell) {
            cell.innerHTML = (val !== null && val !== undefined) ? SYMBOLS[val] : '';
            cell.className = `cell ${(val !== null && val !== undefined) ? 'taken c'+val : ''}`;
        }
    }
}

function updateGameStatus() {
    const statusEl = document.getElementById('status-text');
    const overlay = document.getElementById('win-overlay');

    if (!gameState.rouletteFinished) {
        statusEl.innerText = "Рулетка...";
        return;
    }

    if (myIndex >= maxPlayers) {
        statusEl.innerText = "РЕЖИМ НАБЛЮДАТЕЛЯ";
        statusEl.style.color = "#a29bfe";
        overlay.classList.remove('active');
        return;
    }

    if (gameState.winner !== null) {
        statusEl.innerText = "Игра Окончена";
        overlay.classList.add('active');
        const winTitle = document.getElementById('win-title');
        const winName = document.getElementById('win-name');
        
        if (gameState.winner === myIndex) {
            winTitle.innerText = "ПОБЕДА!";
            winTitle.style.color = "#2ed573";
            winName.innerText = "+100 Очков";
            if (!window.scoreSent) {
                window.parent.postMessage({ type: 'NEKO_EVENT', action: 'SAVE_SCORE', payload: { score: 100 } }, '*');
                window.scoreSent = true;
            }
        } else {
            winTitle.innerText = "ПОРАЖЕНИЕ";
            winTitle.style.color = "#ff4757";
            const winnerName = activePlayersList[gameState.winner] ? activePlayersList[gameState.winner].name : "Оппонент";
            winName.innerText = `Победитель: ${winnerName}`;
            window.scoreSent = false;
        }
        return;
    } else {
        overlay.classList.remove('active');
    }

    if (activePlayersList.length < maxPlayers) {
        statusEl.innerText = `Ожидание (${activePlayersList.length}/${maxPlayers})`;
        statusEl.style.color = "#666";
        statusEl.style.boxShadow = "none";
        return;
    }

    const currentTurn = gameState.turn % maxPlayers;
    if (currentTurn === myIndex) {
        statusEl.innerText = "ВАШ ХОД";
        statusEl.style.color = "#2ed573";
        statusEl.style.boxShadow = "0 0 15px rgba(46, 213, 115, 0.3)";
    } else {
        const pName = activePlayersList[currentTurn] ? activePlayersList[currentTurn].name : "Оппонент";
        statusEl.innerText = `Ходит ${pName}`;
        statusEl.style.color = "white";
        statusEl.style.boxShadow = "none";
    }
}

function handleMove(index) {
    if (!gameState.rouletteFinished) return;
    if (gameState.winner !== null) return;
    if (activePlayersList.length < maxPlayers) return;
    if (myIndex === -1 || myIndex >= maxPlayers) return;

    const currentTurn = gameState.turn % maxPlayers;
    if (currentTurn !== myIndex) return;

    const val = gameState.board[index];
    if (val !== null && val !== undefined) return;

    const newBoard = [...gameState.board];
    newBoard[index] = myIndex;
    
    let winner = null;
    if (checkWin(newBoard, index, myIndex)) winner = myIndex;

    gameRef.update({
        board: newBoard,
        turn: gameState.turn + 1,
        winner: winner
    }).catch(console.error);
}

function checkWin(board, idx, player) {
    const s = BOARD_SIZE;
    const x = idx % s; 
    const y = Math.floor(idx / s);
    const dirs = [[1,0], [0,1], [1,1], [1,-1]];

    for (let [dx, dy] of dirs) {
        let count = 1;
        for (let i = 1; i < WIN_LENGTH; i++) {
            const nx = x + dx*i, ny = y + dy*i;
            if (nx<0 || nx>=s || ny<0 || ny>=s || board[ny*s+nx] !== player) break;
            count++;
        }
        for (let i = 1; i < WIN_LENGTH; i++) {
            const nx = x - dx*i, ny = y - dy*i;
            if (nx<0 || nx>=s || ny<0 || ny>=s || board[ny*s+nx] !== player) break;
            count++;
        }
        if (count >= WIN_LENGTH) return true;
    }
    return false;
}

function resetGameInDB() {
    // Удаляем данные рулетки, чтобы она могла перезаписаться
    rouletteRef.remove();
    
    // Сбрасываем игру
    gameRef.set({
        board: Array(BOARD_SIZE * BOARD_SIZE).fill(null),
        turn: 0,
        winner: null,
        rouletteFinished: false 
    });
    
    window.scoreSent = false;
}

function restartGame() {
    resetGameInDB();
}