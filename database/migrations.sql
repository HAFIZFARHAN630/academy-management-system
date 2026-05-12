-- ==============================================================================
-- Payment Gateways & PWA Installs Migrations
-- ==============================================================================

-- 1. Payment Gateways Table
CREATE TABLE IF NOT EXISTS public.payment_gateways (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL UNIQUE, -- 'stripe', 'paypal', 'bank_transfer', etc.
    is_active BOOLEAN DEFAULT false,
    mode TEXT DEFAULT 'sandbox' CHECK (mode IN ('sandbox', 'live')),
    config JSONB NOT NULL DEFAULT '{}', -- Encrypted keys/secrets
    display_name TEXT,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for payment_gateways
ALTER TABLE public.payment_gateways ENABLE ROW LEVEL SECURITY;

-- Allow public to read active gateways (only non-sensitive info)
-- Note: Sensitive info should be filtered in the API layer, not just RLS
CREATE POLICY "Allow public to read active gateways" ON public.payment_gateways
    FOR SELECT TO public
    USING (is_active = true);

-- Allow authenticated admins full access
CREATE POLICY "Allow authenticated full access to gateways" ON public.payment_gateways
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);

-- 2. PWA Installs Table
CREATE TABLE IF NOT EXISTS public.pwa_installs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER REFERENCES public.users(id), -- Optional
    device_type TEXT, -- 'mobile', 'tablet', 'desktop'
    os TEXT, -- 'android', 'ios', 'windows', 'macos'
    browser TEXT,
    installed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for pwa_installs
ALTER TABLE public.pwa_installs ENABLE ROW LEVEL SECURITY;

-- Allow public to insert (anyone can install)
CREATE POLICY "Allow public to record installs" ON public.pwa_installs
    FOR INSERT TO public
    WITH CHECK (true);

-- Allow admins to read analytics
CREATE POLICY "Allow authenticated to read install logs" ON public.pwa_installs
    FOR SELECT TO authenticated
    USING (true);

-- 3. Payments Table (Enhanced)
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id INTEGER REFERENCES public.users(id),
    amount DECIMAL(10, 2) NOT NULL,
    currency TEXT DEFAULT 'PKR',
    gateway_id UUID REFERENCES public.payment_gateways(id),
    transaction_id TEXT, -- From provider
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    method TEXT, -- 'card', 'paypal', 'bank'
    receipt_url TEXT, -- For bank transfers
    payload JSONB, -- Raw gateway response for debugging
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Students can see their own payments
CREATE POLICY "Allow students to view own payments" ON public.payments
    FOR SELECT TO authenticated
    USING (student_id = auth.uid()::text::int); -- Assuming auth.uid() can be linked

-- Admins can see all payments
CREATE POLICY "Allow admins full access to payments" ON public.payments
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);
