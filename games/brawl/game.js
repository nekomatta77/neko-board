// --- 1. ИНИЦИАЛИЗАЦИЯ СЦЕНЫ ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); 
scene.fog = new THREE.Fog(0x87CEEB, 10, 40);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// --- 2. СВЕТ ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
dirLight.position.set(20, 50, 20);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
scene.add(dirLight);

// --- 3. ОКРУЖЕНИЕ ---
const groundGeometry = new THREE.PlaneGeometry(200, 200);
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x222222 });
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const gridHelper = new THREE.GridHelper(200, 200, 0x444444, 0x444444);
scene.add(gridHelper);

// ==========================================
// --- 4. НАСТРОЙКИ (TWEAKING) ---
// ==========================================

// СИНХРОНИЗАЦИЯ БЕГА
// Если ноги "скользят" назад -> увеличь moveSpeed
// Если ноги "лунная походка" -> уменьши moveSpeed
const moveSpeed = 0.02;      
const runAnimSpeed = 1;    // Скорость воспроизведения анимации

// НАСТРОЙКИ КАМЕРЫ (Меняй цифры здесь!)
const cameraDistance = 2.3  ;  // Дистанция от спины (3.5 - близко, 6 - далеко)
const cameraHeight = 2.0;    // Высота над полом (2.0 - уровень головы)
const cameraXOffset = -0.6;   // Сдвиг вправо (0 - центр, 1.0 - правое плечо)
let cameraAngleX = 0.05;     // Наклон вниз (смотреть чуть в пол)

// ==========================================

let cameraAngleY = 0; 
let player = null;
let mixer = null;
let animations = {}; 
let currentAction = null; 

// --- 5. ЗАГРУЗКА ---
const loader = new THREE.FBXLoader();
const texLoader = new THREE.TextureLoader(); 
const modelPath = 'assets/models/toaster/'; 

// Текстура
const mainTexture = texLoader.load(modelPath + 'ToastBrawler_Low_OG_BaseColor.png');

// Модель
loader.load(modelPath + 'character.fbx', (fbx) => {
    player = fbx;
    player.scale.set(0.02, 0.02, 0.02); 
    
    player.traverse(child => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.material) {
                child.material.map = mainTexture;
                child.material.needsUpdate = true;
            }
        }
    });

    // Важно: разворот модели на 180, так как Mixamo смотрит в +Z, а движок в -Z
    player.rotation.y = Math.PI; 

    mixer = new THREE.AnimationMixer(player);
    scene.add(player);
    document.getElementById('loader').style.display = 'none';

    // Idle
    loader.load(modelPath + 'idle.fbx', (anim) => {
        const action = mixer.clipAction(anim.animations[0]);
        animations['Idle'] = action;
        action.play();
        currentAction = action;
    });

    // Run
    loader.load(modelPath + 'run.fbx', (anim) => {
        const action = mixer.clipAction(anim.animations[0]);
        action.timeScale = runAnimSpeed; // Применяем скорость анимации
        animations['Run'] = action;
    });

}, (xhr) => {
    if (xhr.lengthComputable) {
        const percent = Math.round((xhr.loaded / xhr.total) * 100);
        document.getElementById('loader-text').innerText = `Загрузка: ${percent}%`;
    }
}, (error) => console.error(error));

// --- 6. УПРАВЛЕНИЕ ---
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let joystickData = { angle: 0, force: 0, active: false };

// ПК
document.addEventListener('keydown', (e) => {
    if(e.code === 'KeyW') moveForward = true;
    if(e.code === 'KeyS') moveBackward = true;
    if(e.code === 'KeyA') moveLeft = true;
    if(e.code === 'KeyD') moveRight = true;
});
document.addEventListener('keyup', (e) => {
    if(e.code === 'KeyW') moveForward = false;
    if(e.code === 'KeyS') moveBackward = false;
    if(e.code === 'KeyA') moveLeft = false;
    if(e.code === 'KeyD') moveRight = false;
});

// Мышь
let isMouseDown = false;
document.addEventListener('mousedown', () => isMouseDown = true);
document.addEventListener('mouseup', () => isMouseDown = false);
document.addEventListener('mousemove', (e) => {
    if (isMouseDown) {
        cameraAngleY -= e.movementX * 0.005;
        cameraAngleX -= e.movementY * 0.005;
        cameraAngleX = Math.max(-0.6, Math.min(0.6, cameraAngleX)); // Ограничение вертикали
    }
});

// Мобильное
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
if (isMobile) {
    const joystickZone = document.getElementById('joystick-zone');
    const manager = nipplejs.create({
        zone: joystickZone, mode: 'static', position: { left: '50%', top: '50%' }, color: 'white', size: 100
    });
    manager.on('move', (evt, data) => { joystickData.active = true; joystickData.angle = data.angle.radian; });
    manager.on('end', () => joystickData.active = false);

    const touchZone = document.getElementById('touch-rotate-zone');
    let lastX, lastY;
    touchZone.addEventListener('touchstart', e => { lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; });
    touchZone.addEventListener('touchmove', e => {
        e.preventDefault();
        const dx = e.touches[0].clientX - lastX;
        const dy = e.touches[0].clientY - lastY;
        cameraAngleY -= dx * 0.01;
        cameraAngleX -= dy * 0.01;
        cameraAngleX = Math.max(-0.6, Math.min(0.6, cameraAngleX));
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
    });
}

// --- 7. ГЛАВНЫЙ ЦИКЛ ---
const clock = new THREE.Clock();

function update() {
    const delta = clock.getDelta(); 
    if (mixer) mixer.update(delta);

    if (!player) return;

    let dx = 0;
    let dz = 0;
    let isMoving = false;

    // Считываем ввод
    if (moveForward) dz = -1;
    if (moveBackward) dz = 1;
    if (moveLeft) dx = -1;
    if (moveRight) dx = 1;

    if (joystickData.active) {
        dz = -Math.sin(joystickData.angle); 
        dx = Math.cos(joystickData.angle);
    }

    if (dx !== 0 || dz !== 0) {
        isMoving = true;
        
        // --- ГЛАВНОЕ ИСПРАВЛЕНИЕ: ПОВОРОТ ВЕКТОРА ОТНОСИТЕЛЬНО КАМЕРЫ ---
        // Используем -cameraAngleY, чтобы инвертировать поворот (Three.js особенность)
        const angleOffset = -cameraAngleY; 
        
        const realX = dx * Math.cos(angleOffset) - dz * Math.sin(angleOffset);
        const realZ = dx * Math.sin(angleOffset) + dz * Math.cos(angleOffset);

        // Двигаем игрока
        player.position.x += realX * moveSpeed;
        player.position.z += realZ * moveSpeed;
        
        // Поворачиваем модель лицом к движению
        // +Math.PI нужен, так как модель изначально развернута
        const targetRotation = Math.atan2(-realX, -realZ) + Math.PI;
        
        // Плавный поворот (Lerp угла)
        let rotDiff = targetRotation - player.rotation.y;
        // Нормализация угла (-PI до +PI), чтобы он не крутился на 360 лишний раз
        while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
        while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
        player.rotation.y += rotDiff * 0.15; 
    }

    // Управление анимациями
    if (animations['Idle'] && animations['Run']) {
        if (isMoving) {
            if (currentAction !== animations['Run']) {
                animations['Run'].reset().fadeIn(0.2).play();
                if(currentAction) currentAction.fadeOut(0.2);
                currentAction = animations['Run'];
            }
        } else {
            if (currentAction !== animations['Idle']) {
                animations['Idle'].reset().fadeIn(0.2).play();
                if(currentAction) currentAction.fadeOut(0.2);
                currentAction = animations['Idle'];
            }
        }
    }

    // --- РАСЧЕТ ПОЗИЦИИ КАМЕРЫ ---
    // 1. Сферические координаты (дистанция + углы)
    const idealX = player.position.x + cameraDistance * Math.sin(cameraAngleY) * Math.cos(cameraAngleX);
    const idealZ = player.position.z + cameraDistance * Math.cos(cameraAngleY) * Math.cos(cameraAngleX);
    const idealY = player.position.y + cameraDistance * Math.sin(cameraAngleX) + cameraHeight;

    // 2. Смещение вбок (Плечевой вид)
    // Вектор "вправо" от камеры = cos(Y), -sin(Y)
    const sideX = Math.cos(cameraAngleY);
    const sideZ = -Math.sin(cameraAngleY);
    
    camera.position.x = idealX + (sideX * cameraXOffset);
    camera.position.z = idealZ + (sideZ * cameraXOffset);
    camera.position.y = idealY;
    
    // 3. Точка взгляда (чуть выше игрока и со смещением, чтобы он не перекрывал прицел)
    const targetX = player.position.x + (sideX * cameraXOffset);
    const targetZ = player.position.z + (sideZ * cameraXOffset);
    
    camera.lookAt(targetX, player.position.y + 1.4, targetZ);
}

function animate() {
    requestAnimationFrame(animate);
    update();
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

function exitGame() {
    window.location.href = '../../index.html';
}

animate();