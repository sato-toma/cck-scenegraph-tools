$.onStart(() => {
  const position = $.getPosition();
  $.log(
    `getPosition returned (${position.x}, ${position.y}, ${position.z}).`,
  );
});
