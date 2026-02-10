import { update } from '../../js/firebase-config.js';
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { FBXLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/FBXLoader.js';

const LOBBY_POSITIONS = [
    { x: 0, z: 0 },    // Центр (Я)
    { x: -2.5, z: 1 }, // Слева
    { x: 2.5, z: 1 },  // Справа
    { x: -5, z: 2 },
    { x: 5, z: 2 }
];

let lobbyPlayers = {}; 
const loader = new FBXLoader();
const texLoader = new THREE.TextureLoader();
let commonTexture = null;

texLoader.load('assets/models/cock/texture.png', (t) => { 
    t.colorSpace = THREE.SRGBColorSpace; 
    commonTexture = t;
});

export function getLobbyHTML() {
    return `
        <div id="lobby-status-text">ОЖИДАНИЕ ИГРОКОВ...</div>
        
        <button id="lobby-ready-btn" style="display: none;">ГОТОВ</button>
        
        <div id="char-menu-modal" class="hidden">
            <h2 style="color:white; margin-bottom:30px">ВЫБОР ПЕРСОНАЖА</h2>
            <div class="chars-grid">
                <div class="char-option" onclick="window.confirmChar('cock')">
                    <img src="assets/models/cock/texture.png">
                    <span>Петух</span>
                </div>
            </div>
            <button onclick="document.getElementById('char-menu-modal').classList.add('hidden')" 
                    style="margin-top:30px; padding:10px 30px; background:#444; color:white; border:none; border-radius:5px">
                ОТМЕНА
            </button>
        </div>

        <div id="click-catcher"></div>
    `;
}

export function setupLobbyUI(myPlayerRef) {
    const clickCatcher = document.getElementById('click-catcher');
    const modal = document.getElementById('char-menu-modal');
    
    if (clickCatcher) {
        clickCatcher.onclick = () => {
            // Открываем меню только если мы еще не готовы
            const btn = document.getElementById('lobby-ready-btn');
            if (!btn.classList.contains('ready-pressed')) {
                modal.classList.remove('hidden');
            }
        };
    }

    window.confirmChar = (charId) => {
        modal.classList.add('hidden');
        update(myPlayerRef, { char: charId });
        
        // Кнопку здесь НЕ включаем, ждем пока все выберут (в updateLobbyVisuals)
    };

    // Логика нажатия кнопки Готов
    const btn = document.getElementById('lobby-ready-btn');
    if (btn) {
        btn.onclick = () => {
            btn.innerText = "ОЖИДАНИЕ...";
            btn.classList.add('ready-pressed'); // Флаг что нажата
            btn.disabled = true;
            update(myPlayerRef, { isReady: true });
        };
    }
}

export function updateLobbyVisuals(scene, playersData, myId) {
    // 1. Проверяем, все ли выбрали персонажа
    const allPlayers = Object.values(playersData);
    const allSelected = allPlayers.every(p => p.char);
    
    const btn = document.getElementById('lobby-ready-btn');
    const status = document.getElementById('lobby-status-text');

    if (allSelected) {
        // Если все выбрали -> Показываем кнопку
        if (btn && !btn.classList.contains('ready-pressed')) { // Если еще не нажали
            btn.style.display = 'block';
            btn.disabled = false;
        }
        if (status) status.innerText = "НАЖМИ ГОТОВ";
    } else {
        // Если кто-то еще не выбрал
        if (btn) btn.style.display = 'none';
        
        const myData = playersData[myId];
        if (status) {
            status.innerText = myData.char ? "ЖДЕМ ОСТАЛЬНЫХ..." : "ВЫБЕРИ БОЙЦА";
        }
    }

    // 2. Рендер моделек
    Object.keys(lobbyPlayers).forEach(pid => {
        if (!playersData[pid]) {
            if(lobbyPlayers[pid].mesh) scene.remove(lobbyPlayers[pid].mesh);
            delete lobbyPlayers[pid];
        }
    });

    const otherIds = Object.keys(playersData).filter(pid => pid !== myId);
    updateSingleLobbyChar(scene, myId, playersData[myId], 0); // Я
    otherIds.forEach((pid, index) => {
        updateSingleLobbyChar(scene, pid, playersData[pid], index + 1); // Другие
    });
}

function updateSingleLobbyChar(scene, pid, pData, posIndex) {
    const pos = LOBBY_POSITIONS[posIndex] || { x: 0, z: 0 }; 

    if (!lobbyPlayers[pid]) {
        lobbyPlayers[pid] = { mesh: null, charId: null };
    }
    const localP = lobbyPlayers[pid];

    // Если нет персонажа -> ДЫМОК
    if (!pData.char) {
        if (localP.charId !== 'smoke') {
            if (localP.mesh) scene.remove(localP.mesh);
            createSmoke(pos, (mesh) => {
                localP.mesh = mesh;
                localP.charId = 'smoke';
                scene.add(mesh);
            });
        }
    } 
    // Если есть персонаж -> МОДЕЛЬ
    else {
        if (localP.charId !== pData.char) {
            if (localP.mesh) scene.remove(localP.mesh);
            
            loader.load('assets/models/cock/cock_wait.fbx', (fbx) => {
                fbx.scale.set(0.01, 0.01, 0.01);
                fbx.position.set(pos.x, 0, pos.z);
                fbx.rotation.y = 0; 
                
                fbx.traverse(c => { 
                    if(c.isMesh) {
                        if (commonTexture) c.material.map = commonTexture;
                        c.castShadow = true; 
                    } 
                });

                const mixer = new THREE.AnimationMixer(fbx);
                if (fbx.animations[0]) {
                    const action = mixer.clipAction(fbx.animations[0]);
                    action.play();
                }
                fbx.userData.mixer = mixer;

                scene.add(fbx);
                localP.mesh = fbx;
                localP.charId = pData.char;
            });
        }
    }
}

function createSmoke(pos, cb) {
    const geometry = new THREE.DodecahedronGeometry(1.5, 0);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0x888888, transparent: true, opacity: 0.8, roughness: 0.5 
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(pos.x, 1.5, pos.z);
    mesh.userData.isSmoke = true;
    cb(mesh);
}

export function animateLobby(delta) {
    Object.values(lobbyPlayers).forEach(p => {
        if (p.mesh) {
            if (p.mesh.userData.isSmoke) {
                p.mesh.rotation.x += delta; p.mesh.rotation.y += delta;
            }
            if (p.mesh.userData.mixer) p.mesh.userData.mixer.update(delta);
        }
    });
}

export function cleanupLobby() {
    lobbyPlayers = {}; 
}