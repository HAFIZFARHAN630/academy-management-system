const sqlite3 = require('better-sqlite3');
const path = require('path');
const db = new sqlite3(path.join(__dirname, 'academy.db'));
const users = db.prepare("SELECT login_id, role, password FROM users").all();
console.log(JSON.stringify(users, null, 2));
