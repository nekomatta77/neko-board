// games/brawl/RemotePlayer.js
export class RemotePlayer {
    constructor(scene, id, initialData) {
        this.scene = scene;
        this.id = id; // ID из Firebase
        this.mesh = null;
        this.mixer = null;
        this.animations = {};
        this.currentAction = null;
        
        // Целевые позиции для интерполяции (плавности)
        this.targetPos = new THREE.Vector3(initialData.x || 0, 0, initialData.z || 0);
        this.targetRot = initialData.ry || 0;
        
        // Загрузка (Копируем логику Тостера, но упрощаем)
        this.loader = new THREE.FBXLoader();
        this.texLoader = new THREE.TextureLoader();
        this.path = 'assets/models/toaster/';
        
        this.load(initialData.character || 'toaster');
    }

    load(charId) {
        // Пока у нас только тостер, но в будущем charId пригодится
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

            // Загружаем анимации
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
        // Если уже играет эта анимация (и это не удар), игнорируем
        if (this.currentAction === this.animations[name] && name !== 'Punch') return;

        const newAction = this.animations[name];
        if (this.currentAction) this.currentAction.fadeOut(0.2);
        
        newAction.reset().fadeIn(0.2).play();
        this.currentAction = newAction;
    }

    // Обновляем данные из сети
    updateNetworkData(data) {
        if (data.x !== undefined) this.targetPos.set(data.x, 0, data.z);
        if (data.ry !== undefined) this.targetRot = data.ry;
        
        // Синхронизация анимации
        if (data.anim) {
            this.playAnim(data.anim);
        }
    }

    update(dt) {
        if (!this.mesh || !this.mixer) return;
        this.mixer.update(dt);

        // Плавное движение к цели (Lerp)
        this.mesh.position.lerp(this.targetPos, 0.1);
        
        // Плавный поворот (через кватернионы сложнее, сделаем по-простому через углы)
        // Интерполяция угла
        let rotDiff = this.targetRot - this.mesh.rotation.y;
        while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
        while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
        this.mesh.rotation.y += rotDiff * 0.1;
    }
    
    // Удалить игрока при выходе
    dispose() {
        if (this.mesh) this.scene.remove(this.mesh);
    }
}