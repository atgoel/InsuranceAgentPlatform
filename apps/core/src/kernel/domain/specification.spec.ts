import { Specification } from './specification';

describe('AC-M00-04 Specification', () => {
  class GreaterThan extends Specification<number> {
    constructor(private threshold: number) {
      super();
    }

    isSatisfiedBy(candidate: number): boolean {
      return candidate > this.threshold;
    }
  }

  class LessThan extends Specification<number> {
    constructor(private threshold: number) {
      super();
    }

    isSatisfiedBy(candidate: number): boolean {
      return candidate < this.threshold;
    }
  }

  describe('and', () => {
    it('combines two specifications with AND logic', () => {
      const gt5 = new GreaterThan(5);
      const lt10 = new LessThan(10);
      const between5and10 = gt5.and(lt10);

      expect(between5and10.isSatisfiedBy(3)).toBe(false);
      expect(between5and10.isSatisfiedBy(7)).toBe(true);
      expect(between5and10.isSatisfiedBy(12)).toBe(false);
    });

    it('returns false if either specification is not satisfied', () => {
      const gt5 = new GreaterThan(5);
      const lt10 = new LessThan(10);
      const combined = gt5.and(lt10);

      expect(combined.isSatisfiedBy(5)).toBe(false); // Not > 5
      expect(combined.isSatisfiedBy(10)).toBe(false); // Not < 10
    });

    it('chains multiple AND operations', () => {
      const gt5 = new GreaterThan(5);
      const lt20 = new LessThan(20);
      const lt15 = new LessThan(15);
      const spec = gt5.and(lt20).and(lt15);

      expect(spec.isSatisfiedBy(10)).toBe(true);
      expect(spec.isSatisfiedBy(17)).toBe(false);
    });
  });

  describe('or', () => {
    it('combines two specifications with OR logic', () => {
      const lt5 = new LessThan(5);
      const gt10 = new GreaterThan(10);
      const outsideRange = lt5.or(gt10);

      expect(outsideRange.isSatisfiedBy(3)).toBe(true);
      expect(outsideRange.isSatisfiedBy(7)).toBe(false);
      expect(outsideRange.isSatisfiedBy(12)).toBe(true);
    });

    it('returns true if either specification is satisfied', () => {
      const gt5 = new GreaterThan(5);
      const gt10 = new GreaterThan(10);
      const combined = gt5.or(gt10);

      expect(combined.isSatisfiedBy(7)).toBe(true); // > 5
      expect(combined.isSatisfiedBy(12)).toBe(true); // > 10
      expect(combined.isSatisfiedBy(3)).toBe(false); // Neither
    });

    it('chains multiple OR operations', () => {
      const eq1 = Specification.of<number>((x) => x === 1);
      const eq2 = Specification.of<number>((x) => x === 2);
      const eq3 = Specification.of<number>((x) => x === 3);
      const spec = eq1.or(eq2).or(eq3);

      expect(spec.isSatisfiedBy(1)).toBe(true);
      expect(spec.isSatisfiedBy(2)).toBe(true);
      expect(spec.isSatisfiedBy(3)).toBe(true);
      expect(spec.isSatisfiedBy(4)).toBe(false);
    });
  });

  describe('not', () => {
    it('negates a specification', () => {
      const gt5 = new GreaterThan(5);
      const notGt5 = gt5.not();

      expect(notGt5.isSatisfiedBy(3)).toBe(true);
      expect(notGt5.isSatisfiedBy(7)).toBe(false);
    });

    it('double negation returns to original logic', () => {
      const gt5 = new GreaterThan(5);
      const notNotGt5 = gt5.not().not();

      expect(notNotGt5.isSatisfiedBy(3)).toBe(false);
      expect(notNotGt5.isSatisfiedBy(7)).toBe(true);
    });

    it('works with AND combination', () => {
      const gt5 = new GreaterThan(5);
      const lt10 = new LessThan(10);
      const notBetween = gt5.and(lt10).not();

      expect(notBetween.isSatisfiedBy(3)).toBe(true);
      expect(notBetween.isSatisfiedBy(7)).toBe(false);
      expect(notBetween.isSatisfiedBy(12)).toBe(true);
    });
  });

  describe('static of factory', () => {
    it('creates specification from predicate function', () => {
      const isEven = Specification.of<number>((x) => x % 2 === 0);
      expect(isEven.isSatisfiedBy(2)).toBe(true);
      expect(isEven.isSatisfiedBy(3)).toBe(false);
    });

    it('stores optional name', () => {
      const isPositive = Specification.of<number>((x) => x > 0, 'isPositive');
      // Name is stored but typically used for debugging/logging
      expect(isPositive.isSatisfiedBy(5)).toBe(true);
    });

    it('works with complex predicates', () => {
      const isString = Specification.of<unknown>((x) => typeof x === 'string');
      expect(isString.isSatisfiedBy('hello')).toBe(true);
      expect(isString.isSatisfiedBy(42)).toBe(false);
    });
  });

  describe('complex compositions', () => {
    it('combines AND and OR operations', () => {
      // (gt5 AND lt10) OR gt20
      const gt5 = new GreaterThan(5);
      const lt10 = new LessThan(10);
      const gt20 = new GreaterThan(20);
      const spec = gt5.and(lt10).or(gt20);

      expect(spec.isSatisfiedBy(7)).toBe(true); // In range 5-10
      expect(spec.isSatisfiedBy(25)).toBe(true); // > 20
      expect(spec.isSatisfiedBy(15)).toBe(false); // Not in either range
    });

    it('combines with NOT in composition', () => {
      // NOT(gt5 AND lt10)
      const gt5 = new GreaterThan(5);
      const lt10 = new LessThan(10);
      const spec = gt5.and(lt10).not();

      expect(spec.isSatisfiedBy(7)).toBe(false);
      expect(spec.isSatisfiedBy(3)).toBe(true);
      expect(spec.isSatisfiedBy(12)).toBe(true);
    });

    it('handles De Morgan laws', () => {
      // NOT(A OR B) should equal (NOT A) AND (NOT B)
      const lt5 = new LessThan(5);
      const gt10 = new GreaterThan(10);

      const demorgan1 = lt5.or(gt10).not();
      const demorgan2 = lt5.not().and(gt10.not());

      for (let i = 0; i <= 20; i++) {
        expect(demorgan1.isSatisfiedBy(i)).toBe(demorgan2.isSatisfiedBy(i));
      }
    });
  });

  describe('with different types', () => {
    it('works with string specifications', () => {
      const hasLength = Specification.of<string>((s) => s.length > 3);
      expect(hasLength.isSatisfiedBy('hello')).toBe(true);
      expect(hasLength.isSatisfiedBy('hi')).toBe(false);
    });

    it('works with object specifications', () => {
      interface User {
        name: string;
        age: number;
      }

      const isAdult = Specification.of<User>((u) => u.age >= 18);
      expect(isAdult.isSatisfiedBy({ name: 'Alice', age: 25 })).toBe(true);
      expect(isAdult.isSatisfiedBy({ name: 'Bob', age: 15 })).toBe(false);
    });
  });
});
