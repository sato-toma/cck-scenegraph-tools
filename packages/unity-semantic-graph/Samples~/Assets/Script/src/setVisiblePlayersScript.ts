const visibilityStatusText =
  $.subNode("API_Label").getUnityComponent("TextMesh");

$.onStart(() => {
  $.state.visiblePlayerIds = [];
  $.log("setVisiblePlayers sample started. Enter the cube to limit visibility.");
  if (visibilityStatusText) {
    visibilityStatusText.unityProp.text =
      "setVisiblePlayers\nEnter: visible to overlapping players.\nExit: visible to everyone.";
  }
});

$.onUpdate(() => {
  const previousPlayerIds = (
    Array.isArray($.state.visiblePlayerIds) ? $.state.visiblePlayerIds : []
  ) as string[];
  const overlappingPlayers = new Map<string, PlayerHandle>();

  for (const overlap of $.getOverlaps()) {
    const handle = overlap.handle;
    if (handle?.type === "player") {
      overlappingPlayers.set(handle.id, handle);
    }
  }

  const currentPlayers = [...overlappingPlayers.values()]
    .sort((left, right) =>
      left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
    )
    .slice(0, 64);
  const currentPlayerIds = currentPlayers.map((player) => player.id);
  const playerSetChanged =
    currentPlayerIds.length !== previousPlayerIds.length ||
    currentPlayerIds.some((playerId) => !previousPlayerIds.includes(playerId));

  if (!playerSetChanged) {
    return;
  }

  $.state.visiblePlayerIds = currentPlayerIds;
  if (currentPlayers.length > 0) {
    $.setVisiblePlayers(currentPlayers);
    $.log(`Item is visible to ${currentPlayers.length} overlapping player(s).`);
    if (visibilityStatusText) {
      visibilityStatusText.unityProp.text = `setVisiblePlayers\nVisible to ${currentPlayers.length} overlapping player(s).`;
    }
  } else {
    $.clearVisiblePlayers();
    $.log("No overlapping players. Item is visible to everyone.");
    if (visibilityStatusText) {
      visibilityStatusText.unityProp.text =
        "clearVisiblePlayers\nNo overlap: visible to everyone.";
    }
  }
});
