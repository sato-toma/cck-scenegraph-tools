$.onRide((isGetOn, player) => {
  $.log(`${player.userDisplayName} ${isGetOn ? "got on" : "got off"}.`);
});
