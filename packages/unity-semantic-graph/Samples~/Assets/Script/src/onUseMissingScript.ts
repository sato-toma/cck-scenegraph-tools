$.onStart(() => {
  const meshRenderer = $.subNode("Cube").getUnityComponent("MeshRenderer");
  $.log(
    `MeshRenderer lookup on Cube: ${meshRenderer ? "found" : "not found"}.`,
  );
});
