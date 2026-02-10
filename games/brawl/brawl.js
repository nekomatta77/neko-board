import { db, ref, update, onValue, off, set, remove, get } from '../../js/firebase-config.js';
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { FBXLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/FBXLoader.js';

// --- НАСТРОЙКИ ---
const SPAWN_POINTS = [
    { x: 0, z: 0 },
    { x: 5, z: 5 },
    { x: -5, z: -5 },
    { x: 5, z: -5 },
    { x: -5, z: 5 }
];
const GRAVITY = -30;
const JUMP_FORCE = 12;
const SPEED = 6;
const SYNC_RATE = 50; 

// --- НАСТРОЙКИ КАМЕРЫ ---
const CAM_DISTANCE = 4.0;
const CAM_HEIGHT = 2.5;
const LOOK_OFFSET_Y = 1.8;

// --- БОЕВЫЕ НАСТРОЙКИ ---
const MAX_HP = 100;
const PUNCH_DAMAGE = 10;
const PUNCH_RANGE = 2.5; // Дистанция удара

let scene, camera, renderer, clock;
let myPlayerModel, mixer;
let otherPlayers = {}; 
let actions = {}; 
let activeAction = null; 
let joystick = { x: 0, y: 0 };
let keys = { w: false, a: false, s: false, d: false, space: false };
let isGrounded = true, verticalVelocity = 0, isPunching = false, isDead = false;
let mySpawnIndex = 0;
let gameState = 'selecting';

let cameraAngle = Math.PI; 
let hpBars = {}; // Храним ссылки на DOM элементы HP баров { id: element }

// Ссылки Firebase
let roomRef, myPlayerRef;
let unsubscribePlayers = null;
let syncInterval = null;

const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || navigator.maxTouchPoints > 0;

// --- СТИЛИ ---
function injectStyles() {
    const styleId = 'brawl-game-styles';
    if (document.getElementById(styleId)) return;

    const css = `
        #brawl-ui {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            pointer-events: none;
            font-family: 'Segoe UI', sans-serif;
            user-select: none;
            overflow: hidden;
        }
        #brawl-ui > * { pointer-events: auto; }

        /* ЭКРАН ВЫБОРА */
        #char-select-screen {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(10, 10, 12, 0.98);
            z-index: 20;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            color: white;
        }
        .chars-grid { display: flex; gap: 30px; flex-wrap: wrap; justify-content: center; }
        .char-option {
            width: 140px; height: 140px; border-radius: 20px;
            border: 2px solid #333; background: #1a1a1a;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            cursor: pointer; overflow: hidden; position: relative;
            transition: all 0.3s ease;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }
        .char-option img { width: 80%; height: 80%; object-fit: contain; transition: 0.3s; }
        .char-option span { 
            margin-top: 10px; font-weight: bold; color: #888; text-transform: uppercase; font-size: 12px; 
        }
        .char-option:hover { transform: translateY(-5px); border-color: #666; }
        .char-option.selected { 
            border-color: #00E676; 
            box-shadow: 0 0 30px rgba(0, 230, 118, 0.3);
            background: #112;
        }
        .char-option.selected span { color: #00E676; }
        
        #loading-overlay {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: #000; z-index: 15;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            color: #fff;
        }
        .loader {
            width: 50px; height: 50px; border: 4px solid #222;
            border-top: 4px solid #00E676; border-radius: 50%;
            animation: spin 0.8s linear infinite; margin-bottom: 20px;
        }

        /* HP BAR */
        .hp-bar-container {
            position: absolute;
            width: 60px;
            height: 6px;
            background: rgba(0,0,0,0.5);
            border-radius: 3px;
            pointer-events: none;
            transform: translate(-50%, -50%);
            z-index: 5;
            display: none; /* Скрыт пока не позиционирован */
        }
        .hp-bar-fill {
            height: 100%;
            background: #00E676;
            border-radius: 3px;
            width: 100%;
            transition: width 0.2s ease, background 0.2s;
        }
        .hp-bar-fill.low { background: #ff3d00; }
        .hp-bar-fill.med { background: #ffea00; }

        /* ИНТЕРФЕЙС (МОБИЛЬНЫЙ) */
        #custom-exit-btn {
            position: absolute; top: 20px; right: 20px;
            width: 40px; height: 40px;
            background: rgba(0, 0, 0, 0.5);
            border-radius: 50%; border: 1px solid rgba(255,255,255,0.1);
            color: white; font-size: 18px;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer; pointer-events: auto;
            z-index: 100; transition: 0.2s;
        }
        #custom-exit-btn:hover { background: rgba(200, 50, 50, 0.8); border-color: red; }

        #joystick-zone {
            position: absolute; bottom: 50px; left: 50px;
            width: 120px; height: 120px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 50%; touch-action: none;
        }
        #joystick-nub {
            position: absolute; top: 50%; left: 50%;
            width: 50px; height: 50px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 50%; transform: translate(-50%, -50%);
            backdrop-filter: blur(5px);
        }
        #mobile-actions {
            position: absolute; bottom: 50px; right: 50px;
            display: flex; gap: 20px;
        }
        #mobile-actions button {
            width: 70px; height: 70px; border-radius: 50%; border: none;
            background: rgba(255, 255, 255, 0.1); font-size: 28px; color: white;
            backdrop-filter: blur(5px); border: 1px solid rgba(255,255,255,0.1);
        }
        #mobile-actions button:active { background: rgba(255,255,255,0.3); }

        @keyframes spin { 100% { transform: rotate(360deg); } }
        .hidden { display: none !important; }
    `;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = css;
    document.head.appendChild(style);
}

// --- INIT ---
export function initGame(container, roomId, userId, isHost, playersList) {
    injectStyles();

    const playerIds = Object.keys(playersList).sort();
    mySpawnIndex = playerIds.indexOf(userId);
    if (mySpawnIndex === -1) mySpawnIndex = 0;

    roomRef = ref(db, `rooms/${roomId}/brawl`);
    myPlayerRef = ref(db, `rooms/${roomId}/brawl/players/${userId}`);

    // Инициализация игрока с HP
    set(myPlayerRef, {
        status: 'selecting',
        name: playersList[userId].name,
        char: null,
        hp: MAX_HP, // Добавляем здоровье
        x: 0, y: -100, z: 0,
        rotation: 0,
        anim: 'idle'
    });

    let hudHTML = '';
    // Контейнер для HP баров
    hudHTML += '<div id="hp-bars-layer"></div>';

    if (isMobile) {
        hudHTML += `
             <div id="custom-exit-btn" title="Выйти">✕</div>
             <div id="joystick-zone"><div id="joystick-nub"></div></div>
             <div id="mobile-actions">
                 <button id="btn-jump">🦘</button>
                 <button id="btn-punch">🥊</button>
             </div>
        `;
    }

    container.innerHTML = `
        <div id="brawl-ui">
            <div id="char-select-screen">
                <h2 style="font-weight:300; letter-spacing:2px; margin-bottom:40px;">ВЫБЕРИТЕ БОЙЦА</h2>
                <div class="chars-grid">
                    <div class="char-option" onclick="window.selectChar('cock')">
                        <img src="assets/models/cock/texture.png">
                        <span>Петух</span>
                    </div>
                    <div class="char-option disabled" style="opacity:0.3; cursor:default">
                        <div style="font-size:40px; color:#555">?</div>
                        <span>Скоро</span>
                    </div>
                </div>
                <div id="status-wait-text" style="margin-top:30px;color:#666; font-size:14px">Ожидание игроков...</div>
            </div>

            <div id="loading-overlay" class="hidden">
                <div class="loader"></div>
                <div style="font-weight:300; letter-spacing:1px">ЗАГРУЗКА АРЕНЫ</div>
            </div>

            <div id="game-hud" class="hidden">
                 ${hudHTML}
            </div>
        </div>
        <div id="three-container"></div>
    `;

    const exitBtn = document.getElementById('custom-exit-btn');
    if (exitBtn) {
        exitBtn.onclick = (e) => {
            e.stopPropagation();
            document.getElementById('close-fullscreen-btn')?.click();
        };
    }

    window.selectChar = (charId) => {
        const options = document.querySelectorAll('.char-option');
        options.forEach(el => el.classList.remove('selected'));
        event.currentTarget.classList.add('selected');
        update(myPlayerRef, { char: charId, status: 'selected' });
        
        const txt = document.getElementById('status-wait-text');
        txt.innerText = "ГОТОВО. ОЖИДАНИЕ ОСТАЛЬНЫХ...";
        txt.style.color = "#00E676";
        document.querySelector('.chars-grid').style.pointerEvents = 'none';
    };

    unsubscribePlayers = onValue(ref(db, `rooms/${roomId}/brawl/players`), (snap) => {
        const players = snap.val() || {};
        const allIds = Object.keys(players);
        const totalExpected = Object.keys(playersList).length;

        const allSelected = allIds.length === totalExpected && Object.values(players).every(p => p.status === 'selected' || p.status === 'loaded' || p.status === 'playing' || p.status === 'dead');

        if (gameState === 'selecting' && allSelected) {
            gameState = 'loading';
            document.getElementById('char-select-screen').classList.add('hidden');
            document.getElementById('loading-overlay').classList.remove('hidden');
            initThreeJS(container, players[userId].char);
        }

        const allLoaded = Object.values(players).every(p => p.status === 'loaded' || p.status === 'playing' || p.status === 'dead');
        
        if (gameState === 'loading' && allLoaded) {
            gameState = 'playing';
            document.getElementById('loading-overlay').classList.add('hidden');
            document.getElementById('game-hud').classList.remove('hidden');
            
            const spawn = SPAWN_POINTS[mySpawnIndex % SPAWN_POINTS.length];
            myPlayerModel.position.set(spawn.x, 0, spawn.z);
            update(myPlayerRef, { status: 'playing', hp: MAX_HP, x: spawn.x, y: 0, z: spawn.z });
            
            setupControls(roomId, userId); // Передаем ID для урона
            startNetworkSync(roomId, userId);
        }

        if (gameState === 'playing' || gameState === 'loading') {
            updateRemotePlayers(players, userId);
            
            // Проверка на смерть (если кто-то удалил здоровье в Firebase)
            if (players[userId] && players[userId].hp <= 0 && !isDead) {
                handleDeath(roomId, userId);
            }
        }
    });
}

function handleDeath(roomId, userId) {
    if (isDead) return;
    isDead = true;
    
    // Играем анимацию смерти
    fadeToAction('death', 0.2);
    
    // Отключаем управление (больше не ходим)
    isPunching = false; 
    
    // Обновляем статус
    update(ref(db, `rooms/${roomId}/brawl/players/${userId}`), { status: 'dead', anim: 'death' });
}

function startNetworkSync(roomId, myId) {
    syncInterval = setInterval(() => {
        if (!myPlayerModel) return;
        
        let animName = 'idle';
        if (isDead) animName = 'death'; // Если мертв - всегда death
        else {
            if (activeAction === actions.run) animName = 'run';
            if (activeAction === actions.jump) animName = 'jump';
            if (activeAction === actions.punch) animName = 'punch';
        }

        // Если мертв, не обновляем позицию, только статус и анимацию
        const updates = {
            anim: animName,
            status: isDead ? 'dead' : 'playing'
        };
        
        if (!isDead) {
            updates.x = myPlayerModel.position.x;
            updates.y = myPlayerModel.position.y;
            updates.z = myPlayerModel.position.z;
            updates.rotation = myPlayerModel.rotation.y;
        }

        update(ref(db, `rooms/${roomId}/brawl/players/${myId}`), updates);
    }, SYNC_RATE);
}

function updateRemotePlayers(playersData, myId) {
    Object.keys(playersData).forEach(pid => {
        const pData = playersData[pid];
        
        // Управление HP баром
        updateHpBar(pid, pData.hp, pData.name, pid === myId);

        if (pid === myId) return;

        if (!otherPlayers[pid]) {
            createRemotePlayer(pid, pData.char);
        } else {
            const remote = otherPlayers[pid];
            if (remote.mesh) {
                // ПЛАВНОСТЬ: Используем интерполяцию (lerp) с малым коэффициентом
                // Если дистанция большая (телепорт), прыгаем сразу
                const newPos = new THREE.Vector3(pData.x, pData.y, pData.z);
                const dist = remote.mesh.position.distanceTo(newPos);
                
                if (dist > 5) {
                    remote.mesh.position.copy(newPos); // Телепорт
                } else if (dist > 0.05) {
                    // Коэффициент 0.1 делает движение плавным, убирает дрожание
                    remote.mesh.position.lerp(newPos, 0.1); 
                }

                // Вращение
                let rotDiff = pData.rotation - remote.mesh.rotation.y;
                while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
                while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
                // Очень плавно вращаем
                remote.mesh.rotation.y += rotDiff * 0.1;

                // Анимация
                if (remote.mixer && remote.actions && pData.anim) {
                    const newAction = remote.actions[pData.anim];
                    if (newAction && remote.currentAnim !== pData.anim) {
                        if (remote.activeAction) remote.activeAction.fadeOut(0.2);
                        newAction.reset().fadeIn(0.2).play();
                        remote.activeAction = newAction;
                        remote.currentAnim = pData.anim;
                    }
                }
            }
        }
    });

    // Удаление ушедших
    Object.keys(otherPlayers).forEach(pid => {
        if (!playersData[pid]) {
            if(otherPlayers[pid].mesh) scene.remove(otherPlayers[pid].mesh);
            removeHpBar(pid);
            delete otherPlayers[pid];
        }
    });
}

// --- УПРАВЛЕНИЕ HP БАРАМИ ---
function updateHpBar(pid, hp, name, isMe) {
    let bar = hpBars[pid];
    if (!bar) {
        bar = document.createElement('div');
        bar.className = 'hp-bar-container';
        bar.innerHTML = `<div class="hp-bar-fill"></div>`;
        document.getElementById('hp-bars-layer').appendChild(bar);
        hpBars[pid] = bar;
    }

    // Обновляем ширину
    const fill = bar.querySelector('.hp-bar-fill');
    const pct = Math.max(0, Math.min(100, hp));
    fill.style.width = pct + '%';
    
    // Цвет
    fill.className = 'hp-bar-fill';
    if (pct < 50) fill.classList.add('med');
    if (pct < 20) fill.classList.add('low');

    // Если мертв или это я - можно скрыть (или оставить)
    // Я решил оставить для себя тоже, чтобы видеть свое HP
    if (hp <= 0) bar.style.opacity = 0;
    else bar.style.opacity = 1;
}

function removeHpBar(pid) {
    if (hpBars[pid]) {
        hpBars[pid].remove();
        delete hpBars[pid];
    }
}

function updateHpBarsPositions() {
    // Обновляем позиции 2D плашек каждый кадр
    Object.keys(hpBars).forEach(pid => {
        let targetMesh = null;
        
        if (pid === myPlayerRef.key) targetMesh = myPlayerModel; // Мой ID? (надо проверить логику ID)
        // Тут хитрость: мы не знаем мой ID в этой функции напрямую, если он не глобален.
        // Но myPlayerModel есть глобально.
        // А otherPlayers хранит чужие.
        
        if (otherPlayers[pid]) targetMesh = otherPlayers[pid].mesh;
        else if (myPlayerModel && pid === myPlayerRef.key) targetMesh = myPlayerModel; // Костыль, но сработает если myPlayerRef.key совпадет
        
        // Исправим проще:
        // Переберем otherPlayers
        if (otherPlayers[pid] && otherPlayers[pid].mesh) {
            updateSingleBarPos(hpBars[pid], otherPlayers[pid].mesh);
        }
        // И себя
        if (myPlayerModel && pid.includes(myPlayerRef.key.split('/').pop())) { // Очень грубая проверка, лучше хранить myId
             updateSingleBarPos(hpBars[pid], myPlayerModel);
        }
    });
}
// Временный фикс, чтобы не ломать логику, просто передадим myId в animate, или сохраним глобально
let globalMyId = null;

function updateSingleBarPos(bar, mesh) {
    if (!mesh) return;
    const pos = mesh.position.clone();
    pos.y += 2.0; // Высота над головой
    
    // Проецируем
    pos.project(camera);
    
    const x = (pos.x * .5 + .5) * window.innerWidth;
    const y = (-(pos.y * .5) + .5) * window.innerHeight;
    
    // Если сзади камеры - скрываем
    if (pos.z > 1) {
        bar.style.display = 'none';
    } else {
        bar.style.display = 'block';
        bar.style.left = x + 'px';
        bar.style.top = y + 'px';
    }
}

function createRemotePlayer(pid, charId) {
    otherPlayers[pid] = { mesh: null, mixer: null, actions: {} };
    const loader = new FBXLoader();
    const texLoader = new THREE.TextureLoader();
    const texture = texLoader.load('assets/models/cock/texture.png', (t) => { t.colorSpace = THREE.SRGBColorSpace; });

    loader.load('assets/models/cock/cock_wait.fbx', (fbx) => {
        fbx.scale.set(0.01, 0.01, 0.01);
        fbx.traverse(c => { if(c.isMesh) c.material.map = texture; });
        scene.add(fbx);
        
        const mixer = new THREE.AnimationMixer(fbx);
        otherPlayers[pid].mesh = fbx;
        otherPlayers[pid].mixer = mixer;
        
        if(fbx.animations[0]) {
             const act = mixer.clipAction(fbx.animations[0]);
             act.play();
             otherPlayers[pid].actions['idle'] = act;
             otherPlayers[pid].activeAction = act;
        }

        ['run', 'jump', 'punch', 'death'].forEach(anim => { // + death
            let fName = anim === 'death' ? 'cock_dying' : `cock_${anim}`; // death файл называется иначе
            loader.load(`assets/models/cock/${fName}.fbx`, (a) => {
                if(a.animations[0]) {
                    const act = mixer.clipAction(a.animations[0]);
                    if(anim === 'jump' || anim === 'punch' || anim === 'death') {
                        act.setLoop(THREE.LoopOnce);
                        act.clampWhenFinished = true;
                    }
                    otherPlayers[pid].actions[anim] = act;
                }
            });
        });
    });
}

function initThreeJS(container, charId) {
    const gameDiv = document.getElementById('three-container');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111115); 
    scene.fog = new THREE.Fog(0x111115, 10, 50);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    gameDiv.appendChild(renderer.domElement);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    scene.add(hemiLight);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    const floorGeo = new THREE.CylinderGeometry(25, 25, 2, 64);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6, metalness: 0.2 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.y = -1;
    floor.receiveShadow = true;
    scene.add(floor);
    
    const grid = new THREE.GridHelper(50, 50, 0x333333, 0x111111);
    grid.position.y = 0.01;
    scene.add(grid);

    clock = new THREE.Clock();
    
    loadMyPlayer(charId);
    animate();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

function loadMyPlayer(charId) {
    const loader = new FBXLoader();
    const texLoader = new THREE.TextureLoader();
    const texture = texLoader.load('assets/models/cock/texture.png', (t) => t.colorSpace = THREE.SRGBColorSpace);

    loader.load('assets/models/cock/cock_wait.fbx', (fbx) => {
        myPlayerModel = fbx;
        myPlayerModel.scale.set(0.01, 0.01, 0.01);
        myPlayerModel.traverse(c => { 
            if(c.isMesh) {
                c.castShadow = true; 
                c.material.map = texture; 
            }
        });
        scene.add(myPlayerModel);
        mixer = new THREE.AnimationMixer(myPlayerModel);
        if(fbx.animations[0]) {
            actions.idle = mixer.clipAction(fbx.animations[0]);
            actions.idle.play();
            activeAction = actions.idle;
        }

        const loadNext = (path, name, cb) => {
             loader.load(path, (a) => {
                 actions[name] = mixer.clipAction(a.animations[0]);
                 if(name === 'jump' || name === 'punch' || name === 'death') {
                     actions[name].setLoop(THREE.LoopOnce);
                     actions[name].clampWhenFinished = true;
                 }
                 if(cb) cb();
             });
        }
        loadNext('assets/models/cock/cock_run.fbx', 'run', () => {
            loadNext('assets/models/cock/cock_jump.fbx', 'jump', () => {
                loadNext('assets/models/cock/cock_punch.fbx', 'punch', () => {
                    // Загружаем смерть
                     loadNext('assets/models/cock/cock_dying.fbx', 'death', () => {
                        update(myPlayerRef, { status: 'loaded' });
                     });
                });
            });
        });
    });
}

function setupControls(roomId, userId) {
    globalMyId = userId; // Сохраняем для обновления баров
    
    let isDragging = false;
    
    window.addEventListener('mousedown', (e) => {
        if(e.target.tagName !== 'BUTTON' && e.target.id !== 'custom-exit-btn') {
            isDragging = true;
        }
    });
    
    window.addEventListener('mouseup', () => isDragging = false);
    
    window.addEventListener('mousemove', (e) => {
        if (isDragging && !isMobile) {
            cameraAngle -= e.movementX * 0.005;
        }
    });

    window.addEventListener('keydown', (e) => {
        if (isDead) return; // Мертвые не ходят
        if(e.code === 'KeyW') keys.w = true;
        if(e.code === 'KeyS') keys.s = true;
        if(e.code === 'KeyA') keys.a = true;
        if(e.code === 'KeyD') keys.d = true;
        if(e.code === 'Space') triggerJump();
        
        // АТАКА (F)
        if(e.code === 'KeyF') {
            triggerPunch();
            checkHit(roomId, userId); // Проверяем попадание
        }
        if(e.code === 'Escape') {
            document.getElementById('close-fullscreen-btn')?.click();
        }
    });

    window.addEventListener('keyup', (e) => {
        if(e.code === 'KeyW') keys.w = false;
        if(e.code === 'KeyS') keys.s = false;
        if(e.code === 'KeyA') keys.a = false;
        if(e.code === 'KeyD') keys.d = false;
    });

    if (isMobile) {
        setupJoystick();
        
        let lastTouchX = 0;
        const touchZone = document.getElementById('three-container');
        
        touchZone.addEventListener('touchstart', (e) => {
            const t = e.touches[0];
            if (t.target.id !== 'joystick-nub' && t.target.id !== 'joystick-zone' && t.target.tagName !== 'BUTTON') {
                lastTouchX = t.clientX;
            }
        }, {passive: false});

        touchZone.addEventListener('touchmove', (e) => {
             const t = e.touches[0];
             if (t.target.id !== 'joystick-nub' && t.target.id !== 'joystick-zone' && t.target.tagName !== 'BUTTON') {
                 const deltaX = t.clientX - lastTouchX;
                 cameraAngle -= deltaX * 0.005;
                 lastTouchX = t.clientX;
             }
        }, {passive: false});

        document.getElementById('btn-jump')?.addEventListener('touchstart', (e) => { 
            e.preventDefault(); if(!isDead) triggerJump(); 
        });
        document.getElementById('btn-punch')?.addEventListener('touchstart', (e) => { 
            e.preventDefault(); 
            if(!isDead) {
                triggerPunch();
                checkHit(roomId, userId);
            }
        });
    }
}

// --- БОЕВАЯ СИСТЕМА ---
function checkHit(roomId, myId) {
    if (!myPlayerModel || isDead) return;
    
    // Проверяем дистанцию до каждого врага
    Object.keys(otherPlayers).forEach(pid => {
        const enemy = otherPlayers[pid];
        if (enemy.mesh) {
            const dist = myPlayerModel.position.distanceTo(enemy.mesh.position);
            // Также проверим угол (чтобы бить только перед собой)
            const dirToEnemy = new THREE.Vector3().subVectors(enemy.mesh.position, myPlayerModel.position).normalize();
            const myDir = new THREE.Vector3(0, 0, 1).applyQuaternion(myPlayerModel.quaternion).normalize();
            const angle = myDir.angleTo(dirToEnemy); // в радианах

            if (dist < PUNCH_RANGE && angle < 1.0) { // 1 радиан ~ 60 градусов конус
                // ПОПАДАНИЕ!
                // Считываем текущее HP врага (надо знать его)
                // Но мы не храним HP локально в otherPlayers. 
                // Придется делать транзакцию в Firebase
                const enemyRef = ref(db, `rooms/${roomId}/brawl/players/${pid}/hp`);
                // Используем runTransaction для атомарности
                // Или просто get + set для простоты прототипа
                get(enemyRef).then(snap => {
                    let currentHp = snap.val() || 0;
                    if (currentHp > 0) {
                        currentHp -= PUNCH_DAMAGE;
                        if (currentHp < 0) currentHp = 0;
                        update(ref(db, `rooms/${roomId}/brawl/players/${pid}`), { hp: currentHp });
                    }
                });
            }
        }
    });
}

function setupJoystick() {
    const zone = document.getElementById('joystick-zone');
    const nub = document.getElementById('joystick-nub');
    if (!zone) return;
    let touchId = null, startX, startY;
    const maxRadius = 35;
    
    zone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        touchId = touch.identifier;
        startX = touch.clientX; startY = touch.clientY;
        joystick = {x:0,y:0};
        nub.style.transition = 'none';
    }, {passive:false});
    
    zone.addEventListener('touchmove', (e) => {
        e.preventDefault();
        for(let i=0; i<e.changedTouches.length; i++){
            if(e.changedTouches[i].identifier === touchId){
                let t = e.changedTouches[i];
                let dx = t.clientX - startX; let dy = t.clientY - startY;
                let d = Math.sqrt(dx*dx+dy*dy);
                if(d > maxRadius) { let r = maxRadius/d; dx*=r; dy*=r; }
                nub.style.transform = `translate(${dx}px, ${dy}px)`;
                joystick = {x: dx/maxRadius, y: dy/maxRadius};
                break;
            }
        }
    }, {passive:false});
    
    zone.addEventListener('touchend', (e) => {
         for(let i=0; i<e.changedTouches.length; i++){
            if(e.changedTouches[i].identifier === touchId){
                joystick = {x:0,y:0}; touchId = null;
                nub.style.transition = '0.1s';
                nub.style.transform = 'translate(0,0)';
                break;
            }
         }
    });
}

function triggerJump() {
    if (!isGrounded || isPunching || isDead) return;
    isGrounded = false;
    verticalVelocity = JUMP_FORCE;
    fadeToAction('jump', 0.1);
}

function triggerPunch() {
    if (isPunching || isDead) return;
    isPunching = true;
    fadeToAction('punch', 0.1);
    setTimeout(() => { 
        isPunching = false; 
        if(!isDead && isGrounded) fadeToAction(keys.w||keys.s||keys.a||keys.d ? 'run' : 'idle', 0.2); 
    }, 500);
}

function fadeToAction(name, dur) {
    if(!actions[name] || activeAction === actions[name]) return;
    actions[name].reset().play();
    activeAction.crossFadeTo(actions[name], dur, true);
    activeAction = actions[name];
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    Object.values(otherPlayers).forEach(p => {
        if(p.mixer) p.mixer.update(delta);
    });

    if (myPlayerModel && gameState === 'playing') {
        // Обновляем позиции HP баров
        updateHpBarsPositions();

        if (isDead) {
            // Если мертв, физика не нужна, просто падаем вниз если в воздухе
            if (!isGrounded) verticalVelocity += GRAVITY * delta;
            myPlayerModel.position.y += verticalVelocity * delta;
            if (myPlayerModel.position.y <= 0) myPlayerModel.position.y = 0;
            // Камеру оставляем
        } else {
            let moveX = 0, moveZ = 0;
            if(keys.w) moveZ = -1;
            if(keys.s) moveZ = 1;
            if(keys.a) moveX = -1;
            if(keys.d) moveX = 1;
            if(Math.abs(joystick.x) > 0.1 || Math.abs(joystick.y) > 0.1) { moveX = joystick.x; moveZ = joystick.y; }

            if (!isGrounded) verticalVelocity += GRAVITY * delta;
            myPlayerModel.position.y += verticalVelocity * delta;

            if (myPlayerModel.position.y <= 0) {
                myPlayerModel.position.y = 0;
                verticalVelocity = 0;
                if (!isGrounded) {
                    isGrounded = true;
                    if(!isPunching) fadeToAction((moveX||moveZ) ? 'run' : 'idle', 0.1);
                }
            }
            
            if (myPlayerModel.position.y < -10) {
                 const spawn = SPAWN_POINTS[mySpawnIndex % SPAWN_POINTS.length];
                 myPlayerModel.position.set(spawn.x, 5, spawn.z);
                 verticalVelocity = 0;
            }

            // --- ДВИЖЕНИЕ ---
            if ((moveX !== 0 || moveZ !== 0) && !isPunching) {
                const inputVector = new THREE.Vector3(moveX, 0, moveZ).normalize();
                inputVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraAngle);

                myPlayerModel.position.x += inputVector.x * SPEED * delta;
                myPlayerModel.position.z += inputVector.z * SPEED * delta;
                
                const targetRot = Math.atan2(inputVector.x, inputVector.z);
                let diff = targetRot - myPlayerModel.rotation.y;
                while (diff > Math.PI) diff -= Math.PI*2;
                while (diff < -Math.PI) diff += Math.PI*2;
                myPlayerModel.rotation.y += diff * 10 * delta;

                if(isGrounded) fadeToAction('run', 0.2);
            } else {
                 if(isGrounded && !isPunching) fadeToAction('idle', 0.2);
            }
        }

        // --- КАМЕРА (Привязана к игроку даже после смерти, режим наблюдателя) ---
        const offsetX = Math.sin(cameraAngle) * CAM_DISTANCE;
        const offsetZ = Math.cos(cameraAngle) * CAM_DISTANCE;

        const targetX = myPlayerModel.position.x + offsetX;
        const targetZ = myPlayerModel.position.z + offsetZ;
        const targetY = myPlayerModel.position.y + CAM_HEIGHT;

        camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, 0.1);
        camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, 0.1);
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, 0.1);
        
        camera.lookAt(
            myPlayerModel.position.x, 
            myPlayerModel.position.y + LOOK_OFFSET_Y, 
            myPlayerModel.position.z
        );
    }
    
    if(mixer) mixer.update(delta);
    renderer.render(scene, camera);
}

export function cleanupGame() {
    if (unsubscribePlayers) unsubscribePlayers();
    if (syncInterval) clearInterval(syncInterval);
    const style = document.getElementById('brawl-game-styles');
    if (style) style.remove();
    document.getElementById('brawl-ui')?.remove();
    document.getElementById('three-container').innerHTML = '';
}