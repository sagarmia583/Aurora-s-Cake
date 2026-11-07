/**
 * Validates and normalizes an 11-digit Bangladeshi mobile number.
 * Accepts formats: 017XXXXXXXX, 017XX-XXXXXX, +88017XXXXXXXX, 88017XXXXXXXX.
 */
export interface PhoneValidationResult {
  isValid: boolean;
  phone: string;
  digits: string;
  error?: string;
}

/**
 * Keep an editable mobile number to at most 11 Bangladeshi digits.
 * Accept pasted/typed +8801… numbers, converting the prefix to 01.
 * The final 01[3-9] format is validated separately on submit.
 */
export function limitBangladeshiPhoneInput(input: string): string {
  const digits = String(input ?? '')
    .replace(/[০-৯]/g, digit => String(digit.charCodeAt(0) - 0x09e6))
    .replace(/\D/g, '');
  const local = digits.startsWith('8801') ? digits.slice(2) : digits;
  return local.slice(0, 11);
}

export function validateBangladeshiPhone(input: string | undefined | null): PhoneValidationResult {
  if (!input || !input.trim()) {
    return { isValid: false, phone: '', digits: '', error: 'মোবাইল নম্বর লিখুন' };
  }
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('8801') && digits.length === 13) {
    digits = digits.slice(2);
  }

  if (digits.length !== 11) {
    return {
      isValid: false,
      phone: digits,
      digits,
      error: `মোবাইল নম্বরটি অবশ্যই ১১ ডিজিটের হতে হবে (বর্তমানে ${digits.length} ডিজিট)`,
    };
  }

  if (!digits.startsWith('01')) {
    return {
      isValid: false,
      phone: digits,
      digits,
      error: 'মোবাইল নম্বরটি অবশ্যই ০১ দিয়ে শুরু হতে হবে (যেমন: 017XXXXXXXX)',
    };
  }

  if (!/^01[3-9]\d{8}$/.test(digits)) {
    return {
      isValid: false,
      phone: digits,
      digits,
      error: 'সঠিক বাংলাদেশি মোবাইল নম্বর দিন (যেমন: 017XXXXXXXX)',
    };
  }

  return { isValid: true, phone: digits, digits };
}
