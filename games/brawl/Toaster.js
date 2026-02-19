export class Toaster {
    constructor(scene, loadingManager) {
        this.scene = scene;
        this.mesh = null;
        this.mixer = null;
        this.animations = {};
        this.currentAction = null;
        this.activeActionName = ''; 
        
        this.moveSpeed = 0.02; 
        this.runAnimSpeed = 1;
        this.modelScale = 0.018; 
        
        // --- ЗДОРОВЬЕ И СТАТУС ---
        this.maxHp = 3200;
        this.hp = 3200;
        this.isDead = false;
        
        this.isHologram = true; 
        this.isAttacking = false;

        this.loader = new THREE.FBXLoader(loadingManager);
        this.texLoader = new THREE.TextureLoader(loadingManager);
        this.path = 'assets/models/toaster/';
        this.baseTexture = this.texLoader.load(this.path + 'ToastBrawler_Low_OG_BaseColor.png');

        this.createHologram();
    }

    createHologram() {
        this.hologramGroup = new THREE.Group();
        const geo1 = new THREE.OctahedronGeometry(0.5);
        const mat1 = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true, transparent: true, opacity: 0.8 });
        this.crystal = new THREE.Mesh(geo1, mat1);
        this.crystal.position.y = 1;
        this.hologramGroup.add(this.crystal);

        const geo2 = new THREE.TorusGeometry(0.8, 0.02, 16, 32);
        const mat2 = new THREE.MeshBasicMaterial({ color: 0x0088ff, transparent: true, opacity: 0.5 });
        this.ring = new THREE.Mesh(geo2, mat2);
        this.ring.position.y = 1;
        this.ring.rotation.x = Math.PI / 2;
        this.hologramGroup.add(this.ring);

        this.scene.add(this.hologramGroup);
    }

    load() {
        this.loader.load(this.path + 'character.fbx', (fbx) => {
            this.mesh = fbx;
            this.mesh.scale.set(this.modelScale, this.modelScale, this.modelScale);
            
            this.mesh.traverse(c => {
                if (c.isMesh) {
                    c.castShadow = true;
                    c.receiveShadow = true;
                    if (c.material) {
                        c.material.map = this.baseTexture;
                        c.material.needsUpdate = true;
                    }
                }
            });
            
            this.mesh.visible = !this.isHologram;
            this.hologramGroup.visible = this.isHologram;
            this.mesh.rotation.y = Math.PI; 
            
            this.mixer = new THREE.AnimationMixer(this.mesh);
            
            this.mixer.addEventListener('finished', (e) => {
                if (this.animations['Punch'] && e.action === this.animations['Punch']) {
                    this.isAttacking = false;
                    if (!this.isDead) this.playAnim('Idle');
                }
            });

            this.scene.add(this.mesh);

            this.loadAnim('Idle', 'idle.fbx', () => this.playAnim('Idle'));
            this.loadAnim('Run', 'run.fbx');
            this.loadAnim('Punch', 'punch.fbx', (action) => {
                action.loop = THREE.LoopOnce;
                action.clampWhenFinished = true;
            });
            // --- ЗАГРУЗКА АНИМАЦИИ СМЕРТИ ---
            this.loadAnim('Die', 'die.fbx', (action) => {
                action.loop = THREE.LoopOnce;
                action.clampWhenFinished = true; // Останавливаемся на последнем кадре (лежит)
            });

        }, undefined, (e) => console.error(e));
    }

    setHologram(value) {
        if (this.isHologram !== value) {
            this.isHologram = value;
            if (this.mesh) this.mesh.visible = !this.isHologram;
            if (this.hologramGroup) this.hologramGroup.visible = this.isHologram;
        }
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
        if (this.activeActionName === name && name !== 'Punch') return;
        // Если мертв, разрешаем играть ТОЛЬКО анимацию смерти
        if (this.isDead && name !== 'Die') return;

        const newAction = this.animations[name];
        if (this.currentAction && this.currentAction !== newAction) {
            this.currentAction.fadeOut(0.2);
        }

        newAction.reset().fadeIn(0.2).play();
        this.currentAction = newAction;
        this.activeActionName = name;
    }

    attack() {
        if (this.isAttacking || this.isDead) return; // Мертвые не бьют
        this.isAttacking = true;
        this.playAnim('Punch');
    }

    update(dt, inputs, cameraAngleY) {
        if (this.hologramGroup && this.isHologram) {
            this.hologramGroup.position.copy(this.getPosition());
            this.crystal.rotation.y += dt;
            this.crystal.rotation.x += dt * 0.5;
            this.ring.rotation.z -= dt * 0.5;
        }

        if (!this.mesh || !this.mixer) return;
        this.mixer.update(dt);

        // Если умер или атакует — отключаем движение
        if (this.isDead || this.isAttacking) return;

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
            this.playAnim('Idle');
        }
    }
    
    // Вызывается из game.js при получении данных о нашем уроне
    setHp(newHp) {
        this.hp = newHp;
        if (this.hp <= 0 && !this.isDead) {
            this.hp = 0;
            this.isDead = true;
            this.playAnim('Die');
        }
    }

    getNetworkData() {
        if (!this.mesh) return null;
        return {
            x: this.mesh.position.x,
            z: this.mesh.position.z,
            ry: this.mesh.rotation.y,
            anim: this.activeActionName,
            hp: this.hp,
            isDead: this.isDead
        };
    }
    
    getPosition() {
        return this.mesh ? this.mesh.position : new THREE.Vector3(0,0,0);
    }
}