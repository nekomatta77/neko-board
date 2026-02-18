export class RemotePlayer {
    constructor(scene, id, initialData, colorHex) {
        this.scene = scene;
        this.id = id;
        this.mesh = null;
        
        // Цвет голограммы (по умолчанию синий, если не передан)
        this.color = colorHex || 0x00d2ff; 
        
        this.waitingGroup = null; 
        this.mixer = null;
        this.animations = {};
        this.currentAction = null;
        
        this.targetPos = new THREE.Vector3(initialData.x || 0, 0, initialData.z || 0);
        this.targetRot = initialData.ry || 0;
        
        this.loader = new THREE.FBXLoader();
        this.texLoader = new THREE.TextureLoader();
        this.path = 'assets/models/toaster/';
        
        // ЛОГИКА: Если есть ID персонажа - грузим модель.
        // Если нет - создаем голограмму.
        if (initialData.character) {
            this.load(initialData.character);
        } else {
            this.createWaitingEffect();
        }
    }

    // --- КИБЕР-ГОЛОГРАММА ---
    createWaitingEffect() {
        if (this.waitingGroup) return; // Уже создана

        this.waitingGroup = new THREE.Group();
        this.waitingGroup.position.copy(this.targetPos);
        this.waitingGroup.position.y = 1.0; 

        // 1. Внутреннее Ядро
        const coreGeo = new THREE.IcosahedronGeometry(0.3, 1);
        const coreMat = new THREE.MeshBasicMaterial({ 
            color: this.color, 
            wireframe: false
        });
        const core = new THREE.Mesh(coreGeo, coreMat);
        this.waitingGroup.add(core);
        this.waitingGroup.userData.core = core; 

        // 2. Внешняя Оболочка
        const shellGeo = new THREE.IcosahedronGeometry(0.6, 0);
        const shellMat = new THREE.MeshBasicMaterial({ 
            color: this.color, 
            wireframe: true,
            transparent: true,
            opacity: 0.5
        });
        const shell = new THREE.Mesh(shellGeo, shellMat);
        this.waitingGroup.add(shell);
        this.waitingGroup.userData.shell = shell;

        // 3. Кольца
        const ringGeo = new THREE.TorusGeometry(0.8, 0.02, 16, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 });
        
        const ring1 = new THREE.Mesh(ringGeo, ringMat);
        ring1.rotation.x = Math.PI / 2;
        this.waitingGroup.add(ring1);
        
        const ring2 = new THREE.Mesh(ringGeo, ringMat);
        ring2.rotation.x = Math.PI / 2;
        ring2.rotation.y = Math.PI / 4;
        ring2.scale.set(0.8, 0.8, 0.8);
        this.waitingGroup.add(ring2);

        this.scene.add(this.waitingGroup);
    }

    removeWaitingEffect() {
        if (this.waitingGroup) {
            this.scene.remove(this.waitingGroup);
            this.waitingGroup = null;
        }
    }

    // --- ЗАГРУЗКА ---
    load(charId) {
        this.removeWaitingEffect(); // Удаляем голограмму при загрузке

        const texture = this.texLoader.load(this.path + 'ToastBrawler_Low_OG_BaseColor.png');

        this.loader.load(this.path + 'character.fbx', (fbx) => {
            this.mesh = fbx;
            this.mesh.scale.set(0.02, 0.02, 0.02);
            
            this.mesh.traverse(c => {
                if (c.isMesh) {
                    c.castShadow = true;
                    c.receiveShadow = true;
                    if (c.material) c.material.map = texture;
                }
            });

            this.mesh.position.copy(this.targetPos);
            this.mesh.rotation.y = this.targetRot;

            this.mixer = new THREE.AnimationMixer(this.mesh);
            this.scene.add(this.mesh);

            this.loadAnim('Idle', 'idle.fbx', () => this.playAnim('Idle'));
            this.loadAnim('Run', 'run.fbx');
            this.loadAnim('Punch', 'punch.fbx', (action) => {
                action.loop = THREE.LoopOnce;
                action.clampWhenFinished = true;
            });
        });
    }

    loadAnim(name, file, cb) {
        this.loader.load(this.path + file, (anim) => {
            if (this.mixer) {
                const action = this.mixer.clipAction(anim.animations[0]);
                this.animations[name] = action;
                if(cb) cb(action);
            }
        });
    }

    playAnim(name) {
        if (!this.animations[name]) return;
        if (this.currentAction === this.animations[name] && name !== 'Punch') return;

        const newAction = this.animations[name];
        if (this.currentAction) this.currentAction.fadeOut(0.2);
        newAction.reset().fadeIn(0.2).play();
        this.currentAction = newAction;
    }

    updateNetworkData(data) {
        if (data.x !== undefined) this.targetPos.set(data.x, 0, data.z);
        if (data.ry !== undefined) this.targetRot = data.ry;
        
        // Если прилетел персонаж, а у нас все еще голограмма -> ГРУЗИМ
        if (data.character && !this.mesh) {
            this.load(data.character);
        }
        
        if (data.anim && this.mesh) this.playAnim(data.anim);
    }

    update(dt) {
        // Анимация модели
        if (this.mesh && this.mixer) {
            this.mixer.update(dt);
            this.mesh.position.lerp(this.targetPos, 0.1);
            
            let rotDiff = this.targetRot - this.mesh.rotation.y;
            while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
            while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
            this.mesh.rotation.y += rotDiff * 0.1;
        } 
        // Анимация голограммы
        else if (this.waitingGroup) {
            this.waitingGroup.position.x += (this.targetPos.x - this.waitingGroup.position.x) * 0.1;
            this.waitingGroup.position.z += (this.targetPos.z - this.waitingGroup.position.z) * 0.1;
            
            const time = Date.now() * 0.002;
            this.waitingGroup.position.y = 1.2 + Math.sin(time) * 0.1;

            if (this.waitingGroup.userData.shell) {
                this.waitingGroup.userData.shell.rotation.y -= 0.02;
                this.waitingGroup.userData.shell.rotation.x += 0.01;
            }
            if (this.waitingGroup.userData.core) {
                this.waitingGroup.userData.core.scale.setScalar(1 + Math.sin(time * 2) * 0.1);
            }
            this.waitingGroup.rotation.y += 0.005;
        }
    }
    
    dispose() {
        if (this.mesh) this.scene.remove(this.mesh);
        this.removeWaitingEffect();
    }
}