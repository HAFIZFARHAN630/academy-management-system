const jwt = require('jsonwebtoken');
const supabase = require('../database/supabase');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';

async function authMiddleware(req, res, next) {
    const header = req.headers['authorization'] || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'No token provided' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        const { data: user, error } = await supabase
            .from('users')
            .select('id, login_id, full_name, role, status')
            .eq('id', decoded.id)
            .single();

        if (error || !user || user.status === 'locked') {
            return res.status(401).json({ error: 'Account locked or not found' });
        }
        req.user = user;
        next();
    } catch (err) {
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
