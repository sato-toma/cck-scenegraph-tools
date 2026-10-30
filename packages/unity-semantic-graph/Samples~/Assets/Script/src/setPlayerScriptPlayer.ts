let hasLoggedActivation = false;

_.onFrame(() => {
  if (hasLoggedActivation) {
    return;
  }

  hasLoggedActivation = true;
  _.log(`Player Script activated for ${_.playerId}.`);
});
