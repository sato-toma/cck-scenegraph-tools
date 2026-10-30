const playerScriptActivationStatusText = $.subNode("API_Label").getUnityComponent("TextMesh");

$.onStart(() => {
  if (playerScriptActivationStatusText) {
    playerScriptActivationStatusText.unityProp.text =
      "setPlayerScript\nUse this item to activate your Player Script.";
  }
});

$.onInteract((player) => {
  $.log(`setPlayerScript: assigning Player Script to ${player.userDisplayName}.`);
  $.setPlayerScript(player);

  if (playerScriptActivationStatusText) {
    playerScriptActivationStatusText.unityProp.text =
      `Player Script assigned to\n${player.userDisplayName}.`;
  }
});
