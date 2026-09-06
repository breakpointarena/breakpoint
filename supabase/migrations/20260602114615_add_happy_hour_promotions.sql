--  Create a custom ENUM type for strict status validation
CREATE TYPE happy_hour_status AS ENUM ('LIVE', 'PAUSED', 'SCHEDULED');


CREATE TABLE happy_hour_rules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    discount NUMERIC NOT NULL CHECK (discount >= 0 AND discount <= 100),
    devices TEXT NOT NULL,
    schedule TEXT NOT NULL,
    time_range TEXT NOT NULL, 
    status happy_hour_status DEFAULT 'SCHEDULED' NOT NULL,
    
    -- Standard Supabase Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL, 
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

--  Set up a trigger to automatically update the 'updated_at' timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_happy_hour_rules_updated_at
    BEFORE UPDATE ON happy_hour_rules
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

--  Row Level Security (RLS) Configuration
-- Enable RLS (Highly recommended in Supabase)
ALTER TABLE happy_hour_rules ENABLE ROW LEVEL SECURITY;

-- Create basic policies for Authenticated users (Admin dashboard)
-- Adjust these based on your specific auth setup (e.g., checking user roles)
CREATE POLICY "Allow authenticated users to view rules" 
    ON happy_hour_rules FOR SELECT 
    TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to insert rules" 
    ON happy_hour_rules FOR INSERT 
    TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update rules" 
    ON happy_hour_rules FOR UPDATE 
    TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to delete rules" 
    ON happy_hour_rules FOR DELETE 
    TO authenticated USING (true);