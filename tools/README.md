# Конвертер моделей

`usdz2glb.py` превращает распакованный USDZ-файл (scene.usdc и текстуры) в лёгкий GLB для игры. Что он делает:
- убирает салон;
- выделяет 4 колеса в отдельные узлы `wheel_FL/FR/RL/RR`, чтобы они крутились;
- собирает простые материалы в одну палитру;
- кузов кладёт в отдельный материал `paint`, чтобы его можно было перекрашивать.

```bash
pip install usd-core trimesh pillow numpy
unzip car.usdz -d car/
python3 tools/usdz2glb.py car/ car_raw.glb 512 '^(body|carpaint)$'
npx @gltf-transform/cli optimize car_raw.glb public/models/car.glb \
  --compress meshopt --texture-compress webp --texture-size 512 \
  --simplify-ratio 0.25 --flatten false --palette false --instance false --join-named false --prune-solid-textures false
```

После конвертации добавь машину в `CARS` в файле `public/shared/world.js` с полем `model: 'car'`.
