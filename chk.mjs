import bcrypt from 'bcryptjs';
const hash = '$2b$10$u3tsaZCHHmxJYjW7e1s9tuTmN/dgHPZFcRHCzFIheMTF9cn4eLx5O';
console.log('admin123:', bcrypt.compareSync('admin123', hash));
console.log('admin@example.com:', bcrypt.compareSync('admin@example.com', hash));
