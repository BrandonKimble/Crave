import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

/**
 * Custom validator to prevent SQL injection patterns
 */
export function IsSafeString(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isSafeString',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (typeof value !== 'string') return false;

          // Check for common SQL injection patterns
          const sqlInjectionPatterns = [
            /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/i,
            /(--|;|\/\*|\*\/)/,
            /(\b(OR|AND)\s+\d+\s*=\s*\d+)/i,
            /('|"|`).*(OR|AND|UNION|SELECT).*/i,
          ];

          return !sqlInjectionPatterns.some((pattern) => pattern.test(value));
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} contains potentially unsafe characters`;
        },
      },
    });
  };
}

/**
 * Custom validator for entity type enums
 */
export function IsEntityType(validationOptions?: ValidationOptions) {
  const validTypes = [
    'restaurant',
    'food',
    'food_attribute',
    'restaurant_attribute',
  ];

  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isEntityType',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          return typeof value === 'string' && validTypes.includes(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be one of: ${validTypes.join(', ')}`;
        },
      },
    });
  };
}

/**
 * Custom validator for connection quality enum
 */
export function IsConnectionQuality(validationOptions?: ValidationOptions) {
  const validQualities = ['high', 'medium', 'low'];

  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isConnectionQuality',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          return typeof value === 'string' && validQualities.includes(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be one of: ${validQualities.join(
            ', ',
          )}`;
        },
      },
    });
  };
}

/**
 * Custom validator for non-empty arrays
 */
export function IsNonEmptyArray(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isNonEmptyArray',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          return Array.isArray(value) && value.length > 0;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a non-empty array`;
        },
      },
    });
  };
}

/**
 * Custom validator for positive numbers
 */
export function IsPositiveNumber(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isPositiveNumber',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          return (
            typeof value === 'number' &&
            value > 0 &&
            !isNaN(value) &&
            isFinite(value)
          );
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a positive number`;
        },
      },
    });
  };
}

/**
 * Custom validator for score ranges (0-100)
 */
export function IsScore(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isScore',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          return (
            typeof value === 'number' &&
            value >= 0 &&
            value <= 100 &&
            !isNaN(value)
          );
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a number between 0 and 100`;
        },
      },
    });
  };
}
