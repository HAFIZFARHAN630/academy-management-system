const router = require('express').Router();
const supabase = require('../database/supabase');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { encrypt, decrypt } = require('../services/encryption');

// ─── Admin Endpoints ──────────────────────────────────────────────────────────

// GET /api/payments/gateways (Admin only - includes sensitive keys)
router.get('/gateways/admin', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const { data, error } = await supabase.from('payment_gateways').select('*');
        if (error) throw error;
        
        // Decrypt config before sending to admin
        const decryptedData = data.map(g => ({
            ...g,
            config: g.config ? JSON.parse(decrypt(g.config.encrypted) || '{}') : {}
        }));
        
        res.json(decryptedData);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/payments/gateways (Admin only)
router.post('/gateways', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const { provider, is_active, mode, config, display_name, description } = req.body;
        
        const encryptedConfig = {
            encrypted: encrypt(JSON.stringify(config))
        };
        
        const { data, error } = await supabase.from('payment_gateways').insert({
            provider,
            is_active,
            mode,
            config: encryptedConfig,
            display_name,
            description
        }).select().single();
        
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/payments/gateways/:id (Admin only)
router.put('/gateways/:id', authMiddleware, requireRole('admin'), async (req, res) => {
    try {
        const { is_active, mode, config, display_name, description } = req.body;
        
        const updates = { is_active, mode, display_name, description, updated_at: new Date().toISOString() };
        if (config) {
            updates.config = {
                encrypted: encrypt(JSON.stringify(config))
            };
        }
        
        const { data, error } = await supabase.from('payment_gateways').update(updates).eq('id', req.params.id).select().single();
        
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Public Endpoints ─────────────────────────────────────────────────────────

// GET /api/payments/gateways (Public - only non-sensitive info)
router.get('/gateways', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('payment_gateways')
            .select('id, provider, display_name, description, mode')
            .eq('is_active', true);
            
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Webhooks ─────────────────────────────────────────────────────────────────

router.post('/webhooks/:provider', async (req, res) => {
    const { provider } = req.params;
    const payload = req.body;
    const signature = req.headers['stripe-signature'] || req.headers['paypal-transmission-sig'];
    
    console.log(`Received webhook from ${provider}`);
    
    // Logic for verifying signature and updating payment status goes here
    // For now, just return 200
    res.json({ received: true });
});

module.exports = router;
