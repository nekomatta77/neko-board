import { Toaster } from './Toaster.js';
import { RemotePlayer } from './RemotePlayer.js';
import { Lobby } from './ui/Lobby.js';

// --- СОЗДАНИЕ МИНИМАЛИСТИЧНОГО UI ДЛЯ ЛОКАЛЬНОГО ИГРОКА ---
const localUiHTML = `
    <div id="local-ui" style="display:none; position:absolute; top:20px; left:20px; background: rgba(15, 20, 30, 0.4); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border-radius: 40px; padding: 6px 16px 6px 6px; z-index: 100; align-items: center; gap: 12px; border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 8px 32px rgba(0,0,0,0.3); font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
        <div style="position: relative; flex-shrink: 0;">
            <img src="assets/avatars/ava1.png" style="width: 44px; height: 44px; border-radius: 50%; border: 2px solid #00ffcc; box-shadow: 0 0 10px rgba(0, 255, 204, 0.4); object-fit: cover; display: block;">
        </div>
        <div style="display: flex; flex-direction: column; justify-content: center; min-width: 140px; margin-top: -2px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 5px;">
                <span style="color: #ffffff; font-weight: 800; font-size: 13px; letter-spacing: 0.5px; text-shadow: 0 2px 4px rgba(0,0,0,0.8);">TOASTER BOY</span>
                <span id="local-hp-text" style="color: #a0d8ef; font-size: 11px; font-weight: bold; font-family: monospace;">3200 / 3200</span>
            </div>
            <div style="width: 100%; height: 6px; background: rgba(0,0,0,0.6); border-radius: 3px; overflow: hidden; box-shadow: inset 0 1px 2px rgba(0,0,0,0.5);">
                <div id="local-hp-bar" style="width: 100%; height: 100%; background: linear-gradient(90deg, #00e676, #00e5ff); transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 0 8px rgba(0,229,255,0.6);"></div>
            </div>
        </div>
    </div>
`;
document.body.insertAdjacentHTML('beforeend', localUiHTML);

function updateLocalUI(current, max) {
    const bar = document.getElementById('local-hp-bar');
    const text = document.getElementById('local-hp-text');
    if (bar && text) {
        const percent = Math.max(0, (current / max) * 100);
        bar.style.width = percent + '%';
        text.innerText = `${Math.max(0, current)} / ${max}`;
        
        // Меняем цвет на красный, если ХП меньше 30%
        if (percent < 30) {
            bar.style.background = 'linear-gradient(90deg, #ff0055, #ff3333)';
            bar.style.boxShadow = '0 0 8px rgba(255,0,85,0.6)';
        } else {
            bar.style.background = 'linear-gradient(90deg, #00e676, #00e5ff)';
            bar.style.boxShadow = '0 0 8px rgba(0,229,255,0.6)';
        }
    }
}
// ------------------------------------------

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

const hemiLight = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.6);
hemiLight.position.set(0, 50, 0);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(-10, 20, 10);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
scene.add(dirLight);

const lobbyGroup = new THREE.Group();
scene.add(lobbyGroup);

const slots = [
    { x: 0, z: 0 },      
    { x: -2.5, z: 0.5 }, 
    { x: 2.5, z: 0.5 },  
    { x: 0, z: 2.5 }     
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

const gameGroup = new THREE.Group();
scene.add(gameGroup);
gameGroup.visible = false;

const gameGround = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x555555 }));
gameGround.rotation.x = -Math.PI / 2;
gameGround.receiveShadow = true;
gameGroup.add(gameGround);
gameGroup.add(new THREE.GridHelper(200, 200));

const gameState = {
    mode: 'LOBBY',
    isCharSelected: false,
    isReady: false,
    isHost: false
};
let isPreviewing = false;

const loadingManager = new THREE.LoadingManager();
loadingManager.onLoad = () => { 
    document.getElementById('loader').style.display = 'none'; 
};
const player = new Toaster(scene, loadingManager);
player.load();

const remotePlayers = {}; 
const roomRef = db.ref(`rooms/${roomId}`);
const playersRef = roomRef.child('players');
const myPlayerRef = playersRef.push();
const myPlayerKey = myPlayerRef.key; 

myPlayerRef.set({ 
    name: username, 
    ready: false, 
    character: null,
    x: 0, z: 0, ry: 0, anim: 'Idle',
    hp: 3200,
    isDead: false
});
myPlayerRef.onDisconnect().remove();

function updateLobbyPositions() {
    if (gameState.mode === 'GAME') return; 

    const allKeys = [myPlayerKey, ...Object.keys(remotePlayers)].sort();
    const myIndex = allKeys.indexOf(myPlayerKey);
    if (myIndex !== -1 && slots[myIndex]) {
        const s = slots[myIndex];
        if (player.mesh) {
            player.mesh.position.set(s.x, 0, s.z);
            player.mesh.rotation.y = Math.PI; 
        }
    }

    Object.keys(remotePlayers).forEach(key => {
        const index = allKeys.indexOf(key);
        if (index !== -1 && slots[index]) {
            const s = slots[index];
            const rp = remotePlayers[key];
            if (rp.mesh || rp.hologramGroup) {
                rp.targetPos.set(s.x, 0, s.z); 
                if (rp.mesh) rp.mesh.position.set(s.x, 0, s.z);
            }
        }
    });
}

playersRef.on('child_added', (snap) => {
    const key = snap.key;
    if (key === myPlayerKey) return; 

    const data = snap.val();
    const rp = new RemotePlayer(scene, key, data);
    remotePlayers[key] = rp;
    
    updateLobbyPositions(); 
});

playersRef.on('child_changed', (snap) => {
    const key = snap.key;
    const data = snap.val();

    if (key === myPlayerKey) {
        if (data.hp !== undefined && data.hp !== player.hp) {
            player.setHp(data.hp);
            updateLocalUI(player.hp, player.maxHp);
            if (player.isDead) {
                document.getElementById('local-hp-text').innerText = "ПОГИБ";
                document.getElementById('local-hp-text').style.color = "#ff3333";
            }
        }
        return;
    }
    
    const rp = remotePlayers[key];
    if (rp) {
        if (gameState.mode === 'GAME') {
            rp.updateNetworkData(data);
        } else {
            if (data.character) rp.updateNetworkData(data); 
            if (data.anim) rp.playAnim(data.anim);
        }
    }
});

playersRef.on('child_removed', (snap) => {
    const key = snap.key;
    if (remotePlayers[key]) {
        remotePlayers[key].dispose();
        delete remotePlayers[key];
        updateLobbyPositions(); 
    }
});

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

const lobby = new Lobby({
    previewCharacter: (id) => { 
        isPreviewing = true; 
        if (typeof player.setHologram === 'function') player.setHologram(false); 
    },
    hidePreview: () => { 
        isPreviewing = false; 
        if (!gameState.isCharSelected && typeof player.setHologram === 'function') player.setHologram(true); 
    },
    selectCharacter: (id) => {
        isPreviewing = false;
        gameState.isCharSelected = true;
        if (typeof player.setHologram === 'function') player.setHologram(false); 
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
    
    // Включаем наш обновленный стильный боевой UI
    // ВАЖНО: теперь мы используем display: flex
    document.getElementById('local-ui').style.display = 'flex';
    
    if(player.mesh) {
        player.mesh.position.set(0, 0, 0); 
        player.mesh.rotation.y = Math.PI;
    }
}

// --- СИСТЕМА УРОНА ---
function checkHit() {
    const attackRange = 2.5; // Радиус атаки
    const damage = 450;      // Урон Тостера
    const myPos = player.getPosition();

    Object.keys(remotePlayers).forEach(key => {
        const rp = remotePlayers[key];
        if (rp.isDead || rp.isHologram) return; 

        const dist = myPos.distanceTo(rp.targetPos);
        if (dist <= attackRange) {
            const newHp = Math.max(0, rp.hp - damage);
            playersRef.child(key).update({ hp: newHp });
        }
    });
}
// ----------------------

const inputs = { forward: false, backward: false, left: false, right: false, joystick: { angle: 0, active: false } };
const emptyInputs = { forward: false, backward: false, left: false, right: false, joystick: { angle: 0, active: false } };

document.addEventListener('keydown', (e) => {
    if(gameState.mode === 'LOBBY' || player.isDead) return;
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
    if (gameState.mode === 'GAME' && player.mesh && !player.isDead) {
        if (e.target.id !== 'joystick-zone') {
            player.attack();
            setTimeout(checkHit, 300); 
        }
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

    if (player.mesh || player.hologramGroup) {
        if (gameState.mode === 'GAME') {
            player.update(dt, inputs, cameraAngleY);
            
            if (!player.isDead) {
                const netData = player.getNetworkData();
                if (netData) myPlayerRef.update(netData);
            }

            const playerPos = player.getPosition();
            
            let currentCamDist = player.isDead ? 4.0 : gameCamDist;
            let currentCamHeight = player.isDead ? 3.5 : gameCamHeight;

            const idealX = playerPos.x + currentCamDist * Math.sin(cameraAngleY) * Math.cos(cameraAngleX);
            const idealZ = playerPos.z + currentCamDist * Math.cos(cameraAngleY) * Math.cos(cameraAngleX);
            const idealY = playerPos.y + currentCamDist * Math.sin(cameraAngleX) + currentCamHeight;
            
            camera.position.lerp(new THREE.Vector3(idealX, idealY, idealZ), player.isDead ? 0.02 : 0.1);
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
        if (gameState.mode === 'GAME' && e.target.id !== 'joystick-zone' && !player.isDead) {
            player.attack();
            setTimeout(checkHit, 300);
        }
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