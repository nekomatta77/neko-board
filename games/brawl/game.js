import { Toaster } from './Toaster.js';
import { RemotePlayer } from './RemotePlayer.js';
import { Lobby } from './ui/Lobby.js';

const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

const exitBtn = document.getElementById('exit-btn');
if (exitBtn) {
    exitBtn.style.background = 'transparent';
    exitBtn.style.border = 'none';
    exitBtn.style.boxShadow = 'none';
    exitBtn.style.color = 'white';
    exitBtn.style.fontSize = '28px';
    exitBtn.style.textShadow = '0 2px 4px rgba(0,0,0,0.8)';
    exitBtn.style.zIndex = '10000';
}

const localUiHTML = `
    <div id="orientation-warning" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:#111; color:white; z-index:99999; flex-direction:column; justify-content:center; align-items:center; text-align:center; font-family:sans-serif;">
        <div style="font-size: 60px; transform: rotate(-90deg); margin-bottom: 20px;">📱</div>
        <h2 style="margin:0 10px;">Пожалуйста, переверните устройство</h2>
        <p style="color:#aaa; margin-top:10px;">Игра предназначена только для горизонтального (Landscape) режима</p>
    </div>

    <div id="lobby-settings" style="display:none; position:absolute; top:20px; right:20px; z-index:200;">
        <button id="btn-settings" style="width:45px; height:45px; border-radius:50%; background:rgba(0,0,0,0.5); border:1px solid rgba(255,255,255,0.2); color:white; font-size:20px; pointer-events:auto; backdrop-filter:blur(5px);">⚙️</button>
        <div id="settings-panel" style="display:none; position:absolute; top:55px; right:0px; background:rgba(15,20,30,0.9); padding:15px; border-radius:15px; border:1px solid rgba(255,255,255,0.1); color:white; pointer-events:auto; font-family:sans-serif; backdrop-filter:blur(10px);">
            <div style="font-size:14px; margin-bottom:10px;">Прозрачность кнопок:</div>
            <input type="range" id="opacity-slider" min="0.1" max="1" step="0.1" value="0.7">
        </div>
    </div>

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

    <div id="mobile-hud" style="display:none; position:absolute; inset:0; pointer-events:none; z-index:200;">
        <div id="action-buttons" style="position:absolute; bottom:30px; right:30px; width:180px; height:180px; opacity:0.7; pointer-events:auto; transition: opacity 0.2s;">
            <button id="btn-jump" style="position:absolute; bottom:0; right:0; width:85px; height:85px; border-radius:50%; background:rgba(50,200,50,0.5); border:3px solid rgba(100,255,100,0.8); color:white; font-size:35px; box-shadow:0 0 15px rgba(50,200,50,0.5);">🔼</button>
            
            <button id="btn-ability" style="position:absolute; bottom:15px; right:110px; width:75px; height:75px; border-radius:50%; background:rgba(50,150,255,0.3); border:2px solid rgba(100,200,255,0.8); color:white; font-size:24px; display:flex; align-items:center; justify-content:center; outline:none; -webkit-tap-highlight-color:transparent;">
                <div id="ability-thumb" style="width:28px; height:28px; background:rgba(255,255,255,0.8); border-radius:50%; box-shadow:0 2px 5px rgba(0,0,0,0.5); position:absolute; pointer-events:none; transition: transform 0.15s ease-out;"></div>
                <span style="position:absolute; pointer-events:none; text-shadow: 1px 1px 2px black;">🍞</span>
                <div id="ability-cd-overlay" style="display:none; position:absolute; top:0; left:0; width:100%; height:100%; border-radius:50%; background:rgba(0,0,0,0.7); color:white; font-weight:bold; font-size:24px; align-items:center; justify-content:center;"></div>
            </button>
            <button id="btn-ult" style="position:absolute; bottom:95px; right:85px; width:65px; height:65px; border-radius:50%; background:rgba(255,200,0,0.5); border:2px solid rgba(255,255,100,0.8); color:white; font-size:24px;">🔥</button>
        </div>
    </div>
`;
document.body.insertAdjacentHTML('beforeend', localUiHTML);

if (isMobile) {
    document.getElementById('local-ui').style.transform = 'scale(0.8)';
    document.getElementById('local-ui').style.transformOrigin = 'top left';
    document.getElementById('lobby-settings').style.display = 'block';

    function checkOrientation() {
        const warning = document.getElementById('orientation-warning');
        if (window.innerHeight > window.innerWidth) warning.style.display = 'flex';
        else warning.style.display = 'none';
    }
    window.addEventListener('resize', checkOrientation);
    checkOrientation(); 
}

function updateLocalUI(current, max) {
    const bar = document.getElementById('local-hp-bar');
    const text = document.getElementById('local-hp-text');
    if (bar && text) {
        const percent = Math.max(0, (current / max) * 100);
        bar.style.width = percent + '%';
        text.innerText = `${Math.max(0, current)} / ${max}`;
        
        if (percent < 30) {
            bar.style.background = 'linear-gradient(90deg, #ff0055, #ff3333)';
            bar.style.boxShadow = '0 0 8px rgba(255,0,85,0.6)';
        } else {
            bar.style.background = 'linear-gradient(90deg, #00e676, #00e5ff)';
            bar.style.boxShadow = '0 0 8px rgba(0,229,255,0.6)';
        }
    }
}

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

const slots = [{ x: 0, z: 0 }, { x: -2.5, z: 0.5 }, { x: 2.5, z: 0.5 }, { x: 0, z: 2.5 }];

function createMinimalStage() {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(8, 9, 0.5, 64), new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.8 }));
    base.position.y = -0.25;
    base.receiveShadow = true;
    lobbyGroup.add(base);

    slots.forEach((slot) => {
        const marker = new THREE.Mesh(new THREE.CircleGeometry(0.8, 32), new THREE.MeshBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.5 }));
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

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

const gameState = { mode: 'LOBBY', isCharSelected: false, isReady: false, isHost: false };
let isPreviewing = false;

const loadingManager = new THREE.LoadingManager();
loadingManager.onLoad = () => { document.getElementById('loader').style.display = 'none'; };
const player = new Toaster(scene, loadingManager);
player.load();

const remotePlayers = {}; 
const roomRef = db.ref(`rooms/${roomId}`);
const playersRef = roomRef.child('players');
const myPlayerRef = playersRef.push();
const myPlayerKey = myPlayerRef.key; 

player.setGameContext(remotePlayers, playersRef);

myPlayerRef.set({ name: username, ready: false, character: null, x: 0, z: 0, ry: 0, anim: 'Idle', hp: 3200, isDead: false });
myPlayerRef.onDisconnect().remove();

function updateLobbyPositions() {
    if (gameState.mode === 'GAME') return; 
    const allKeys = [myPlayerKey, ...Object.keys(remotePlayers)].sort();
    const myIndex = allKeys.indexOf(myPlayerKey);
    if (myIndex !== -1 && slots[myIndex] && player.mesh) {
        player.mesh.position.set(slots[myIndex].x, 0, slots[myIndex].z);
        player.mesh.rotation.y = Math.PI; 
    }
    Object.keys(remotePlayers).forEach(key => {
        const index = allKeys.indexOf(key);
        if (index !== -1 && slots[index] && remotePlayers[key]) {
            const rp = remotePlayers[key];
            if (rp.mesh || rp.hologramGroup) {
                rp.targetPos.set(slots[index].x, 0, slots[index].z); 
                if (rp.mesh) rp.mesh.position.set(slots[index].x, 0, slots[index].z);
            }
        }
    });
}

playersRef.on('child_added', (snap) => {
    if (snap.key === myPlayerKey) return; 
    remotePlayers[snap.key] = new RemotePlayer(scene, snap.key, snap.val());
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
                myPlayerRef.update({ isDead: true });
                document.getElementById('local-hp-text').innerText = "ПОГИБ";
                document.getElementById('local-hp-text').style.color = "#ff3333";
            }
        }
        return;
    }
    
    const rp = remotePlayers[key];
    if (rp) {
        if (gameState.mode === 'GAME') rp.updateNetworkData(data);
        else {
            if (data.character) rp.updateNetworkData(data); 
            if (data.anim) rp.playAnim(data.anim);
        }
    }
});

playersRef.on('child_removed', (snap) => {
    if (remotePlayers[snap.key]) {
        remotePlayers[snap.key].dispose();
        delete remotePlayers[snap.key];
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
    if(all && Object.keys(all).length > 0 && Object.keys(all).every(k => all[k].ready)) {
        setTimeout(() => roomRef.child('game').update({ state: 'PLAYING' }), 1000);
    }
});

const lobby = new Lobby({
    previewCharacter: (id) => { isPreviewing = true; if (player.setHologram) player.setHologram(false); },
    hidePreview: () => { isPreviewing = false; if (!gameState.isCharSelected && player.setHologram) player.setHologram(true); },
    selectCharacter: (id) => {
        isPreviewing = false; gameState.isCharSelected = true;
        if (player.setHologram) player.setHologram(false); 
        myPlayerRef.update({ character: id }); updateLobbyPositions(); 
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
    
    document.getElementById('lobby-settings').style.display = 'none';
    document.getElementById('local-ui').style.display = 'flex';
    
    if (isMobile) document.getElementById('mobile-hud').style.display = 'block';
    
    if(player.mesh) {
        player.mesh.position.set(0, 0, 0); 
        player.mesh.rotation.y = Math.PI;
    }
}

const inputs = { forward: false, backward: false, left: false, right: false, joystick: { angle: 0, active: false } };
const emptyInputs = { forward: false, backward: false, left: false, right: false, joystick: { angle: 0, active: false } };

document.addEventListener('keydown', (e) => {
    if(gameState.mode === 'LOBBY' || player.isDead) return;
    if(e.code === 'KeyW') inputs.forward = true;
    if(e.code === 'KeyS') inputs.backward = true;
    if(e.code === 'KeyA') inputs.left = true;
    if(e.code === 'KeyD') inputs.right = true;
    
    if(e.code === 'Space') player.jump();
});
document.addEventListener('keyup', (e) => {
    if(e.code === 'KeyW') inputs.forward = false;
    if(e.code === 'KeyS') inputs.backward = false;
    if(e.code === 'KeyA') inputs.left = false;
    if(e.code === 'KeyD') inputs.right = false;
});

window.addEventListener('contextmenu', e => e.preventDefault());

document.addEventListener('mousedown', (e) => {
    if (gameState.mode !== 'GAME' || player.isDead || isMobile) return;
    if (e.button === 2) player.startAiming();
});

document.addEventListener('mouseup', (e) => {
    if (e.button === 2) player.stopAimingAndFire();
});

let cameraAngleY = 0; let cameraAngleX = 0.05; 
document.addEventListener('mousemove', (e) => {
    if (gameState.mode === 'GAME' && player.isAiming && !isMobile) {
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const intersectPoint = new THREE.Vector3();
        raycaster.ray.intersectPlane(groundPlane, intersectPoint);
        const myPos = player.getPosition();
        if (intersectPoint.distanceTo(myPos) > 15) {
            intersectPoint.sub(myPos).normalize().multiplyScalar(15).add(myPos);
        }
        player.updateAiming(intersectPoint);
    } 
    else if (!isPreviewing && (e.buttons === 1 || e.buttons === 4)) {
        cameraAngleY -= e.movementX * 0.005;
        cameraAngleX -= e.movementY * 0.005;
        cameraAngleX = Math.max(-0.6, Math.min(0.6, cameraAngleX));
    }
});

const clock = new THREE.Clock();
const gameCamDist = 2.3; const gameCamHeight = 2.0;
let lastNetUpdate = 0;
let lastNetData = {};

function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();

    Object.values(remotePlayers).forEach(rp => rp.update(dt));

    if (player.mesh || player.hologramGroup) {
        if (gameState.mode === 'GAME') {
            player.update(dt, inputs, cameraAngleY);
            
            if (!player.isDead) {
                const now = Date.now();
                const netData = player.getNetworkData();
                
                const firedNow = netData.fireEvent && netData.fireEvent.id !== lastNetData.fireEvent?.id;
                
                if (firedNow || now - lastNetUpdate > 100) { 
                    if (netData && (firedNow || netData.x !== lastNetData.x || netData.z !== lastNetData.z || netData.ry !== lastNetData.ry || netData.anim !== lastNetData.anim)) {
                        myPlayerRef.update(netData);
                        lastNetData = {...netData};
                        lastNetUpdate = now;
                    }
                }
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
            if (isPreviewing) { targetZ = playerPos.z - 3; targetY = playerPos.y + 1.4; } 
            else { targetZ = playerPos.z - 4.5; targetY = playerPos.y + 2 + Math.sin(Date.now()*0.0005)*0.2; }
            camera.position.lerp(new THREE.Vector3(targetX, targetY, targetZ), 0.08);
            camera.lookAt(playerPos.x, playerPos.y + 1.1, playerPos.z);
        }
    }
    renderer.render(scene, camera);
}

if (isMobile) {
    const manager = nipplejs.create({ zone: document.getElementById('joystick-zone'), mode: 'static', position: { left: '50%', top: '50%' }, color: 'white', size: 100 });
    manager.on('move', (evt, data) => { inputs.joystick.active = true; inputs.joystick.angle = data.angle.radian; });
    manager.on('end', () => inputs.joystick.active = false);
    
    document.getElementById('btn-jump').addEventListener('touchstart', (e) => { 
        e.preventDefault(); e.stopPropagation(); 
        player.jump(); 
    });

    const btnAbility = document.getElementById('btn-ability');
    const abilityThumb = document.getElementById('ability-thumb');
    
    let mobileAimStart = {x: 0, y: 0};
    let didDragAbility = false;
    let finalDragDist = 0;
    
    btnAbility.addEventListener('touchstart', e => {
        e.preventDefault(); e.stopPropagation();
        if (Date.now() < player.abilityCooldown) return;
        
        didDragAbility = false;
        finalDragDist = 0;
        player.startAiming();
        
        const rect = btnAbility.getBoundingClientRect();
        mobileAimStart = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        
        // --- АВТОНАВЕДЕНИЕ (Поиск ближайшего врага) ---
        let closestEnemy = null;
        let minTargetDist = Infinity;
        const myPos = player.getPosition();
        
        Object.values(remotePlayers).forEach(rp => {
            if (!rp.isDead && !rp.isHologram) {
                const d = myPos.distanceTo(rp.targetPos);
                if (d < minTargetDist && d < 20) { // Ищем в радиусе 20
                    minTargetDist = d;
                    closestEnemy = rp;
                }
            }
        });

        let angleWorld;
        if (closestEnemy) {
            const dx = closestEnemy.targetPos.x - myPos.x;
            const dz = closestEnemy.targetPos.z - myPos.z;
            angleWorld = Math.atan2(dz, dx);
        } else {
            // Если врагов нет - целимся туда, куда смотрим
            const forwardX = Math.sin(player.mesh.rotation.y);
            const forwardZ = Math.cos(player.mesh.rotation.y);
            angleWorld = Math.atan2(forwardZ, forwardX);
        }
        
        // Ставим прицел сразу на цель
        const distWorld = closestEnemy ? minTargetDist : 12; 
        player.updateAiming(new THREE.Vector3(
            myPos.x + Math.cos(angleWorld) * distWorld,
            0,
            myPos.z + Math.sin(angleWorld) * distWorld
        ));
        
        abilityThumb.style.transition = 'none';
        abilityThumb.style.transform = `translate(0px, 0px)`;
    });
    
    btnAbility.addEventListener('touchmove', e => {
        if (!player.isAiming) return;
        e.preventDefault(); e.stopPropagation();
        const touch = e.changedTouches[0];
        
        let dx = touch.clientX - mobileAimStart.x;
        let dy = touch.clientY - mobileAimStart.y;
        
        const distScreen = Math.sqrt(dx*dx + dy*dy);
        finalDragDist = distScreen;
        
        if (distScreen > 10) didDragAbility = true; // Засчитываем как ручное прицеливание
        
        const maxDistScreen = 50; 
        
        if (distScreen > maxDistScreen) {
            dx = (dx / distScreen) * maxDistScreen;
            dy = (dy / distScreen) * maxDistScreen;
        }
        
        abilityThumb.style.transform = `translate(${dx}px, ${dy}px)`;
        
        // Переписываем автонаведение ручным управлением
        if (distScreen > 5) {
            const distWorld = (distScreen / maxDistScreen) * 15; 
            const angleScreen = Math.atan2(dy, dx);
            const angleWorld = angleScreen + cameraAngleY + Math.PI / 2;
            
            const myPos = player.getPosition();
            player.updateAiming(new THREE.Vector3(
                myPos.x + Math.cos(angleWorld) * distWorld,
                0,
                myPos.z + Math.sin(angleWorld) * distWorld
            ));
        }
    });

    btnAbility.addEventListener('touchend', e => {
        e.preventDefault(); e.stopPropagation();
        if (!player.isAiming) return;
        
        abilityThumb.style.transition = 'transform 0.2s ease-out';
        abilityThumb.style.transform = `translate(0px, 0px)`;
        
        // --- ОТМЕНА: Если игрок вернул стик в центр ---
        if (didDragAbility && finalDragDist < 15) {
            player.cancelAiming();
        } else {
            player.stopAimingAndFire();
        }
    });

    document.getElementById('btn-settings').addEventListener('touchstart', (e) => {
        e.preventDefault(); e.stopPropagation();
        const panel = document.getElementById('settings-panel');
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });

    document.getElementById('opacity-slider').addEventListener('input', (e) => {
        const val = e.target.value;
        document.getElementById('action-buttons').style.opacity = val;
        const joystick = document.getElementById('joystick-zone');
        if (joystick) joystick.style.opacity = val; 
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