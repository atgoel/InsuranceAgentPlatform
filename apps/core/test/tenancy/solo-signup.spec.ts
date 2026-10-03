import { createTestApp, TestApp } from '../support/test-app';

/**
 * AC-M01-10: Solo signup endpoints for phone/licence/consent → OTP → success,
 * with OTP hashing, attempt tracking, locking, expiry, and rate limiting.
 */
describe('solo signup endpoints (AC-M01-10)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  /**
   * AC-M01-10: OTP stored only as a hash and never logged.
   */
  describe('POST /api/v1/public/solo-signups (AC-M01-10)', () => {
    it('starts a signup with phone, licence, and consent', async () => {
      const response = await testApp.http
        .post('/api/v1/public/solo-signups')
        .send({
          phone: '9876543210',
          displayName: 'John Agent',
          licence: {
            insurerName: 'Reliance',
            line: 'LIFE',
            licenceNo: 'LIC-2024-001',
          },
          consent: {
            noticeVersion: '1.0',
            accepted: true,
          },
        });

      expect(response.status).toBe(201);
      expect(response.body.signupId).toBeDefined();
      expect(response.body.expiresAt).toBeDefined();
    });

    it('rejects signup without consent', async () => {
      const response = await testApp.http
        .post('/api/v1/public/solo-signups')
        .send({
          phone: '9876543210',
          displayName: 'John Agent',
          licence: {
            insurerName: 'Reliance',
            line: 'LIFE',
            licenceNo: 'LIC-2024-001',
          },
          consent: {
            noticeVersion: '1.0',
            accepted: false,
          },
        });

      expect(response.status).toBe(400);
    });

    it('rate limits: more than 3 signups per phone per hour', async () => {
      const phone = '9876543211'; // Different phone for rate limit test
      const request = {
        phone,
        displayName: 'Test',
        licence: {
          insurerName: 'Reliance',
          line: 'LIFE',
          licenceNo: 'LIC-001',
        },
        consent: {
          noticeVersion: '1.0',
          accepted: true,
        },
      };

      // Start 4 signups
      const responses = await Promise.all(
        Array.from({ length: 4 }, () =>
          testApp.http.post('/api/v1/public/solo-signups').send(request),
        ),
      );

      // First 3 should succeed
      expect(responses[0].status).toBe(201);
      expect(responses[1].status).toBe(201);
      expect(responses[2].status).toBe(201);

      // 4th should be rate limited
      expect(responses[3].status).toBe(429);
      if (responses[3].status === 429) {
        expect(responses[3].body.code).toBe('signup_rate_limited');
      }
    });

    it('requires consent.accepted === true', async () => {
      const response = await testApp.http
        .post('/api/v1/public/solo-signups')
        .send({
          phone: '9876543212',
          displayName: 'Test',
          licence: {
            insurerName: 'Reliance',
            line: 'LIFE',
            licenceNo: 'LIC-002',
          },
          consent: {
            noticeVersion: '1.0',
            accepted: 'true', // String instead of boolean
          },
        });

      expect(response.status).toBe(400);
    });

    it('validates phone format', async () => {
      const response = await testApp.http
        .post('/api/v1/public/solo-signups')
        .send({
          phone: 'invalid-phone',
          displayName: 'Test',
          licence: {
            insurerName: 'Reliance',
            line: 'LIFE',
            licenceNo: 'LIC-003',
          },
          consent: {
            noticeVersion: '1.0',
            accepted: true,
          },
        });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('validation_failed');
    });

    it('validates displayName length 2..80', async () => {
      const response1 = await testApp.http
        .post('/api/v1/public/solo-signups')
        .send({
          phone: '9876543213',
          displayName: 'A',
          licence: {
            insurerName: 'Reliance',
            line: 'LIFE',
            licenceNo: 'LIC-004',
          },
          consent: {
            noticeVersion: '1.0',
            accepted: true,
          },
        });

      expect(response1.status).toBe(400);

      const response2 = await testApp.http
        .post('/api/v1/public/solo-signups')
        .send({
          phone: '9876543214',
          displayName: 'A'.repeat(81),
          licence: {
            insurerName: 'Reliance',
            line: 'LIFE',
            licenceNo: 'LIC-005',
          },
          consent: {
            noticeVersion: '1.0',
            accepted: true,
          },
        });

      expect(response2.status).toBe(400);
    });

    it('is idempotent (Idempotency-Key)', async () => {
      const idempotencyKey = 'sig-test-' + Math.random();
      const request = {
        phone: '9876543215',
        displayName: 'Idempotent Test',
        licence: {
          insurerName: 'Reliance',
          line: 'LIFE',
          licenceNo: 'LIC-006',
        },
        consent: {
          noticeVersion: '1.0',
          accepted: true,
        },
      };

      const response1 = await testApp.http
        .post('/api/v1/public/solo-signups')
        .set('Idempotency-Key', idempotencyKey)
        .send(request);

      const response2 = await testApp.http
        .post('/api/v1/public/solo-signups')
        .set('Idempotency-Key', idempotencyKey)
        .send(request);

      expect(response1.status).toBe(201);
      expect(response2.status).toBe(201);
      expect(response2.body.signupId).toBe(response1.body.signupId);
    });
  });

  /**
   * AC-M01-10: OTP never logged, wrong OTP increments attempts, 5 failures lock.
   */
  describe('POST /api/v1/public/solo-signups/{id}/verifications (AC-M01-10)', () => {
    let signupId: string;

    beforeEach(async () => {
      const response = await testApp.http
        .post('/api/v1/public/solo-signups')
        .send({
          phone: `${Math.floor(Math.random() * 1000000000) + 6000000000}`,
          displayName: 'OTP Test',
          licence: {
            insurerName: 'Reliance',
            line: 'LIFE',
            licenceNo: 'LIC-OTP-001',
          },
          consent: {
            noticeVersion: '1.0',
            accepted: true,
          },
        });

      signupId = response.body.signupId;
    });

    it('verifies with correct OTP', async () => {
      const response = await testApp.http
        .post(`/api/v1/public/solo-signups/${signupId}/verifications`)
        .send({ otp: '123456' });

      expect([200, 201]).toContain(response.status);
      if (response.status === 200 || response.status === 201) {
        expect(response.body.tenantId).toBeDefined();
        expect(response.body.host).toBeDefined();
        expect(response.body.status).toBe('active');
      }
    });

    it('rejects invalid OTP format', async () => {
      const response = await testApp.http
        .post(`/api/v1/public/solo-signups/${signupId}/verifications`)
        .send({ otp: 'abc123' });

      expect(response.status).toBe(400);
    });

    it('rejects OTP not matching format /^\\d{6}$/', async () => {
      const response1 = await testApp.http
        .post(`/api/v1/public/solo-signups/${signupId}/verifications`)
        .send({ otp: '12345' }); // 5 digits

      expect(response1.status).toBe(400);

      const response2 = await testApp.http
        .post(`/api/v1/public/solo-signups/${signupId}/verifications`)
        .send({ otp: '1234567' }); // 7 digits

      expect(response2.status).toBe(400);
    });

    it('returns otp_invalid on wrong OTP', async () => {
      const response = await testApp.http
        .post(`/api/v1/public/solo-signups/${signupId}/verifications`)
        .send({ otp: '000000' });

      expect(response.status).toBe(422);
      expect(response.body.code).toBe('otp_invalid');
    });

    it('tracks attempts and locks on 5 failures', async () => {
      // Attempt 1-4: fail
      for (let i = 0; i < 4; i++) {
        await testApp.http
          .post(`/api/v1/public/solo-signups/${signupId}/verifications`)
          .send({ otp: `00000${i}` });
      }

      // Attempt 5: lock
      const response5 = await testApp.http
        .post(`/api/v1/public/solo-signups/${signupId}/verifications`)
        .send({ otp: '000004' });

      expect(response5.status).toBe(422);
      expect(response5.body.code).toBe('otp_locked');
    });

    it('rejects verification when locked', async () => {
      // Lock it first (5 attempts)
      for (let i = 0; i < 5; i++) {
        await testApp.http
          .post(`/api/v1/public/solo-signups/${signupId}/verifications`)
          .send({ otp: `00000${i % 10}` });
      }

      // Try to verify with correct OTP
      const response = await testApp.http
        .post(`/api/v1/public/solo-signups/${signupId}/verifications`)
        .send({ otp: '123456' });

      expect(response.status).toBe(422);
      expect(response.body.code).toMatch(/otp_locked|signup_not_pending/);
    });

    it('OTP never in logs (MemoryLogSink assertion)', async () => {
      testApp.logs.clear();

      await testApp.http
        .post(`/api/v1/public/solo-signups/${signupId}/verifications`)
        .send({ otp: '123456' });

      // Check that no log record contains the OTP
      const allRecords = JSON.stringify(testApp.logs.records);
      expect(allRecords).not.toContain('123456');
    });

    it('returns otp_expired when OTP time has passed', async () => {
      // Advance clock by 11 minutes
      testApp.clock.advance(11 * 60 * 1000);

      const response = await testApp.http
        .post(`/api/v1/public/solo-signups/${signupId}/verifications`)
        .send({ otp: '123456' });

      expect(response.status).toBe(422);
      expect(response.body.code).toBe('otp_expired');
    });

    it('provisions an active SOLO tenant on success', async () => {
      const response = await testApp.http
        .post(`/api/v1/public/solo-signups/${signupId}/verifications`)
        .send({ otp: '123456' });

      expect(response.status).toBe(200);
      if (response.status === 200) {
        expect(response.body.tenantId).toMatch(/^ten_/);
        expect(response.body.status).toBe('active');
        expect(response.body.licenceStatus).toBe('pending_verification');
      }
    });

    it('is idempotent (Idempotency-Key)', async () => {
      const idempotencyKey = 'verify-' + Math.random();

      const response1 = await testApp.http
        .post(`/api/v1/public/solo-signups/${signupId}/verifications`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ otp: '123456' });

      const response2 = await testApp.http
        .post(`/api/v1/public/solo-signups/${signupId}/verifications`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ otp: '123456' });

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      expect(response2.body.tenantId).toBe(response1.body.tenantId);
    });
  });
});
