const jwt = require('jsonwebtoken');
const db = require('../database/db');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';

function authMiddleware(req, res, next) {
    const header = req.headers['authorization'] || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'No token provided' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = db.prepare('SELECT id, login_id, full_name, role, status FROM users WHERE id = ?').get(decoded.id);
        if (!user || user.status === 'locked') {
            return res.status(401).json({ error: 'Account locked or not found' });
        }
        req.user = user;
        next();
    } catch {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}

function requireRole(...roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user?.role)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        next();
    };
}

module.exports = { authMiddleware, requireRole };
