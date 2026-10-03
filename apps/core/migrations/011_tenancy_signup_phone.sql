-- M01 fix: verifying a solo signup creates the owner with their phone, so the phone must be recoverable.
-- phone_hash stays for rate limiting; phone_enc holds the AES-GCM ciphertext (platform data key). P2 personal data.
ALTER TABLE solo_signup ADD COLUMN IF NOT EXISTS phone_enc text;
COMMENT ON COLUMN solo_signup.phone_enc IS 'P2 (encrypted)';
CREATE INDEX IF NOT EXISTS solo_signup_phone_hash_idx ON solo_signup (phone_hash, created_at);
