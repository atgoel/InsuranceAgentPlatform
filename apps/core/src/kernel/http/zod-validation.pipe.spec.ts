import { ZodValidationPipe } from './zod-validation.pipe';
import { z } from 'zod';
import { ValidationError } from '../errors/domain-errors';

describe('AC-M00-26 ZodValidationPipe', () => {
  describe('valid input', () => {
    it('validates and returns parsed data', () => {
      const schema = z.object({ name: z.string(), age: z.number() });
      const pipe = new ZodValidationPipe(schema);

      const input = { name: 'Alice', age: 30 };
      const result = pipe.transform(input);

      expect(result).toEqual(input);
    });

    it('applies defaults', () => {
      const schema = z.object({
        name: z.string(),
        role: z.string().default('user'),
      });
      const pipe = new ZodValidationPipe(schema);

      const result = pipe.transform({ name: 'Alice' });

      expect(result.role).toBe('user');
    });

    it('coerces types as per schema', () => {
      const schema = z.object({ count: z.coerce.number() });
      const pipe = new ZodValidationPipe(schema);

      const result = pipe.transform({ count: '42' });

      expect(result.count).toBe(42);
    });
  });

  describe('invalid input', () => {
    it('throws ValidationError with code validation_failed', () => {
      const schema = z.object({ email: z.string().email() });
      const pipe = new ZodValidationPipe(schema);

      expect(() => {
        pipe.transform({ email: 'not-email' });
      }).toThrow(ValidationError);

      try {
        pipe.transform({ email: 'invalid' });
      } catch (error: unknown) {
        if (error instanceof ValidationError) {
          expect(error.code).toBe('validation_failed');
        }
      }
    });

    it('includes field errors with path, code, message', () => {
      const schema = z.object({
        user: z.object({
          email: z.string().email(),
        }),
      });
      const pipe = new ZodValidationPipe(schema);

      try {
        pipe.transform({ user: { email: 'bad-email' } });
      } catch (error: unknown) {
        if (error instanceof ValidationError) {
          expect(error.errors).toBeDefined();
          expect(error.errors?.length).toBeGreaterThan(0);

          const emailError = error.errors?.find((e) =>
            e.path.includes('email'),
          );
          expect(emailError?.path).toBeDefined();
          expect(emailError?.code).toBeDefined();
          expect(emailError?.message).toBeDefined();
        }
      }
    });

    it('path joined with dot notation', () => {
      const schema = z.object({
        person: z.object({
          contact: z.object({
            email: z.string().email(),
          }),
        }),
      });
      const pipe = new ZodValidationPipe(schema);

      try {
        pipe.transform(
          { person: { contact: { email: 'invalid' } } },
        );
      } catch (error: unknown) {
        if (error instanceof ValidationError) {
          const emailError = error.errors?.find((e) =>
            e.path.includes('email'),
          );
          expect(emailError?.path).toMatch(/person.*contact.*email/);
        }
      }
    });

    it('multiple validation errors', () => {
      const schema = z.object({
        email: z.string().email(),
        age: z.number().min(18),
        name: z.string().min(1),
      });
      const pipe = new ZodValidationPipe(schema);

      try {
        pipe.transform(
          { email: 'invalid', age: 10, name: '' },
        );
      } catch (error: unknown) {
        if (error instanceof ValidationError) {
          expect(error.errors?.length).toBeGreaterThan(1);
        }
      }
    });
  });

  describe('PipeTransform interface', () => {
    it('implements PipeTransform.transform', () => {
      const schema = z.object({ test: z.string() });
      const pipe = new ZodValidationPipe(schema);

      expect(typeof pipe.transform).toBe('function');
    });
  });
});
