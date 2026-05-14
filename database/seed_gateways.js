const supabase = require('./supabase');

async function seedGateways() {
    const defaultGateways = [
        {
            provider: 'stripe',
            display_name: 'Credit/Debit Card (Stripe)',
            description: 'Secure payment via Stripe Checkout',
            mode: 'sandbox',
            is_active: false,
            config: { encrypted: null }
        },
        {
            provider: 'paypal',
            display_name: 'PayPal',
            description: 'Pay via your PayPal account or Card',
            mode: 'sandbox',
            is_active: false,
            config: { encrypted: null }
        },
        {
            provider: 'bank_transfer',
            display_name: 'Bank Transfer',
            description: 'Direct transfer to our bank account',
            mode: 'live',
            is_active: true,
            config: { encrypted: null }
        }
    ];

    for (const g of defaultGateways) {
        const { data: existing } = await supabase.from('payment_gateways').select('id').eq('provider', g.provider).maybeSingle();
        if (!existing) {
            await supabase.from('payment_gateways').insert(g);
            console.log(`✅ Seeded gateway: ${g.provider}`);
        }
    }
}

module.exports = { seedGateways };
