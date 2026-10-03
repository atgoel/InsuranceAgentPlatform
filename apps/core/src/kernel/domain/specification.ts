export abstract class Specification<T> {
  abstract isSatisfiedBy(candidate: T): boolean;

  and(other: Specification<T>): Specification<T> {
    return new AndSpecification(this, other);
  }

  or(other: Specification<T>): Specification<T> {
    return new OrSpecification(this, other);
  }

  not(): Specification<T> {
    return new NotSpecification(this);
  }

  static of<T>(predicate: (candidate: T) => boolean, name?: string): Specification<T> {
    return new PredicateSpecification(predicate, name);
  }
}

class AndSpecification<T> extends Specification<T> {
  constructor(private left: Specification<T>, private right: Specification<T>) {
    super();
  }

  isSatisfiedBy(candidate: T): boolean {
    return this.left.isSatisfiedBy(candidate) && this.right.isSatisfiedBy(candidate);
  }
}

class OrSpecification<T> extends Specification<T> {
  constructor(private left: Specification<T>, private right: Specification<T>) {
    super();
  }

  isSatisfiedBy(candidate: T): boolean {
    return this.left.isSatisfiedBy(candidate) || this.right.isSatisfiedBy(candidate);
  }
}

class NotSpecification<T> extends Specification<T> {
  constructor(private wrapped: Specification<T>) {
    super();
  }

  isSatisfiedBy(candidate: T): boolean {
    return !this.wrapped.isSatisfiedBy(candidate);
  }
}

class PredicateSpecification<T> extends Specification<T> {
  constructor(private predicate: (candidate: T) => boolean, readonly name?: string) {
    super();
  }

  isSatisfiedBy(candidate: T): boolean {
    return this.predicate(candidate);
  }
}
