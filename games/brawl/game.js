import { Toaster } from './Toaster.js';
import { RemotePlayer } from './RemotePlayer.js';
import { Lobby } from './ui/Lobby.js';

// --- FIREBASE CONFIG ---
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
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();

const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');
const username = urlParams.get('user') || 'Player';

// --- SCENE ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa0d8ef);
scene.fog = new THREE.Fog(0xa0d8ef, 15, 60); 

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
document.body.appendChild(renderer.domElement);

// --- LIGHTS ---
const hemiLight = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.6);
hemiLight.position.set(0, 50, 0);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(-10, 20, 10);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
scene.add(dirLight);

// --- LOBBY STAGE ---
const lobbyGroup = new THREE.Group();
scene.add(lobbyGroup);

// Координаты слотов (где стоят игроки)
const slots = [
    { x: 0, z: 0 },      // 1. Хост (Центр)
    { x: -2.5, z: 0.5 }, // 2. Игрок (Слева)
    { x: 2.5, z: 0.5 },  // 3. Игрок (Справа)
    { x: 0, z: 2.5 }     // 4. Игрок (Сзади)
];

function createMinimalStage() {
    const base = new THREE.Mesh(
        new THREE.CylinderGeometry(8, 9, 0.5, 64),
        new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.8 })
    );
    base.position.y = -0.25;
    base.receiveShadow = true;
    lobbyGroup.add(base);

    slots.forEach((slot) => {
        const marker = new THREE.Mesh(
            new THREE.CircleGeometry(0.8, 32),
            new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.5 })
        );
        marker.rotation.x = -Math.PI / 2;
        marker.position.set(slot.x, 0.01, slot.z);
        lobbyGroup.add(marker);
    });
}
createMinimalStage();

// --- GAME WORLD ---
const gameGroup = new THREE.Group();
scene.add(gameGroup);
gameGroup.visible = false;

const gameGround = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x555555 }));
gameGround.rotation.x = -Math.PI / 2;
gameGround.receiveShadow = true;
gameGroup.add(gameGround);
gameGroup.add(new THREE.GridHelper(200, 200));

// --- STATE ---
const gameState = {
    mode: 'LOBBY',
    isCharSelected: false,
    isReady: false,
    isHost: false
};
let isPreviewing = false;

// --- LOCAL PLAYER ---
const loadingManager = new THREE.LoadingManager();
loadingManager.onLoad = () => { document.getElementById('loader').style.display = 'none'; };
const player = new Toaster(scene, loadingManager);
player.load();
player.meshVisible = false;

// --- MULTIPLAYER ---
const remotePlayers = {}; 
const roomRef = db.ref(`rooms/${roomId}`);
const playersRef = roomRef.child('players');
const myPlayerRef = playersRef.push();
const myPlayerKey = myPlayerRef.key; // Наш уникальный ID

// 1. Вход в комнату
myPlayerRef.set({ 
    name: username, 
    ready: false, 
    character: null,
    x: 0, z: 0, ry: 0, anim: 'Idle'
});
myPlayerRef.onDisconnect().remove();

// Функция распределения мест в лобби
function updateLobbyPositions() {
    if (gameState.mode === 'GAME') return; // В игре позиция свободная

    // Получаем все ключи игроков (включая нас) и сортируем их
    // Тот, кто зашел раньше - будет первым в списке
    const allKeys = [myPlayerKey, ...Object.keys(remotePlayers)].sort();
    
    // Находим свой индекс
    const myIndex = allKeys.indexOf(myPlayerKey);
    if (myIndex !== -1 && slots[myIndex]) {
        // Ставим себя на слот
        const s = slots[myIndex];
        if (player.mesh) {
            player.mesh.position.set(s.x, 0, s.z);
            player.mesh.rotation.y = 0; // Смотрим в камеру
        }
    }

    // Расставляем остальных
    Object.keys(remotePlayers).forEach(key => {
        const index = allKeys.indexOf(key);
        if (index !== -1 && slots[index]) {
            const s = slots[index];
            const rp = remotePlayers[key];
            // Принудительно ставим на слот (игнорируя данные из сети в лобби)
            if (rp.mesh) {
                rp.targetPos.set(s.x, 0, s.z); 
                rp.mesh.position.set(s.x, 0, s.z);
                rp.targetRot = 0;
            }
        }
    });
}

// 2. Добавление игрока
playersRef.on('child_added', (snap) => {
    const key = snap.key;
    // ГЛАВНОЕ ИСПРАВЛЕНИЕ: Не создаем RemotePlayer для себя!
    if (key === myPlayerKey) return; 

    const data = snap.val();
    const rp = new RemotePlayer(scene, key, data);
    remotePlayers[key] = rp;
    
    updateLobbyPositions(); // Пересчитать места
});

// 3. Обновление данных
playersRef.on('child_changed', (snap) => {
    const key = snap.key;
    if (key === myPlayerKey) return;
    
    const rp = remotePlayers[key];
    if (rp) {
        // В режиме ИГРЫ обновляем позицию из сети
        if (gameState.mode === 'GAME') {
            rp.updateNetworkData(snap.val());
        } else {
            // В ЛОББИ обновляем только скин и анимацию (позицию держим слотом)
            const d = snap.val();
            if (d.character && rp.mesh) rp.mesh.visible = true;
            if (d.anim) rp.playAnim(d.anim);
        }
        
        // Показать модель, если выбрали героя
        if (snap.val().character && rp.mesh) {
            rp.mesh.visible = true; 
        }
    }
});

// 4. Выход игрока
playersRef.on('child_removed', (snap) => {
    const key = snap.key;
    if (remotePlayers[key]) {
        remotePlayers[key].dispose();
        delete remotePlayers[key];
        updateLobbyPositions(); // Кто-то ушел, сдвигаемся (опционально)
    }
});

// 5. Логика Хоста
roomRef.once('value').then(snap => {
    if(snap.val() && snap.val().host === username) {
        gameState.isHost = true;
        roomRef.onDisconnect().remove();
    }
});
roomRef.child('game/state').on('value', snap => {
    if(snap.val() === 'PLAYING') startGame();
});
roomRef.child('players').on('value', snap => {
    if(!gameState.isHost || gameState.mode === 'GAME') return;
    const all = snap.val();
    if(!all) return;
    const keys = Object.keys(all);
    // Ждем готовности всех
    if(keys.length > 0 && keys.every(k => all[k].ready)) {
        setTimeout(() => roomRef.child('game').update({ state: 'PLAYING' }), 1000);
    }
});


// --- UI LOBBY ---
const lobby = new Lobby({
    previewCharacter: (id) => { isPreviewing = true; if(player.mesh) player.mesh.visible = true; },
    hidePreview: () => { 
        isPreviewing = false; 
        if (!gameState.isCharSelected && player.mesh) player.mesh.visible = false; 
    },
    selectCharacter: (id) => {
        isPreviewing = false;
        gameState.isCharSelected = true;
        if(player.mesh) player.mesh.visible = true;
        myPlayerRef.update({ character: id });
        updateLobbyPositions(); // Убедиться, что стоим на месте
    },
    rotatePlayerInLobby: (delta) => { if(player.mesh) player.mesh.rotation.y += delta; },
    setPlayerReady: () => { gameState.isReady = true; myPlayerRef.update({ ready: true }); },
    get isCharacterSelected() { return gameState.isCharSelected; }
});

function startGame() {
    if(gameState.mode === 'GAME') return;
    gameState.mode = 'GAME';
    lobbyGroup.visible = false;
    gameGroup.visible = true;
    document.getElementById('ui-layer').style.display = 'none';
    
    // Сброс позиции для старта игры (все в центр или на спавн-поинты)
    if(player.mesh) {
        player.mesh.position.set(0, 0, 0); 
        player.mesh.rotation.y = Math.PI;
    }
}

// --- INPUTS & ATTACK ---
const inputs = { forward: false, backward: false, left: false, right: false, joystick: { angle: 0, active: false } };
const emptyInputs = { forward: false, backward: false, left: false, right: false, joystick: { angle: 0, active: false } };

document.addEventListener('keydown', (e) => {
    if(gameState.mode === 'LOBBY') return;
    if(e.code === 'KeyW') inputs.forward = true;
    if(e.code === 'KeyS') inputs.backward = true;
    if(e.code === 'KeyA') inputs.left = true;
    if(e.code === 'KeyD') inputs.right = true;
});
document.addEventListener('keyup', (e) => {
    if(e.code === 'KeyW') inputs.forward = false;
    if(e.code === 'KeyS') inputs.backward = false;
    if(e.code === 'KeyA') inputs.left = false;
    if(e.code === 'KeyD') inputs.right = false;
});

document.addEventListener('click', (e) => {
    if (gameState.mode === 'GAME' && player.mesh) {
        if (e.target.id !== 'joystick-zone') player.attack();
    }
});

let cameraAngleY = 0; let cameraAngleX = 0.05; let isMouseDown = false;
document.addEventListener('mousedown', () => isMouseDown = true);
document.addEventListener('mouseup', () => isMouseDown = false);
document.addEventListener('mousemove', (e) => {
    if(isPreviewing) return;
    if (isMouseDown) {
        cameraAngleY -= e.movementX * 0.005;
        cameraAngleX -= e.movementY * 0.005;
        cameraAngleX = Math.max(-0.6, Math.min(0.6, cameraAngleX));
    }
});

// --- GAME LOOP ---
const clock = new THREE.Clock();
const gameCamDist = 2.3; const gameCamHeight = 2.0;

function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();

    // Обновляем удаленных
    Object.values(remotePlayers).forEach(rp => rp.update(dt));

    if (player.mesh) {
        player.mesh.visible = (gameState.mode === 'GAME') || gameState.isCharSelected || isPreviewing;

        if (gameState.mode === 'GAME') {
            // === GAME MODE ===
            player.update(dt, inputs, cameraAngleY);
            
            // Отправляем данные (только если двигаемся или атакуем, для экономии можно добавить проверки)
            const netData = player.getNetworkData();
            if (netData) myPlayerRef.update(netData);

            // Камера
            const playerPos = player.getPosition();
            const idealX = playerPos.x + gameCamDist * Math.sin(cameraAngleY) * Math.cos(cameraAngleX);
            const idealZ = playerPos.z + gameCamDist * Math.cos(cameraAngleY) * Math.cos(cameraAngleX);
            const idealY = playerPos.y + gameCamDist * Math.sin(cameraAngleX) + gameCamHeight;
            
            camera.position.lerp(new THREE.Vector3(idealX, idealY, idealZ), 0.1);
            camera.lookAt(playerPos.x, playerPos.y + 1.4, playerPos.z);

        } else {
            // === LOBBY MODE ===
            player.update(dt, emptyInputs, 0);
            
            // Постоянно держим позицию слота в лобби
            updateLobbyPositions();

            // Камера Лобби
            const playerPos = player.getPosition();
            let targetX = playerPos.x, targetZ, targetY;
            
            if (isPreviewing) {
                targetZ = playerPos.z - 3; targetY = playerPos.y + 1.4;
            } else {
                targetZ = playerPos.z - 4.5; targetY = playerPos.y + 2 + Math.sin(Date.now()*0.0005)*0.2;
            }
            
            camera.position.lerp(new THREE.Vector3(targetX, targetY, targetZ), 0.08);
            camera.lookAt(playerPos.x, playerPos.y + 1.1, playerPos.z);
        }
    }
    renderer.render(scene, camera);
}

// Mobile controls...
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
if (isMobile) {
    const manager = nipplejs.create({ zone: document.getElementById('joystick-zone'), mode: 'static', position: { left: '50%', top: '50%' }, color: 'white', size: 100 });
    manager.on('move', (evt, data) => { inputs.joystick.active = true; inputs.joystick.angle = data.angle.radian; });
    manager.on('end', () => inputs.joystick.active = false);
    
    document.addEventListener('touchstart', (e) => {
        if (gameState.mode === 'GAME' && e.target.id !== 'joystick-zone') player.attack();
    });
    
    const touchZone = document.getElementById('touch-rotate-zone'); let lastX;
    touchZone.addEventListener('touchstart', e => { lastX = e.touches[0].clientX; });
    touchZone.addEventListener('touchmove', e => { 
        if(isPreviewing) return; 
        e.preventDefault(); 
        const dx = e.touches[0].clientX - lastX; 
        cameraAngleY -= dx * 0.01; 
        lastX = e.touches[0].clientX; 
    });
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
window.exitGame = function() { window.location.href = '../../index.html'; };

animate();