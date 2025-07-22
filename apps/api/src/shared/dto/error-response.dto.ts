import { ApiProperty } from '@nestjs/swagger';

/**
 * Standard error response format for all API errors
 */
export class ErrorResponseDto {
  @ApiProperty({
    description: 'HTTP status code',
    example: 400,
  })
  statusCode: number;

  @ApiProperty({
    description: 'Timestamp when the error occurred',
    example: '2025-07-22T00:25:00.000Z',
  })
  timestamp: string;

  @ApiProperty({
    description: 'Request path that caused the error',
    example: '/api/entities',
  })
  path: string;

  @ApiProperty({
    description: 'HTTP method used',
    example: 'POST',
  })
  method: string;

  @ApiProperty({
    description: 'Application-specific error code',
    example: 'VALIDATION_ERROR',
  })
  errorCode: string;

  @ApiProperty({
    description: 'Human-readable error message',
    example: 'Validation failed: name is required',
  })
  message: string;

  @ApiProperty({
    description: 'Correlation ID for request tracing',
    example: 'req_1642857600000_abc123',
  })
  correlationId: string;

  @ApiProperty({
    description: 'Additional error details (development only)',
    required: false,
    example: { validationErrors: ['name is required', 'email must be valid'] },
  })
  details?: any;
}
