function assertNotLoaded(name, mod) {
  try {
    // touching getter will throw if someone imported it
    // eslint-disable-next-line no-unused-expressions
    mod[name];
  } catch (e) {
    if (/DEPRECATED: pendingClarifications/.test(e.message)) return; // good: guarded
    console.warn('[DEPRECATION] Access detected for', name, e.message);
  }
}
module.exports = { assertNotLoaded };
