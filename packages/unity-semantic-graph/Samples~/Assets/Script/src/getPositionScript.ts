const positionLabel = $.subNode("API_Label").getUnityComponent("TextMesh");

$.onStart(() => {
  const position = $.getPosition();
  const coordinates = `(${position.x}, ${position.y}, ${position.z})`;
  $.log(`getPosition returned ${coordinates}.`);
  if (positionLabel) {
    positionLabel.unityProp.text = `getPosition\n${coordinates}`;
  }
});
