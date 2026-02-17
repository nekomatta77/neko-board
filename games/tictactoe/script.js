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

// --- SMART RULES ---
let BOARD_SIZE = 3;
let WIN_LENGTH = 3;

if (maxPlayers === 2) { BOARD_SIZE = 3; WIN_LENGTH = 3; } 
else if (maxPlayers === 3) { BOARD_SIZE = 6; WIN_LENGTH = 4; } 
else if (maxPlayers === 4) { BOARD_SIZE = 10; WIN_LENGTH = 4; } 
else { BOARD_SIZE = 15; WIN_LENGTH = 5; }

const SYMBOLS = ['✕', '◯', '△', '□', '☆', '◇'];

// --- REFS ---
const roomRef = db.ref(`rooms/${roomId}`);
const playersRef = roomRef.child('players'); 
const gameRef = roomRef.child('game');
const rouletteRef = roomRef.child('roulette');
const leaderboardsRef = db.ref('leaderboards');

// --- STATE ---
let myIndex = -1; 
let myPlayerRef = null;
let activePlayersList = [];
let isHost = false; 
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
    
    if (window.innerWidth < 600) {
        if (BOARD_SIZE === 3) { cellSize = '70px'; fontSize = '32px'; }
        else if (BOARD_SIZE === 6) { cellSize = '45px'; fontSize = '24px'; }
        else { cellSize = '30px'; fontSize = '18px'; }
    } else {
        if (BOARD_SIZE === 6) { cellSize = '55px'; fontSize = '28px'; }
        else if (BOARD_SIZE === 10) { cellSize = '35px'; fontSize = '20px'; }
        else if (BOARD_SIZE >= 15) { cellSize = '24px'; fontSize = '14px'; }
    }

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
    roomRef.once('value').then(snapshot => {
        const roomData = snapshot.val();
        
        if (!roomData) {
            alert("Комната не найдена");
            window.location.href = '../../index.html';
            return;
        }

        if (roomData.host === username) {
            isHost = true;
            roomRef.onDisconnect().remove();
        }

        myPlayerRef = playersRef.push();
        myPlayerRef.set({
            name: username,
            avatar: userAvatar,
            joinedAt: firebase.database.ServerValue.TIMESTAMP
        });
        
        myPlayerRef.onDisconnect().remove();
        
        window.addEventListener('beforeunload', () => {
            myPlayerRef.remove();
            if (isHost) roomRef.remove();
        });

        startListeners(myPlayerRef.key);
    });
}

function startListeners(myKey) {
    // 1. ИГРОКИ (Строгая сортировка)
    playersRef.on('value', (snap) => {
        const val = snap.val() || {};
        activePlayersList = Object.keys(val).map(key => ({
            key: key,
            ...val[key]
        })).sort((a, b) => {
            // Если время входа отличается, сортируем по времени
            if (a.joinedAt !== b.joinedAt) return a.joinedAt - b.joinedAt;
            // Если время одинаковое (баг или быстрый вход), сортируем по ID (ключам)
            return a.key.localeCompare(b.key);
        });

        myIndex = activePlayersList.findIndex(p => p.key === myKey);
        updatePlayersUI();
        
        if (isHost) {
            roomRef.update({ currentPlayers: activePlayersList.length });
            // Проверяем запуск рулетки, если игроков достаточно и она еще не прошла
            if (!gameState.rouletteFinished && activePlayersList.length >= maxPlayers) {
                checkAndStartRoulette();
            }
        }
    });

    // 2. ИГРА
    gameRef.on('value', (snap) => {
        const data = snap.val();
        if (data) {
            // Если игра была перезапущена (turn=0, winner=null, rouletteFinished=false)
            // нам нужно сбросить таймеры и интерфейс
            if (data.rouletteFinished === false && gameState.rouletteFinished === true) {
                 if (rouletteTimer) clearTimeout(rouletteTimer);
            }

            gameState = data;
            
            if (gameState.winner === undefined) gameState.winner = null;
            const cleanBoard = Array(BOARD_SIZE * BOARD_SIZE).fill(null);
            if (gameState.board) {
                for (let key in gameState.board) cleanBoard[key] = gameState.board[key];
            }
            gameState.board = cleanBoard;

            if (gameState.rouletteFinished) {
                document.getElementById('roulette-container').classList.remove('active');
                document.getElementById('win-overlay').classList.remove('active');
                updateBoardUI();
                updateGameStatus();
            } else {
                // Если рулетка не закончена (или сброшена), показываем её
                document.getElementById('win-overlay').classList.remove('active');
                resetRouletteUI();
                if (isHost) checkAndStartRoulette();
            }
        } else {
            if (isHost) resetGameInDB();
        }
    });

    // 3. РУЛЕТКА
    rouletteRef.on('value', snap => {
        const data = snap.val();
        if (!data) return; // Если данные удалены (рестарт), ничего не делаем
        
        if (data.state === 'spinning') {
            startRouletteAnimation(data.winnerIndex, data.offset);
        }
    });

    // 4. ВЫХОД
    roomRef.on('value', (snap) => {
        if (!snap.exists()) {
            window.location.href = '../../index.html';
        }
    });
}

function checkAndStartRoulette() {
    // Проверяем, запущена ли уже рулетка в БД
    rouletteRef.once('value', rSnap => {
        if (!rSnap.exists()) {
            // Если данных нет, создаем их (запускаем процесс)
            initRouletteProcess();
        }
    });
}

// --- ROULETTE LOGIC ---

function resetRouletteUI() {
    const rContainer = document.getElementById('roulette-container');
    const rStrip = document.getElementById('roulette-strip');
    const rStatus = document.getElementById('roulette-status');
    
    // Обязательно показываем контейнер
    rContainer.classList.add('active');
    rStatus.innerText = "Подготовка...";
    
    // Сбрасываем позицию БЕЗ анимации
    rStrip.style.transition = 'none';
    rStrip.style.transform = 'translateX(0px)';
}

function initRouletteProcess() {
    if (activePlayersList.length < maxPlayers) return;

    const winnerIdx = Math.floor(Math.random() * activePlayersList.length);
    // Небольшое смещение для реалистичности (-15px до +15px)
    const randomOffset = Math.floor(Math.random() * 30) - 15; 
    
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
    const rWindow = document.querySelector('.roulette-window');
    
    document.getElementById('roulette-container').classList.add('active');
    rStatus.innerText = "Выбираем игрока...";

    // Генерируем ленту
    rStrip.innerHTML = '';
    const itemWidth = 100; // Ширина элемента .roulette-item из CSS
    const loops = 50; 
    
    for(let i=0; i<loops; i++) {
        activePlayersList.forEach(p => {
            const div = document.createElement('div');
            div.className = 'roulette-item';
            div.innerHTML = `<img src="../../assets/avatars/${p.avatar || 'ava1.png'}">`;
            rStrip.appendChild(div);
        });
    }

    // --- МАТЕМАТИКА ЦЕНТРИРОВАНИЯ ---
    const playerCount = activePlayersList.length;
    // Крутим достаточно долго (40 полных кругов + индекс победителя)
    const targetRound = 40 * playerCount; 
    const finalIndex = targetRound + winnerIdx; 
    
    // Динамически вычисляем центр окна (чтобы работало и на ПК, и на телефоне)
    // Формула: (ШиринаОкна / 2) - (ШиринаЭлемента / 2)
    const windowWidth = rWindow.clientWidth || 300;
    const centerOffset = (windowWidth / 2) - (itemWidth / 2);

    // Итоговая позиция в пикселях
    const pixelPos = (finalIndex * itemWidth) - centerOffset + randomOffset;

    // Сброс перед стартом
    rStrip.style.transition = 'none';
    rStrip.style.transform = 'translateX(0px)';
    
    // Форсируем перерисовку (Reflow)
    void rStrip.offsetWidth; 

    // Запуск анимации
    setTimeout(() => {
        rStrip.style.transition = "transform 4s cubic-bezier(0.15, 0, 0.15, 1)";
        rStrip.style.transform = `translateX(-${pixelPos}px)`;
    }, 50);

    // Таймер окончания (время анимации 4000мс + запас 500мс)
    rouletteTimer = setTimeout(() => {
        showRouletteResult(winnerIdx);
    }, 4500);
}

function showRouletteResult(winnerIdx) {
    const winner = activePlayersList[winnerIdx];
    
    // Защита: если игрок вышел во время рулетки
    if (!winner) {
        if (isHost) resetGameInDB(); 
        return;
    }

    const modal = document.getElementById('roulette-winner-modal');
    document.getElementById('r-winner-name').innerText = winner.name;
    document.getElementById('r-winner-img').src = `../../assets/avatars/${winner.avatar || 'ava1.png'}`;
    
    modal.classList.add('active');

    setTimeout(() => {
        modal.classList.remove('active');
        // ТОЛЬКО ХОСТ переключает состояние игры
        if (isHost) {
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
        // Подсветка хода: если рулетка прошла, и сейчас ход этого игрока
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
                saveScore(100);
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

function saveScore(points) {
    if(!roomId || !username) return;
    leaderboardsRef.child(roomId).child(username).set({
        score: points,
        avatar: userAvatar,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    }).catch(console.error);
}

function resetGameInDB() {
    // 1. Очищаем данные рулетки, чтобы триггеры сработали заново
    rouletteRef.remove().then(() => {
        // 2. Сбрасываем состояние игры
        gameRef.set({
            board: Array(BOARD_SIZE * BOARD_SIZE).fill(null),
            turn: 0,
            winner: null,
            rouletteFinished: false 
        });
    });
    window.scoreSent = false;
}

function restartGame() {
    // Эта кнопка доступна всем в UI, но логика сработает если вызвать resetGameInDB (если разрешено)
    // В данном коде UI вызывает resetGameInDB через хоста, 
    // но если нажал не хост, ничего не произойдет, так как прав на запись нет?
    // В Firebase Rules обычно открыто. Если что, здесь просто вызываем сброс.
    resetGameInDB();
}

function exitGame() {
    if (isHost) {
        roomRef.remove().finally(() => {
            window.location.href = '../../index.html';
        });
    } else {
        window.location.href = '../../index.html';
    }
}