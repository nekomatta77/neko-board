import { db, ref, update, onValue, set, remove, get } from '../../js/firebase-config.js';
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { FBXLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/FBXLoader.js';

// Импортируем логику Лобби
import * as Lobby from './lobby.js';

// --- КОНСТАНТЫ ИГРЫ ---
const SPAWN_POINTS = [
    { x: 0, z: 0 }, { x: 5, z: 5 }, { x: -5, z: -5 }, { x: 5, z: -5 }, { x: -5, z: 5 }
];
const GRAVITY = -30;
const JUMP_FORCE = 12;
const SPEED = 6;
const SYNC_RATE = 30; // ms

// Камера Лобби vs Игра
const LOBBY_CAM_POS = { x: 0, y: 3, z: 6 };
const GAME_CAM_DIST = 4.0;
const GAME_CAM_HEIGHT = 2.5;

const MAX_HP = 100;
const PUNCH_DAMAGE = 10;
const PUNCH_RANGE = 2.5;

// --- ПЕРЕМЕННЫЕ ---
let scene, camera, renderer, clock;
let myPlayerModel, mixer; // Мой персонаж (в игре)
let otherPlayers = {};    // Другие персонажи (в игре)
let actions = {};
let activeAction = null;
let hpBars = {};

// Управление
let joystick = { x: 0, y: 0 };
let keys = { w: false, a: false, s: false, d: false, space: false };
let isGrounded = true, verticalVelocity = 0, isPunching = false, isDead = false;
let cameraAngle = Math.PI;

// Состояние
let gameState = 'lobby'; // 'lobby' | 'playing'
let roomRef, myPlayerRef;
let unsubscribePlayers = null;
let syncInterval = null;
let currentMyId = null;

const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || navigator.maxTouchPoints > 0;

// --- CSS ---
function injectStyles() {
    const styleId = 'brawl-main-styles';
    if (document.getElementById(styleId)) return;
    const css = `
        #brawl-ui {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            pointer-events: none; user-select: none; -webkit-user-select: none;
            overflow: hidden; touch-action: none;
            font-family: 'Segoe UI', sans-serif;
        }
        #brawl-ui > * { pointer-events: auto; }
        .hidden { display: none !important; }
        
        /* Стили лобби (из lobby.js) */
        #lobby-status-text {
            position: absolute; top: 20px; width: 100%; text-align: center;
            font-size: 24px; color: white; text-transform: uppercase; letter-spacing: 2px;
            text-shadow: 0 2px 5px black;
        }
        #lobby-ready-btn {
            position: absolute; bottom: 30px; right: 30px;
            padding: 15px 40px; background: #00E676; color: #003300;
            font-size: 20px; font-weight: bold; border: none; border-radius: 10px;
            cursor: pointer; box-shadow: 0 5px 15px rgba(0,0,0,0.5);
        }
        #lobby-ready-btn:disabled { background: #555; color: #888; cursor: not-allowed; }
        
        #char-menu-modal {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.8); z-index: 50;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
        }
        .chars-grid { display: flex; gap: 20px; }
        .char-option {
            width: 120px; height: 120px; border: 2px solid #555; border-radius: 15px;
            background: #222; display: flex; flex-direction: column; align-items: center; justify-content: center;
        }
        .char-option img { width: 80%; height: 80%; object-fit: contain; }
        #click-catcher { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 10; cursor: pointer; }

        /* Игровой HUD */
        .hp-bar-container {
            position: absolute; width: 60px; height: 6px; background: rgba(0,0,0,0.5);
            border-radius: 3px; pointer-events: none; z-index: 5; display: none; transform: translate(-50%, -50%);
        }
        .hp-bar-fill { height: 100%; background: #00E676; border-radius: 3px; width: 100%; }
        .hp-bar-fill.low { background: #ff3d00; }
        
        #custom-exit-btn {
            position: absolute; top: 20px; right: 20px; width: 40px; height: 40px;
            background: rgba(0,0,0,0.5); border-radius: 50%; color: white;
            display: flex; align-items: center; justify-content: center; z-index: 100;
        }
        #joystick-zone { position: absolute; bottom: 50px; left: 50px; width: 120px; height: 120px; background: rgba(255,255,255,0.05); border-radius: 50%; border: 1px solid rgba(255,255,255,0.1); }
        #joystick-nub { position: absolute; top: 50%; left: 50%; width: 50px; height: 50px; background: rgba(255,255,255,0.2); border-radius: 50%; transform: translate(-50%, -50%); }
        #mobile-actions { position: absolute; bottom: 50px; right: 50px; display: flex; gap: 20px; }
        #mobile-actions button { width: 70px; height: 70px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.1); font-size: 28px; color: white; }
    `;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = css;
    document.head.appendChild(style);
}

// --- INIT ---
export function initGame(container, roomId, userId, isHost, playersList) {
    injectStyles();
    currentMyId = userId;

    if (isMobile && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
    }

    roomRef = ref(db, `rooms/${roomId}/brawl`);
    myPlayerRef = ref(db, `rooms/${roomId}/brawl/players/${userId}`);

    // Сброс данных при входе
    set(myPlayerRef, {
        name: playersList[userId].name,
        char: null,
        isReady: false,
        hp: MAX_HP,
        x: 0, y: 0, z: 0, rotation: 0, anim: 'idle'
    });

    // Формируем HTML (Объединяем лобби и игру)
    const lobbyHtml = Lobby.getLobbyHTML();
    const gameHtml = `
        <div id="game-hud" class="hidden">
            <div id="hp-bars-layer"></div>
            ${isMobile ? `
                <div id="custom-exit-btn">✕</div>
                <div id="joystick-zone"><div id="joystick-nub"></div></div>
                <div id="mobile-actions">
                    <button id="btn-jump">🦘</button>
                    <button id="btn-punch">🥊</button>
                </div>
            ` : ''}
        </div>
    `;

    container.innerHTML = `<div id="brawl-ui">${lobbyHtml}${gameHtml}</div><div id="three-container"></div>`;

    // Инициализация UI Лобби
    Lobby.setupLobbyUI(myPlayerRef);
    
    // UI Игры
    const exitBtn = document.getElementById('custom-exit-btn');
    if(exitBtn) exitBtn.onclick = () => document.getElementById('close-fullscreen-btn')?.click();

    // Запуск 3D
    initThreeJS(container);

    // Слушаем базу
    unsubscribePlayers = onValue(ref(db, `rooms/${roomId}/brawl/players`), (snap) => {
        const players = snap.val() || {};
        
        // Логика переключения
        if (gameState === 'lobby') {
            const totalPlayers = Object.keys(playersList).length;
            const currentPlayers = Object.values(players);
            
            // Все ли готовы?
            const allReady = currentPlayers.length === totalPlayers && currentPlayers.every(p => p.isReady);

            if (allReady) {
                transitionToGame(players, userId, roomId);
            } else {
                // Рендер лобби
                Lobby.updateLobbyVisuals(scene, players, userId);
            }
        } else {
            // Рендер игры
            updateGame(players, userId, roomId);
        }
    });
}

// --- TRANSITION ---
function transitionToGame(playersData, myId, roomId) {
    gameState = 'playing';
    
    // Скрываем UI Лобби
    ['lobby-status-text', 'lobby-ready-btn', 'click-catcher'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.style.display = 'none';
    });
    
    // Показываем UI Игры
    document.getElementById('game-hud').classList.remove('hidden');

    // Очищаем 3D объекты лобби
    Lobby.cleanupLobby();
    // Очищаем сцену от моделей лобби (грубый метод, лучше через Lobby.cleanup)
    // Но так как Lobby.updateLobbyVisuals удаляет лишнее, мы просто удалим всё перед стартом
    scene.children.forEach(c => {
        if(c.type === 'Group' || (c.isMesh && c.geometry.type !== 'CylinderGeometry' && c.geometry.type !== 'PlaneGeometry')) {
             // Удаляем персонажей, оставляем пол и свет
             c.visible = false; // Или scene.remove(c) аккуратно
        }
    });
    
    // Спавн игроков
    const sortedIds = Object.keys(playersData).sort();
    
    // Загружаем СВОЕГО персонажа
    const myData = playersData[myId];
    loadGameCharacter(myData.char, (mesh, mx, act) => {
        const idx = sortedIds.indexOf(myId);
        const spawn = SPAWN_POINTS[idx % SPAWN_POINTS.length];
        
        myPlayerModel = mesh;
        mixer = mx;
        actions = act;
        activeAction = actions.idle;
        
        mesh.position.set(spawn.x, 0, spawn.z);
        scene.add(mesh);
        
        // Включаем управление
        setupControls(roomId, myId);
        startNetworkSync(roomId, myId);
    });

    // Загружаем ОСТАЛЬНЫХ
    Object.keys(playersData).forEach(pid => {
        if (pid === myId) return;
        const pData = playersData[pid];
        
        loadGameCharacter(pData.char, (mesh, mx, act) => {
             const idx = sortedIds.indexOf(pid);
             const spawn = SPAWN_POINTS[idx % SPAWN_POINTS.length];
             
             mesh.position.set(spawn.x, 0, spawn.z);
             scene.add(mesh);
             
             otherPlayers[pid] = { 
                 mesh: mesh, mixer: mx, actions: act, 
                 currentAnim: 'idle', activeAction: act.idle 
             };
        });
    });
}

// --- GAME LOGIC ---
function updateGame(playersData, myId, roomId) {
    Object.keys(playersData).forEach(pid => {
        const pData = playersData[pid];
        updateHpBar(pid, pData.hp);

        if (pid === myId) {
             if (pData.hp <= 0 && !isDead) handleDeath(roomId, myId);
             return;
        }

        const remote = otherPlayers[pid];
        if (remote && remote.mesh) {
            // Синхронизация
            const newPos = new THREE.Vector3(pData.x, pData.y, pData.z);
            if (remote.mesh.position.distanceTo(newPos) > 3) remote.mesh.position.copy(newPos);
            else remote.mesh.position.lerp(newPos, 0.3);

            let rotDiff = pData.rotation - remote.mesh.rotation.y;
            while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
            while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
            remote.mesh.rotation.y += rotDiff * 0.3;

            // Анимация
            if (remote.actions && pData.anim) {
                const newAction = remote.actions[pData.anim];
                if (newAction && remote.currentAnim !== pData.anim) {
                    if (remote.activeAction) remote.activeAction.fadeOut(0.15);
                    newAction.reset().fadeIn(0.15).play();
                    remote.activeAction = newAction;
                    remote.currentAnim = pData.anim;
                }
            }
        }
    });
}

function loadGameCharacter(charId, cb) {
    const loader = new FBXLoader();
    const texLoader = new THREE.TextureLoader();
    const texture = texLoader.load('assets/models/cock/texture.png', (t) => t.colorSpace = THREE.SRGBColorSpace);

    loader.load('assets/models/cock/cock_wait.fbx', (fbx) => {
        fbx.scale.set(0.01, 0.01, 0.01);
        fbx.traverse(c => { if(c.isMesh) { c.castShadow = true; c.material.map = texture; }});
        
        const mixer = new THREE.AnimationMixer(fbx);
        const actions = {};
        
        if(fbx.animations[0]) {
             const act = mixer.clipAction(fbx.animations[0]);
             act.play();
             actions['idle'] = act;
        }

        ['run', 'jump', 'punch', 'death'].forEach(anim => {
            let fName = anim === 'death' ? 'cock_dying' : `cock_${anim}`;
            loader.load(`assets/models/cock/${fName}.fbx`, (a) => {
                if(a.animations[0]) {
                    const act = mixer.clipAction(a.animations[0]);
                    if(anim !== 'run') { act.setLoop(THREE.LoopOnce); act.clampWhenFinished = true; }
                    actions[anim] = act;
                }
            });
        });
        
        // Ждем небольшую задержку, чтобы анимации прогрузились, или сразу отдаем
        // (В идеале нужен Promise.all, но для простоты так)
        setTimeout(() => cb(fbx, mixer, actions), 500);
    });
}

function startNetworkSync(roomId, myId) {
    syncInterval = setInterval(() => {
        if (!myPlayerModel) return;
        let animName = 'idle';
        if (isDead) animName = 'death';
        else {
            if (activeAction === actions.run) animName = 'run';
            if (activeAction === actions.jump) animName = 'jump';
            if (activeAction === actions.punch) animName = 'punch';
        }

        const updates = { anim: animName, status: isDead ? 'dead' : 'playing' };
        if (!isDead) {
            updates.x = myPlayerModel.position.x;
            updates.y = myPlayerModel.position.y;
            updates.z = myPlayerModel.position.z;
            updates.rotation = myPlayerModel.rotation.y;
        }
        update(ref(db, `rooms/${roomId}/brawl/players/${myId}`), updates);
    }, SYNC_RATE);
}

function handleDeath(roomId, userId) {
    isDead = true;
    fadeToAction('death', 0.2);
    isPunching = false;
    update(ref(db, `rooms/${roomId}/brawl/players/${userId}`), { status: 'dead', anim: 'death' });
}

// --- STANDARD MECHANICS (Controls, Physics, Animate) ---
function setupControls(roomId, userId) {
    let isDragging = false;
    window.addEventListener('mousedown', (e) => { 
        if(e.target.tagName !== 'BUTTON') isDragging = true; 
    });
    window.addEventListener('mouseup', () => isDragging = false);
    window.addEventListener('mousemove', (e) => {
        if (isDragging && !isMobile) cameraAngle -= e.movementX * 0.005;
    });

    window.addEventListener('keydown', (e) => {
        if (isDead) return;
        if(e.code === 'KeyW') keys.w = true;
        if(e.code === 'KeyS') keys.s = true;
        if(e.code === 'KeyA') keys.a = true;
        if(e.code === 'KeyD') keys.d = true;
        if(e.code === 'Space') triggerJump();
        if(e.code === 'KeyF') { triggerPunch(); checkHit(roomId); }
        if(e.code === 'Escape') document.getElementById('close-fullscreen-btn')?.click();
    });
    window.addEventListener('keyup', (e) => {
        if(e.code === 'KeyW') keys.w = false;
        if(e.code === 'KeyS') keys.s = false;
        if(e.code === 'KeyA') keys.a = false;
        if(e.code === 'KeyD') keys.d = false;
    });

    if(isMobile) setupMobileControls(roomId);
}

function setupMobileControls(roomId) {
    // Joystick logic copy-paste from previous version (standard implementation)
    const zone = document.getElementById('joystick-zone');
    const nub = document.getElementById('joystick-nub');
    if (!zone) return;
    let touchId = null, startX, startY; const maxRadius = 35;
    
    zone.addEventListener('touchstart', (e) => { e.preventDefault(); const t = e.changedTouches[0]; touchId = t.identifier; startX = t.clientX; startY = t.clientY; joystick = {x:0,y:0}; nub.style.transition = 'none'; }, {passive:false});
    zone.addEventListener('touchmove', (e) => { e.preventDefault(); for(let i=0; i<e.changedTouches.length; i++){ if(e.changedTouches[i].identifier === touchId){ let t = e.changedTouches[i]; let dx = t.clientX - startX; let dy = t.clientY - startY; let d = Math.sqrt(dx*dx+dy*dy); if(d > maxRadius) { let r = maxRadius/d; dx*=r; dy*=r; } nub.style.transform = `translate(${dx}px, ${dy}px)`; joystick = {x: dx/maxRadius, y: dy/maxRadius}; break; } } }, {passive:false});
    zone.addEventListener('touchend', (e) => { for(let i=0; i<e.changedTouches.length; i++){ if(e.changedTouches[i].identifier === touchId){ joystick = {x:0,y:0}; touchId = null; nub.style.transition = '0.1s'; nub.style.transform = 'translate(0,0)'; break; } } });

    // Touch camera rotation
    let lastX = 0;
    document.getElementById('three-container').addEventListener('touchmove', (e) => {
        const t = e.touches[0];
        if (t.target.id !== 'joystick-nub' && t.target.tagName !== 'BUTTON') {
             const delta = t.clientX - lastX;
             cameraAngle -= delta * 0.005;
             lastX = t.clientX;
        }
    });
    document.getElementById('three-container').addEventListener('touchstart', (e) => { lastX = e.touches[0].clientX; });

    document.getElementById('btn-jump')?.addEventListener('touchstart', (e) => { e.preventDefault(); if(!isDead) triggerJump(); });
    document.getElementById('btn-punch')?.addEventListener('touchstart', (e) => { e.preventDefault(); if(!isDead) { triggerPunch(); checkHit(roomId); } });
}

function checkHit(roomId) {
    // Simple hit check
    Object.keys(otherPlayers).forEach(pid => {
        const enemy = otherPlayers[pid];
        if (enemy.mesh && myPlayerModel) {
             const dist = myPlayerModel.position.distanceTo(enemy.mesh.position);
             if (dist < PUNCH_RANGE) {
                 const refHp = ref(db, `rooms/${roomId}/brawl/players/${pid}/hp`);
                 get(refHp).then(s => {
                     let hp = s.val() || 0;
                     if (hp > 0) update(ref(db, `rooms/${roomId}/brawl/players/${pid}`), { hp: Math.max(0, hp - PUNCH_DAMAGE) });
                 });
             }
        }
    });
}

function triggerJump() { isGrounded = false; verticalVelocity = JUMP_FORCE; fadeToAction('jump', 0.1); }
function triggerPunch() { isPunching = true; fadeToAction('punch', 0.1); setTimeout(() => { isPunching = false; if(!isDead) fadeToAction(keys.w||keys.s||keys.a||keys.d ? 'run' : 'idle', 0.2); }, 500); }
function fadeToAction(name, dur) { if(!actions[name] || activeAction === actions[name]) return; actions[name].reset().play(); activeAction.crossFadeTo(actions[name], dur, true); activeAction = actions[name]; }

function updateHpBar(pid, hp) {
    let bar = hpBars[pid];
    if (!bar) {
        bar = document.createElement('div');
        bar.className = 'hp-bar-container';
        bar.innerHTML = '<div class="hp-bar-fill"></div>';
        document.getElementById('hp-bars-layer').appendChild(bar);
        hpBars[pid] = bar;
    }
    const pct = Math.max(0, Math.min(100, hp));
    bar.querySelector('.hp-bar-fill').style.width = pct + '%';
    if(hp <= 0) bar.style.opacity = 0; else bar.style.opacity = 1;
    
    // Position Update
    let target = null;
    if (pid === currentMyId && myPlayerModel) target = myPlayerModel;
    else if (otherPlayers[pid]) target = otherPlayers[pid].mesh;
    
    if (target) {
        const pos = target.position.clone();
        pos.y += 2.2; pos.project(camera);
        const x = (pos.x * .5 + .5) * window.innerWidth;
        const y = (-(pos.y * .5) + .5) * window.innerHeight;
        if(pos.z > 1) bar.style.display = 'none';
        else { bar.style.display = 'block'; bar.style.left = x + 'px'; bar.style.top = y + 'px'; }
    }
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (gameState === 'lobby') {
        Lobby.animateLobby(delta);
    } 
    else if (gameState === 'playing') {
        if (mixer) mixer.update(delta);
        Object.values(otherPlayers).forEach(p => { if(p.mixer) p.mixer.update(delta); });
        
        // Physics & Movement (My Player)
        if (myPlayerModel && !isDead) {
            let moveX = 0, moveZ = 0;
            if(keys.w) moveZ = -1; if(keys.s) moveZ = 1; if(keys.a) moveX = -1; if(keys.d) moveX = 1;
            if(Math.abs(joystick.x) > 0.1 || Math.abs(joystick.y) > 0.1) { moveX = joystick.x; moveZ = joystick.y; }

            if (!isGrounded) verticalVelocity += GRAVITY * delta;
            myPlayerModel.position.y += verticalVelocity * delta;
            if (myPlayerModel.position.y <= 0) {
                myPlayerModel.position.y = 0; verticalVelocity = 0;
                if (!isGrounded) { isGrounded = true; if(!isPunching) fadeToAction('idle', 0.1); }
            }

            if ((moveX !== 0 || moveZ !== 0) && !isPunching) {
                const input = new THREE.Vector3(moveX, 0, moveZ).normalize();
                input.applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraAngle);
                myPlayerModel.position.addScaledVector(input, SPEED * delta);
                
                const targetRot = Math.atan2(input.x, input.z);
                let diff = targetRot - myPlayerModel.rotation.y;
                while (diff > Math.PI) diff -= Math.PI*2; while (diff < -Math.PI) diff += Math.PI*2;
                myPlayerModel.rotation.y += diff * 10 * delta;
                
                if(isGrounded) fadeToAction('run', 0.2);
            } else {
                 if(isGrounded && !isPunching) fadeToAction('idle', 0.2);
            }
        }
        
        // Camera Follow
        if (myPlayerModel) {
            const offX = Math.sin(cameraAngle) * GAME_CAM_DIST;
            const offZ = Math.cos(cameraAngle) * GAME_CAM_DIST;
            const targetPos = new THREE.Vector3(
                myPlayerModel.position.x + offX,
                myPlayerModel.position.y + GAME_CAM_HEIGHT,
                myPlayerModel.position.z + offZ
            );
            camera.position.lerp(targetPos, 0.1);
            camera.lookAt(myPlayerModel.position.x, myPlayerModel.position.y + 1.8, myPlayerModel.position.z);
        }
    }
    
    renderer.render(scene, camera);
}

function initThreeJS(container) {
    const div = document.getElementById('three-container');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111115);
    scene.fog = new THREE.Fog(0x111115, 10, 50);

    // Старт камеры (Лобби)
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(LOBBY_CAM_POS.x, LOBBY_CAM_POS.y, LOBBY_CAM_POS.z);
    camera.lookAt(0, 1, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    div.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(10, 20, 10);
    dir.castShadow = true;
    scene.add(dir);

    const floor = new THREE.Mesh(new THREE.CylinderGeometry(25, 25, 2, 64), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    floor.position.y = -1; floor.receiveShadow = true;
    scene.add(floor);

    clock = new THREE.Clock();
    animate();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

export function cleanupGame() {
    if (unsubscribePlayers) unsubscribePlayers();
    if (syncInterval) clearInterval(syncInterval);
    Lobby.cleanupLobby();
    const s = document.getElementById('brawl-main-styles'); if(s) s.remove();
    document.getElementById('brawl-ui')?.remove();
    document.getElementById('three-container').innerHTML = '';
}