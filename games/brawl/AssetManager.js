// games/brawl/AssetManager.js

export const AssetCache = {
    toaster: { mesh: null, animations: {} }
};

export function preloadAssets(loadingManager) {
    if (typeof THREE === 'undefined') {
        console.error("THREE.js не найден!");
        return;
    }

    const loader = new THREE.FBXLoader(loadingManager);
    const texLoader = new THREE.TextureLoader(loadingManager);
    const path = 'assets/models/toaster/';

    const texture = texLoader.load(path + 'ToastBrawler_Low_OG_BaseColor.png');

    // 1. Загрузка модели
    loader.load(path + 'character.fbx', (fbx) => {
        // Здесь масштаб не важен, мы зададим его клону, 
        // но на всякий случай сбросим в единицу
        fbx.scale.set(1, 1, 1);
        
        fbx.traverse(c => {
            if (c.isMesh) {
                c.castShadow = true;
                c.receiveShadow = true;
                if (c.material) {
                    c.material.map = texture;
                    c.material.needsUpdate = true;
                }
            }
        });
        AssetCache.toaster.mesh = fbx;
    });

    // 2. Загрузка анимаций с УДАЛЕНИЕМ МАСШТАБА
    const anims = ['idle', 'run', 'punch'];
    anims.forEach(name => {
        loader.load(path + name + '.fbx', (anim) => {
            if (anim.animations && anim.animations.length > 0) {
                const clip = anim.animations[0];

                // === ГЛАВНОЕ ИСПРАВЛЕНИЕ ===
                // Удаляем из анимации все команды, которые меняют размер (scale).
                // Теперь анимация не сможет "раздуть" модель.
                clip.tracks = clip.tracks.filter(track => !track.name.endsWith('.scale'));

                AssetCache.toaster.animations[name] = clip;
            }
        });
    });
}