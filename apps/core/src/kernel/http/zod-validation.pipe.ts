import { Injectable, PipeTransform } from '@nestjs/common';
import { ZodType } from 'zod';
import { ValidationError } from '../errors/domain-errors';

/** Parses request input with a zod schema; failures become 400 Problem Details with field errors. */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    const errors = result.error.issues.map((issue) => ({ path: issue.path.join('.'), code: issue.code, message: issue.message }));
    throw new ValidationError('validation_failed', 'Request is invalid', errors);
  }
}
