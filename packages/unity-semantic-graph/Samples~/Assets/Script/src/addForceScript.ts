$.onStart(() => {
  $.state.elapsedTime = 0;
});

$.onPhysicsUpdate((deltaTime) => {
  const elapsedTime = Number($.state.elapsedTime ?? 0) + deltaTime;
  $.state.elapsedTime = elapsedTime;

  if (elapsedTime >= 3) {
    $.log("addForce sample applied force after each 3 seconds.");
    $.addForce(new Vector3(0, 1000, 0));
    $.state.elapsedTime = 0;
  }
});
