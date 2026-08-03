import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Validate,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { parseOnboardingAnswers } from '@crave-search/shared';

/**
 * THE ANSWER DOCUMENT IS VALIDATED THROUGH THE DECODER (D40 §6.1) — and
 * validated is not the same as filtered.
 *
 * `@IsObject()` alone accepted literally any object, which is how a
 * hand-respelled key could read `responses.cuisines` off a document nobody
 * had ever checked. But the fix is NOT "reject anything the decoder does not
 * recognise": the stored document is the user's testimony, and unknown keys
 * are preserved verbatim on write (they may come from a newer client, or name
 * a question this server has not learned about yet). Rejecting them would
 * make every question-set rollout a coordinated deploy.
 *
 * So the decoder runs here for exactly one purpose: to prove the document is
 * DECODABLE — a JSON object whose values are strings, string arrays or
 * numbers. What it MEANS is decided at read, once, in the one decoder.
 */
@ValidatorConstraint({ name: 'decodableOnboardingAnswers', async: false })
class DecodableOnboardingAnswers implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value == null) {
      return true;
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    for (const entry of Object.values(value as Record<string, unknown>)) {
      if (entry === undefined || entry === null) {
        continue;
      }
      const isScalar = typeof entry === 'string' || typeof entry === 'number';
      const isStringArray =
        Array.isArray(entry) && entry.every((item) => typeof item === 'string');
      if (!isScalar && !isStringArray) {
        return false;
      }
    }
    // The decoder must be able to read it without throwing — that is its
    // contract. This asserts the contract holds for THIS document; it is not
    // a filter on it.
    parseOnboardingAnswers(null, value);
    return true;
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be an object of strings, string arrays or numbers`;
  }
}

export class UpdateUserOnboardingDto {
  @IsString()
  @IsIn(['completed'])
  status!: 'completed';

  /**
   * What the CLIENT rendered. The server no longer treats this as the truth
   * about which question set the answers belong to — it stamps its own
   * ONBOARDING_QUESTION_SET_VERSION beside it (D40 §1.2).
   */
  @IsInt()
  @Min(1)
  onboardingVersion!: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  selectedCity?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  previewCity?: string | null;

  @IsOptional()
  @IsObject()
  @Validate(DecodableOnboardingAnswers)
  answers?: Record<string, string | string[] | number | undefined>;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  username?: string | null;

  /**
   * Which lane landed this write. Recorded on the append-only history row, so
   * "answered at the end of the flow" and "landed later from the device
   * outbox" (including the anonymous completer who only signed in afterwards)
   * stay distinguishable forever. Absent = 'completion'.
   */
  @IsOptional()
  @IsString()
  @IsIn(['completion', 'replay', 'edit'])
  source?: 'completion' | 'replay' | 'edit';
}
