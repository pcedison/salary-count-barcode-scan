// mocks/getSettings.js
module.exports.getSettings = jest.fn(() => {
  return {
    someKey: 'defaultValue',
    anotherKey: 'anotherDefaultValue'
  };
});