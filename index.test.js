let projectRepl = require('.');

let Requirer = projectRepl.Requirer;

test('Requires everything', async () => {
  let into = {};
  let r = new Requirer(
    '.',
    (...args) => {
      return require(...args);
    },
    { into }
  );
  await r.requireAsync();
  expect(into.Requirer).toBeDefined();
  expect(into.index).toBeDefined();
});
