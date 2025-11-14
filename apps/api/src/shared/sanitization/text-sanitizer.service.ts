import { BadRequestException, Injectable } from '@nestjs/common';

export type SanitizedTextReason =
  | 'empty'
  | 'contains_prohibited_sequence'
  | 'non_printable';

export interface SanitizedTextResult {
  text: string;
  rejected: boolean;
  reason?: SanitizedTextReason;
}

export interface TextSanitizerOptions {
  maxLength?: number;
  allowEmpty?: boolean;
}

const URL_REGEX = /\b(?:https?:\/\/|www\.)\S+/gi;
const CONTROL_CHAR_PATTERN = '\\x00-\\x1F\\x7F-\\x9F';
const CONTROL_CHAR_REGEX = new RegExp(`[${CONTROL_CHAR_PATTERN}]`, 'g');
const PROMPT_INJECTION_REGEX =
  /<<|>>|{{|}}|<\s*script|\bBEGIN\s+PROMPT\b|\bSYSTEM:|```/gi;
const EMOJI_REGEX = /\p{Extended_Pictographic}/gu;

@Injectable()
export class TextSanitizerService {
  sanitize(
    input: string | undefined | null,
    options: TextSanitizerOptions = {},
  ): SanitizedTextResult {
    const maxLength = options.maxLength ?? 140;
    let text = (input ?? '').normalize('NFKC');

    text = text.replace(URL_REGEX, ' ');
    text = text.replace(EMOJI_REGEX, '');
    text = text.replace(CONTROL_CHAR_REGEX, '');
    text = text.replace(/\s+/g, ' ').trim();

    if (!text.length) {
      return { text: '', rejected: !options.allowEmpty, reason: 'empty' };
    }

    if (PROMPT_INJECTION_REGEX.test(text)) {
      return {
        text,
        rejected: true,
        reason: 'contains_prohibited_sequence',
      };
    }

    if (text.length > maxLength) {
      text = text.slice(0, maxLength).trimEnd();
    }

    return { text, rejected: false };
  }

  sanitizeOrThrow(
    input: string | undefined | null,
    options?: TextSanitizerOptions,
  ): string {
    const result = this.sanitize(input, options);
    if (result.rejected) {
      throw new BadRequestException(
        `Text failed sanitization: ${result.reason ?? 'invalid'}`,
      );
    }
    return result.text;
  }
}
