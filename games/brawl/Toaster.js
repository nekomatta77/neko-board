export class Toaster {
    constructor(scene, loadingManager) {
        this.scene = scene;
        this.mesh = null;
        this.mixer = null;
        this.animations = {};
        this.currentAction = null;
        this.activeActionName = ''; // Текущая активная анимация
        
        this.moveSpeed = 0.02; 
        this.runAnimSpeed = 1;
        
        this.isAttacking = false;

        this.loader = new THREE.FBXLoader(loadingManager);
        this.texLoader = new THREE.TextureLoader(loadingManager);
        this.path = 'assets/models/toaster/';
    }

    load() {
        const texture = this.texLoader.load(this.path + 'ToastBrawler_Low_OG_BaseColor.png');

        this.loader.load(this.path + 'character.fbx', (fbx) => {
            this.mesh = fbx;
            this.mesh.scale.set(0.02, 0.02, 0.02);
            
            this.mesh.traverse(c => {
                if (c.isMesh) {
                    c.castShadow = true;
                    c.receiveShadow = true;
                    if (c.material) {
                        c.material.map = texture;
                        c.material.needsUpdate = true;
                    }
                }
            });

            this.mesh.rotation.y = Math.PI; 
            this.mixer = new THREE.AnimationMixer(this.mesh);
            
            // Слушаем конец удара
            this.mixer.addEventListener('finished', (e) => {
                if (this.animations['Punch'] && e.action === this.animations['Punch']) {
                    this.isAttacking = false;
                    this.playAnim('Idle');
                }
            });

            this.scene.add(this.mesh);

            // Загружаем анимации и СРАЗУ включаем Idle
            this.loadAnim('Idle', 'idle.fbx', () => this.playAnim('Idle'));
            this.loadAnim('Run', 'run.fbx');
            this.loadAnim('Punch', 'punch.fbx', (action) => {
                action.loop = THREE.LoopOnce;
                action.clampWhenFinished = true;
            });

        }, undefined, (e) => console.error(e));
    }

    loadAnim(name, file, cb) {
        this.loader.load(this.path + file, (anim) => {
            if (this.mixer) {
                const action = this.mixer.clipAction(anim.animations[0]);
                if (name === 'Run') action.timeScale = this.runAnimSpeed;
                if (name === 'Punch') action.timeScale = 1.5; 
                
                this.animations[name] = action;
                if (cb) cb(action);
            }
        });
    }

    playAnim(name) {
        if (!this.animations[name]) return;
        
        // Если анимация уже играет, не перезапускаем (кроме удара, его можно форсировать)
        if (this.activeActionName === name && name !== 'Punch') return;

        const newAction = this.animations[name];
        
        // Плавный переход
        if (this.currentAction && this.currentAction !== newAction) {
            this.currentAction.fadeOut(0.2);
        }

        newAction.reset().fadeIn(0.2).play();
        this.currentAction = newAction;
        this.activeActionName = name;
    }

    attack() {
        if (this.isAttacking) return;
        this.isAttacking = true;
        this.playAnim('Punch');
    }

    update(dt, inputs, cameraAngleY) {
        if (!this.mesh || !this.mixer) return;
        
        // ВАЖНО: Обновляем миксер всегда, иначе анимация застынет
        this.mixer.update(dt);

        // Если атакуем, не двигаемся
        if (this.isAttacking) return;

        let dx = 0;
        let dz = 0;

        if (inputs.forward) dz = -1;
        if (inputs.backward) dz = 1;
        if (inputs.left) dx = -1;
        if (inputs.right) dx = 1;

        if (inputs.joystick && inputs.joystick.active) {
            dz = -Math.sin(inputs.joystick.angle);
            dx = Math.cos(inputs.joystick.angle);
        }

        const isMoving = dx !== 0 || dz !== 0;

        if (isMoving) {
            this.playAnim('Run');
            
            const angleOffset = -cameraAngleY;
            const realX = dx * Math.cos(angleOffset) - dz * Math.sin(angleOffset);
            const realZ = dx * Math.sin(angleOffset) + dz * Math.cos(angleOffset);

            this.mesh.position.x += realX * this.moveSpeed;
            this.mesh.position.z += realZ * this.moveSpeed;

            const targetRotation = Math.atan2(-realX, -realZ) + Math.PI;
            let rotDiff = targetRotation - this.mesh.rotation.y;
            while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
            while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
            this.mesh.rotation.y += rotDiff * 0.15;
        } else {
            // ИСПРАВЛЕНИЕ: Если не двигаемся - включаем Idle
            this.playAnim('Idle');
        }
    }
    
    getNetworkData() {
        if (!this.mesh) return null;
        return {
            x: this.mesh.position.x,
            z: this.mesh.position.z,
            ry: this.mesh.rotation.y,
            anim: this.activeActionName
        };
    }
    
    getPosition() {
        return this.mesh ? this.mesh.position : new THREE.Vector3(0,0,0);
    }
}