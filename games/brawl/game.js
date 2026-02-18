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

// Слоты для позиционирования
const slots = [
    { x: 0, z: 0 },      // ЦЕНТР (Слот для меня)
    { x: -2.5, z: 0.5 }, // СЛЕВА (Слот для первого друга)
    { x: 2.5, z: 0.5 },  // СПРАВА (Слот для второго друга)
    { x: 0, z: 2.5 }     // СЗАДИ (Слот для третьего друга)
];

const hologramColors = [0xff4757, 0x2ed573, 0xffa502, 0x5352ed];

function createMinimalStage() {
    const base = new THREE.Mesh(
        new THREE.CylinderGeometry(8, 9, 0.5, 64),
        new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.8 })
    );
    base.position.y = -0.25;
    base.receiveShadow = true;
    lobbyGroup.add(base);

    slots.forEach((slot, i) => {
        const marker = new THREE.Mesh(
            new THREE.CircleGeometry(0.8, 32),
            new THREE.MeshBasicMaterial({ color: i===0 ? 0x6c5ce7 : 0xcccccc, transparent: true, opacity: 0.5 })
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
const myPlayerKey = myPlayerRef.key;

myPlayerRef.set({ 
    name: username, 
    ready: false, 
    character: null,
    x: 0, z: 0, ry: 0, anim: 'Idle'
});
myPlayerRef.onDisconnect().remove();

// --- ИСПРАВЛЕННАЯ ФУНКЦИЯ ПОЗИЦИОНИРОВАНИЯ ---
function updateLobbyPositions() {
    if (gameState.mode === 'GAME') return;

    // 1. Я ВСЕГДА В ЦЕНТРЕ (Слот 0)
    if (player.mesh) {
        player.mesh.position.set(slots[0].x, 0, slots[0].z);
        player.mesh.rotation.y = Math.PI;
    }

    // 2. ВСЕ ОСТАЛЬНЫЕ (Удаленные) занимают слоты 1, 2, 3...
    const remoteKeys = Object.keys(remotePlayers);
    
    remoteKeys.forEach((key, index) => {
        // Берем следующий свободный слот (индекс + 1)
        // Пример: Первый вошедший враг -> Слот 1, Второй -> Слот 2
        const slotIndex = index + 1;
        
        if (slots[slotIndex]) {
            const rp = remotePlayers[key];
            const s = slots[slotIndex];

            // Двигаем голограмму
            if (rp.waitingGroup) {
                rp.targetPos.set(s.x, 0, s.z);
            }
            // Двигаем модель
            if (rp.mesh) {
                rp.targetPos.set(s.x, 0, s.z);
                rp.mesh.position.set(s.x, 0, s.z);
                rp.targetRot = Math.PI;
            }
        }
    });
}

// Добавление игрока
playersRef.on('child_added', (snap) => {
    const key = snap.key;
    if (key === myPlayerKey) return; 

    const data = snap.val();
    
    // Генерируем цвет
    const colorIndex = key.charCodeAt(key.length - 1) % hologramColors.length;
    const color = hologramColors[colorIndex];

    const rp = new RemotePlayer(scene, key, data, color);
    remotePlayers[key] = rp;
    
    updateLobbyPositions();
});

// Обновление
playersRef.on('child_changed', (snap) => {
    const key = snap.key;
    if (key === myPlayerKey) return;
    
    const rp = remotePlayers[key];
    if (rp) {
        if (gameState.mode === 'GAME') {
            rp.updateNetworkData(snap.val());
        } else {
            const d = snap.val();
            rp.updateNetworkData(d); // Загрузит модель, если character появился
            if (d.character && rp.mesh) rp.mesh.visible = true;
        }
    }
});

// Выход
playersRef.on('child_removed', (snap) => {
    const key = snap.key;
    if (remotePlayers[key]) {
        remotePlayers[key].dispose();
        delete remotePlayers[key];
        updateLobbyPositions();
    }
});

// Хост
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
    if(keys.length > 0 && keys.every(k => all[k].ready)) {
        setTimeout(() => roomRef.child('game').update({ state: 'PLAYING' }), 1000);
    }
});

// UI
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
        updateLobbyPositions();
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
    if(player.mesh) {
        player.mesh.position.set(0, 0, 0); 
        player.mesh.rotation.y = Math.PI;
    }
}

// Inputs
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

const clock = new THREE.Clock();
const gameCamDist = 2.3; const gameCamHeight = 2.0;

function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();

    Object.values(remotePlayers).forEach(rp => rp.update(dt));

    if (player.mesh) {
        player.mesh.visible = (gameState.mode === 'GAME') || gameState.isCharSelected || isPreviewing;

        if (gameState.mode === 'GAME') {
            player.update(dt, inputs, cameraAngleY);
            const netData = player.getNetworkData();
            if (netData) myPlayerRef.update(netData);

            const playerPos = player.getPosition();
            const idealX = playerPos.x + gameCamDist * Math.sin(cameraAngleY) * Math.cos(cameraAngleX);
            const idealZ = playerPos.z + gameCamDist * Math.cos(cameraAngleY) * Math.cos(cameraAngleX);
            const idealY = playerPos.y + gameCamDist * Math.sin(cameraAngleX) + gameCamHeight;
            
            camera.position.lerp(new THREE.Vector3(idealX, idealY, idealZ), 0.1);
            camera.lookAt(playerPos.x, playerPos.y + 1.4, playerPos.z);
        } else {
            player.update(dt, emptyInputs, 0); 
            updateLobbyPositions();

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