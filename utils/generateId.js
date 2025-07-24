// utils/generateId.js
module.exports = function generateId() {
  return Math.random().toString(36).substr(2, 9);
};
