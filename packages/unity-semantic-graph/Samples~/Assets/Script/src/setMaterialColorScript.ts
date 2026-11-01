const materialId = "cubeMat";
const changeIntervalSeconds = 1;
const hueStep = 0.1;

const hsvToRgb = (h: number, s: number, v: number): [number, number, number] => {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0:
      return [v, t, p];
    case 1:
      return [q, v, p];
    case 2:
      return [p, v, t];
    case 3:
      return [p, q, v];
    case 4:
      return [t, p, v];
    default:
      return [v, p, q];
  }
};

$.onStart(() => {
  $.state.time = 0;
  $.state.hue = 0;
  $.log("setMaterialColor sample started. Changing base color and emission every second.");
});

$.onUpdate((deltaTime) => {
  const time = Number($.state.time ?? 0) + deltaTime;
  if (time < changeIntervalSeconds) {
    $.state.time = time;
    return;
  }

  const hue = (Number($.state.hue ?? 0) + hueStep) % 1;
  $.state.time = 0;
  $.state.hue = hue;

  const [r, g, b] = hsvToRgb(hue, 1, 1);
  // setEmissionColor は Material の _EMISSION が有効なときだけ見た目に反映される
  const material = $.material(materialId);
  material.setBaseColor(r, g, b, 1);
  material.setEmissionColor(r * 0.5, g * 0.5, b * 0.5, 1);
});
