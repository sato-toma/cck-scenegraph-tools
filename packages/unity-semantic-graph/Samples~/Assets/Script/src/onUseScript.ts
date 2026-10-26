const statusText = $.subNode("API_Label").getUnityComponent("TextMesh");

$.onUse((isDown) => {
  $.log(`used while grabbed: ${isDown}.`);
  if (statusText) {
    statusText.unityProp.text = isDown ? "onUse: down" : "onUse: up";
  }
});
