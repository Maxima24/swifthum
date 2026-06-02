import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { serializeBigints } from './money';

/**
 * Converts bigint values in response payloads to numbers. Prisma returns BIGINT
 * columns as bigint; the frontend expects them as numbers.
 */
@Injectable()
export class BigintSerializeInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => serializeBigints(data)));
  }
}
