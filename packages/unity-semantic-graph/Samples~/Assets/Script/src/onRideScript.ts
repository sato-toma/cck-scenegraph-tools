const rideStatusText = $.subNode("API_Label").getUnityComponent("TextMesh");

$.onRide((isGetOn, player) => {
  const status = `${player.userDisplayName} ${isGetOn ? "got on" : "got off"}.`;
  $.log(status);
  if (rideStatusText) {
    rideStatusText.unityProp.text = `onRide\n${status}`;
  }
});
