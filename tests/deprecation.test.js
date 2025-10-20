const { assertNotLoaded } = require('../src/boot/deprecationCheck');

describe('Deprecation Checks', () => {
  it('should throw when accessing deprecated pendingClarifications in uxButtons.js', () => {
    const uxButtons = require('../src/handlers/uxButtons.js');
    expect(() => uxButtons.pendingClarifications).toThrow(/DEPRECATED/);
  });

  it('should throw when accessing deprecated pendingClarifications in buttonHandlers.js', () => {
    const buttonHandlers = require('../src/handlers/buttonHandlers.js');
    expect(() => buttonHandlers.pendingClarifications).toThrow(/DEPRECATED/);
  });
});
