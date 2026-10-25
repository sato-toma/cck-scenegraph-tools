$.onGrab((isGrab, isLeftHand) => {
  if (isGrab) {
    const player = $.getGrabbingPlayer();
    const hand = isLeftHand ? "left" : "right";
    $.log(
      `grabbed by ${hand} hand. player: ${player?.userDisplayName ?? "unavailable"}`,
    );
  }
});
