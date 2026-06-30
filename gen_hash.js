const bcrypt = require('bcryptjs');
const hash = bcrypt.hashSync('admin123', 10);
console.log('Plaintext: admin123');
console.log('Hash: ' + hash);
console.log('Compare result: ' + bcrypt.compareSync('admin123', hash));
