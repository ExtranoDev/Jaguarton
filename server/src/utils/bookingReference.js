const { customAlphabet } = require('nanoid');

// No 0/O/1/I to avoid ambiguity when read aloud or typed at a demo.
const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const nanoid = customAlphabet(alphabet, 6);

function generateBookingReference() {
  return `EVB-${nanoid()}`;
}

module.exports = { generateBookingReference };
