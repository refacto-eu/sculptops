// Valid 64-char hex string for AES-256-GCM (32 bytes)
process.env.ENCRYPTION_KEY = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
// Prevents "DATABASE_URL not set" errors on module load (not actually connected in unit tests)
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test_unused";
