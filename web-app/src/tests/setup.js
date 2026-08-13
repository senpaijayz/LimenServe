import { vi } from 'vitest';

// Tests use synthetic public values so production code can fail closed when
// deployment configuration is missing without requiring real credentials.
vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
