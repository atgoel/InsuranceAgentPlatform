import { PipeTransform, Injectable } from '@nestjs/common';
import { ZodType, ZodError } from 'zod';
import { ValidationError } from '../errors/domain-errors';

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private schema: ZodType<T>) {}

  async transform(value: unknown): Promise<T> {
    try {
      return await this.schema.parseAsync(value);
    } catch (error) {
      if (error instanceof ZodError) {
        const fieldErrors = error.issues.map((issue) => ({
          path: issue.path.join('.'),
          code: issue.code,
          message: issue.message,
        }));

        throw new ValidationError('validation_failed', 'Request is invalid', fieldErrors);
      }
      throw error;
    }
  }
}
