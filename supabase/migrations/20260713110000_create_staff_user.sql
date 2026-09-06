-- Create Staff User via Edge Function approach
-- This uses Supabase's built-in password hashing

DO $$
DECLARE
    new_user_id uuid;
BEGIN
    -- Check if staff user already exists
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'staff@breakpointarena.com') THEN

        -- Generate new user ID
        new_user_id := gen_random_uuid();

        -- Insert into auth.users
        INSERT INTO auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            confirmation_sent_at,
            recovery_sent_at,
            email_change_sent_at,
            created_at,
            updated_at,
            raw_app_meta_data,
            raw_user_meta_data,
            is_super_admin,
            confirmation_token,
            email_change,
            email_change_token_new,
            recovery_token
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            new_user_id,
            'authenticated',
            'authenticated',
            'staff@breakpointarena.com',
            extensions.crypt('Staff@123', extensions.gen_salt('bf')),
            NOW(),
            NOW(),
            NOW(),
            NOW(),
            NOW(),
            NOW(),
            jsonb_build_object('provider', 'email', 'providers', ARRAY['email'], 'role', 'staff'),
            jsonb_build_object('full_name', 'Arena Staff', 'role', 'staff'),
            false,
            '',
            '',
            '',
            ''
        );

        -- Insert into auth.identities
        INSERT INTO auth.identities (
            id,
            user_id,
            provider_id,
            provider,
            identity_data,
            last_sign_in_at,
            created_at,
            updated_at
        ) VALUES (
            gen_random_uuid(),
            new_user_id,
            new_user_id::text,
            'email',
            jsonb_build_object(
                'sub', new_user_id::text,
                'email', 'staff@breakpointarena.com',
                'email_verified', true,
                'phone_verified', false
            ),
            NOW(),
            NOW(),
            NOW()
        );

        RAISE NOTICE '✅ Staff user created: staff@breakpointarena.com / Staff@123';

    ELSE
        RAISE NOTICE '✅ Staff user already exists: staff@breakpointarena.com';
    END IF;
END $$;

-- Verify the user was created
DO $$
DECLARE
    user_record RECORD;
BEGIN
    SELECT id, email, raw_user_meta_data->>'role' as role
    INTO user_record
    FROM auth.users
    WHERE email = 'staff@breakpointarena.com';

    IF FOUND THEN
        RAISE NOTICE 'User verified - ID: %, Email: %, Role: %', user_record.id, user_record.email, user_record.role;
    ELSE
        RAISE WARNING 'Staff user verification failed!';
    END IF;
END $$;
