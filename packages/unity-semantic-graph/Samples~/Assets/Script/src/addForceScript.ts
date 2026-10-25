$.onStart(() => {
  $.state.hasLoggedFirstPhysicsUpdate = false;
});

$.onPhysicsUpdate((deltaTime) => {
  if (!$.state.hasLoggedFirstPhysicsUpdate) {
    $.state.hasLoggedFirstPhysicsUpdate = true;
    $.log("addForce sample received its first onPhysicsUpdate callback.");
    $.addForce(new Vector3(0, 12, 0));
  }
});
