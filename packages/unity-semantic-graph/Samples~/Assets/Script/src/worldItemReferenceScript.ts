const referencedItem = $.worldItemReference("target");
const displayLabel = $.subNode("API_Label").getUnityComponent("TextMesh");

$.onStart(() => {
  $.log(`worldItemReference: ${referencedItem.id}`);
  if (displayLabel) {
    displayLabel.unityProp.text = `worldItemReference:\n${referencedItem.id}`;
  }
});
