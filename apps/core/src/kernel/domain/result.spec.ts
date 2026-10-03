import { Result, ok, err } from './result';

describe('Result', () => {
  describe('ok', () => {
    it('creates a successful result', () => {
      const result = ok(42);
      expect(result.ok).toBe(true);
      expect(result.value).toBe(42);
    });

    it('wraps any value type', () => {
      const stringResult = ok('hello');
      expect(stringResult.value).toBe('hello');

      const objResult = ok({ name: 'Alice', age: 30 });
      expect(objResult.value).toEqual({ name: 'Alice', age: 30 });

      const arrayResult = ok([1, 2, 3]);
      expect(arrayResult.value).toEqual([1, 2, 3]);
    });

    it('wraps null and undefined', () => {
      const nullResult = ok(null);
      expect(nullResult.ok).toBe(true);
      expect(nullResult.value).toBe(null);

      const undefinedResult = ok(undefined);
      expect(undefinedResult.ok).toBe(true);
      expect(undefinedResult.value).toBeUndefined();
    });
  });

  describe('err', () => {
    it('creates a failed result', () => {
      const result = err(new Error('Something went wrong'));
      expect(result.ok).toBe(false);
      expect(result.error).toEqual(new Error('Something went wrong'));
    });

    it('wraps any error type', () => {
      const stringError = err('error message');
      expect(stringError.ok).toBe(false);
      expect(stringError.error).toBe('error message');

      const objError = err({ code: 'NOT_FOUND', message: 'Resource not found' });
      expect(objError.ok).toBe(false);
      expect(objError.error).toEqual({ code: 'NOT_FOUND', message: 'Resource not found' });
    });
  });

  describe('result type guard pattern', () => {
    function divide(a: number, b: number): Result<number, string> {
      if (b === 0) {
        return err('Division by zero');
      }
      return ok(a / b);
    }

    it('can be used in pattern matching', () => {
      const result = divide(10, 2);

      if (result.ok) {
        expect(result.value).toBe(5);
      } else {
        fail('Should be ok');
      }
    });

    it('handles error case', () => {
      const result = divide(10, 0);

      if (result.ok) {
        fail('Should be err');
      } else {
        expect(result.error).toBe('Division by zero');
      }
    });
  });

  describe('type safety', () => {
    it('ok result is typed as success', () => {
      const result: Result<number, string> = ok(42);

      if (result.ok) {
        const value: number = result.value;
        expect(value).toBe(42);
      }
    });

    it('err result is typed as failure', () => {
      const result: Result<number, string> = err('error');

      if (!result.ok) {
        const error: string = result.error;
        expect(error).toBe('error');
      }
    });
  });

  describe('discriminated union', () => {
    it('uses ok field as discriminator', () => {
      const successResult = ok(100);
      const failureResult = err('failed');

      expect(successResult.ok).toBe(true);
      expect(failureResult.ok).toBe(false);
    });

    it('type narrowing based on ok field', () => {
      const results: Result<number, string>[] = [ok(1), err('failed'), ok(2)];

      results.forEach((r) => {
        if (r.ok) {
          const n: number = r.value;
          expect(typeof n).toBe('number');
        } else {
          const s: string = r.error;
          expect(typeof s).toBe('string');
        }
      });
    });
  });
});
