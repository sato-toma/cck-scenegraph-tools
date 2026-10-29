const target = $.subNode("SubNodeTarget");
const label = $.subNode("API_Label").getUnityComponent("TextMesh");

$.onStart(() => {
  $.log(`Found subNode: ${target.name}`);

  if (label) {
    label.unityProp.text = `subNode name:\n${target.name}`;
  }
});
