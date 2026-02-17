// --- CONFIG ---
if (typeof firebaseConfig === 'undefined') {
    var firebaseConfig = {
        apiKey: "AIzaSyC5E-bN2LNWElo7I4kcCGqcgMvoy8WX4wY",
        authDomain: "neko-board.firebaseapp.com",
        databaseURL: "https://neko-board-default-rtdb.firebaseio.com",
        projectId: "neko-board",
        storageBucket: "neko-board.firebasestorage.app",
        messagingSenderId: "758590553576",
        appId: "1:758590553576:web:b3d006e91390d1d4f3385d",
        measurementId: "G-G9X92RCNM4"
    };
}

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

var db = firebase.database();
var chatRef = db.ref('global_chat');
var statusRef = db.ref('status');
var leaderboardsRef = db.ref('leaderboards'); // Нужно для main.js, но запись очков теперь будет и внутри игры
var roomsRef = db.ref('rooms');

var currentUser = null;
var selectedAvatar = 'ava1.png';
var selectedGameType = '';

// --- AUDIO ---
var audio = {
    ctx: null, enabled: false,
    init: function() {
        if(!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.enabled = true;
            this.updateIcon();
        } else if(this.ctx.state === 'suspended') this.ctx.resume();
    },
    playNote: function(freq, type, duration, volume=0.1) {
        if(!this.enabled || !this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(0, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(volume, this.ctx.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    },
    hover: function() { this.playNote(1000, 'sine', 0.1, 0.02); },
    click: function() { this.playNote(600, 'triangle', 0.15, 0.1); },
    notify: function() { 
        if(!this.enabled) return;
        this.playNote(523.25, 'sine', 0.4, 0.1); 
        setTimeout(() => this.playNote(783.99, 'sine', 0.6, 0.1), 100); 
    },
    updateIcon: function() {
        const btn = document.getElementById('sound-btn');
        if (btn) {
            if(this.enabled) {
                btn.classList.add('active');
                btn.innerHTML = `<svg class="icon-lg" viewBox="0 0 24 24" stroke="currentColor"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93L15.54 8.46a5 5 0 0 0 0 7.07l3.53 3.53"/></svg>`;
            } else {
                btn.classList.remove('active');
                btn.innerHTML = `<svg class="icon-lg" viewBox="0 0 24 24" stroke="currentColor"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`;
            }
        }
    }
};

function toggleMute() {
    if(!audio.ctx) audio.init();
    else { audio.enabled = !audio.enabled; audio.updateIcon(); if(audio.enabled) audio.click(); }
}

// --- NAVIGATION ---
function switchTab(tab) {
    audio.click();
    document.getElementById('tab-games').classList.toggle('active', tab === 'games');
    document.getElementById('tab-servers').classList.toggle('active', tab === 'servers');
    if(tab === 'games') {
        document.getElementById('content-games').classList.remove('hidden');
        document.getElementById('content-servers').classList.add('hidden');
    } else {
        document.getElementById('content-games').classList.add('hidden');
        document.getElementById('content-servers').classList.remove('hidden');
        loadServers(); 
    }
}

function openCreateModal(gameType) {
    audio.click();
    selectedGameType = gameType;
    document.getElementById('create-room-modal').classList.add('active');
}

function closeModal() {
    audio.click();
    document.getElementById('create-room-modal').classList.remove('active');
}

function createRoom() {
    audio.click();
    const name = document.getElementById('room-name-input').value.trim() || "Комната";
    const max = parseInt(document.getElementById('players-range').value);
    const ref = roomsRef.push();
    
    const boardSize = max > 2 ? 15 : 3;
    const initialGame = {
        board: Array(boardSize * boardSize).fill(null),
        turn: 0,
        winner: null,
        rouletteFinished: false 
    };

    // При выходе хоста комната удаляется (если это SPA), но лучше дублировать логику внутри игры
    ref.onDisconnect().remove();

    const roomData = {
        id: ref.key,
        name: name,
        gameType: selectedGameType,
        game: initialGame,          
        maxPlayers: max,
        currentPlayers: 0,
        host: currentUser.name,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    };

    ref.set(roomData).then(() => {
        closeModal();
        joinGame(ref.key, selectedGameType, max, currentUser.name, currentUser.avatar);
    });
}

function loadServers() {
    const list = document.getElementById('content-servers');
    list.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">Загрузка...</div>';
    
    roomsRef.limitToLast(20).on('value', snapshot => {
        list.innerHTML = '';
        if(!snapshot.exists()) {
            list.innerHTML = '<div style="text-align:center; opacity:0.5; padding: 20px;">Нет активных серверов</div>';
            return;
        }
        
        snapshot.forEach(child => {
            const room = child.val();
            if (!room.name || !room.host || !room.gameType) return;

            const card = document.createElement('div');
            card.className = 'server-card';
            card.onclick = () => { audio.click(); joinGame(room.id, room.gameType, room.maxPlayers, room.host); };
            card.classList.add('hover-sound');
            
            if (window.matchMedia('(hover: hover)').matches) {
                card.addEventListener('mouseenter', () => audio.hover());
            }

            const gameName = room.gameType ? room.gameType.toUpperCase() : "GAME";
            
            card.innerHTML = `
                <div class="server-info">
                    <h4>${room.name}</h4>
                    <div class="server-meta">
                        <span><svg class="icon" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> ${room.currentPlayers || 0}/${room.maxPlayers}</span>
                        <span>${gameName}</span>
                    </div>
                </div>
                <button class="join-btn">ВОЙТИ</button>
            `;
            list.appendChild(card);
        });
    });
}

function joinGame(roomId, gameType, maxPlayers, hostName) {
    let fileName = 'index.html';
    if (gameType === 'tictactoe') fileName = 'tictac.html';
    
    // Формируем полный путь
    const url = `games/${gameType}/${fileName}?room=${roomId}&max=${maxPlayers}&user=${encodeURIComponent(currentUser.name)}&avatar=${encodeURIComponent(currentUser.avatar)}`;
    
    openGame(url);
}

// --- INITIALIZATION ---
window.onload = async function() {
    if (typeof NekoLoader !== 'undefined') NekoLoader.show();

    initParticles();
    
    // Инициализация аватарок
    const grid = document.getElementById('avatar-grid');
    if (grid) {
        grid.innerHTML = ''; 
        for (let i = 1; i <= 20; i++) {
            let img = document.createElement('img');
            img.src = `assets/avatars/ava${i}.png`; 
            img.className = 'avatar-option hover-sound';
            img.onerror = function() { this.style.backgroundColor = '#333'; };
            img.onclick = function() { selectAvatar(this, `ava${i}.png`); audio.click(); };
            if (i === 1) img.classList.add('selected');
            grid.appendChild(img);
        }
    }

    if (typeof NekoLoader !== 'undefined') await NekoLoader.waitForImages('avatar-grid');

    const savedData = localStorage.getItem('nekoProfile');
    if (savedData) {
        currentUser = JSON.parse(savedData);
        enterLobby(currentUser.name, currentUser.avatar);
    }

    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
        const newChatInput = chatInput.cloneNode(true);
        chatInput.parentNode.replaceChild(newChatInput, chatInput);
        
        newChatInput.addEventListener("keypress", (e) => { 
            if (e.key === "Enter") sendMessage(); 
        });
    }

    initChatListener();

    if (window.matchMedia('(hover: hover)').matches) {
        document.body.addEventListener('mouseenter', (e) => {
            if (e.target.classList && e.target.classList.contains('hover-sound')) {
                audio.hover();
            }
        }, true);
    }

    setTimeout(() => {
        if (typeof NekoLoader !== 'undefined') NekoLoader.hide();
    }, 500);
};

function selectAvatar(el, file) {
    document.querySelectorAll('.avatar-option').forEach(img => img.classList.remove('selected'));
    el.classList.add('selected');
    selectedAvatar = file;
}

function saveProfile() {
    audio.init();
    const nickname = document.getElementById('nickname-input').value.trim();
    if (!nickname) return;
    const profile = { name: nickname, avatar: selectedAvatar };
    localStorage.setItem('nekoProfile', JSON.stringify(profile));
    currentUser = profile;
    enterLobby(profile.name, profile.avatar);
}

function enterLobby(name, avatar) {
    document.getElementById('display-name').innerText = name;
    document.getElementById('display-avatar').src = `assets/avatars/${avatar}`;
    updateUserStatus('ONLINE');
    
    const login = document.getElementById('login-screen');
    login.style.opacity = '0';
    setTimeout(() => {
        login.classList.add('hidden');
        document.getElementById('lobby').classList.remove('hidden');
        document.getElementById('floating-chat').classList.remove('hidden');
        document.getElementById('sound-container').classList.remove('hidden');
        switchTab('games');
    }, 300);
}

function updateUserStatus(status) {
    document.getElementById('user-status').innerText = status;
    document.getElementById('user-status').style.color = status === 'ONLINE' ? '#00b894' : '#a29bfe';
    if (currentUser) {
        statusRef.child(currentUser.name).set({ status: status, lastSeen: firebase.database.ServerValue.TIMESTAMP });
    }
}

function logout() {
    audio.click();
    if(confirm("Выйти?")) { localStorage.removeItem('nekoProfile'); location.reload(); }
}

function toggleChat() {
    audio.click();
    const win = document.getElementById('chat-window');
    win.classList.toggle('active');
    if(win.classList.contains('active')) setTimeout(() => document.getElementById('chat-input').focus(), 100);
}

function sendMessage() {
    audio.click();
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text || !currentUser) return;
    chatRef.push({ name: currentUser.name, text: text, timestamp: firebase.database.ServerValue.TIMESTAMP });
    input.value = ""; 
}

function initChatListener() {
    chatRef.off(); 
    chatRef.limitToLast(50).on('child_added', (snap) => {
        const msg = snap.val();
        if(!msg) return;
        audio.notify();
        const container = document.getElementById('chat-messages');
        const div = document.createElement('div');
        div.className = 'chat-msg';
        div.innerHTML = `<strong>${(msg.name||"Anon").replace(/</g,"&lt;")}</strong> ${(msg.text||"").replace(/</g,"&lt;")}`;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    });
}

function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<svg class="icon" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// --- ИЗМЕНЕННАЯ ФУНКЦИЯ ЗАПУСКА ИГРЫ ---
function openGame(url) {
    audio.click();
    updateUserStatus('ИГРАЕТ');
    // Полный переход на страницу игры
    window.location.href = url;
}

// Функции closeGame и toggleFullscreen в main.js больше не нужны, 
// так как управление переходит на страницу tictac.html

function initParticles() {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return; 
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    let particles = [];
    class Particle {
        constructor() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.vx = (Math.random() - 0.5) * 0.5;
            this.vy = (Math.random() - 0.5) * 0.5;
            this.size = Math.random() * 2;
        }
        update() {
            this.x += this.vx;
            this.y += this.vy;
            if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
            if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
        }
        draw() {
            ctx.fillStyle = 'rgba(108, 92, 231, 0.5)';
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    for (let i = 0; i < 50; i++) particles.push(new Particle());
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < particles.length; i++) {
            particles[i].update();
            particles[i].draw();
            for (let j = i; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                if (dist < 100) {
                    ctx.strokeStyle = `rgba(108, 92, 231, ${0.1 - dist/1000})`;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.stroke();
                }
            }
        }
        requestAnimationFrame(animate);
    }
    animate();
    window.addEventListener('resize', () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; });
}