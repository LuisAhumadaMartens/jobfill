export interface Phone {
  country: string;
  national: string;
  e164: string;
}

const DEFAULT_COUNTRY = '1';

const COUNTRY_CODES = [
  '1', '7', '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45',
  '46', '47', '48', '49', '51', '52', '53', '54', '55', '56', '57', '58', '60', '61', '62', '63',
  '64', '65', '66', '81', '82', '84', '86', '90', '91', '92', '93', '94', '95', '98', '211', '212',
  '213', '216', '218', '220', '234', '351', '352', '353', '354', '355', '358', '359', '370', '371',
  '372', '385', '386', '420', '421', '505', '506', '507', '591', '593', '595', '598', '852', '853',
  '855', '856', '880', '886', '960', '961', '962', '963', '964', '965', '966', '968', '971', '972',
  '973', '974', '975', '976', '977', '992', '993', '994', '995', '996', '998'
];

export function parsePhone(value: string, fallbackCountry = DEFAULT_COUNTRY): Phone | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const digits = raw.replace(/[^\d]/g, '');
  if (digits.length < 7 || digits.length > 15) return null;

  if (raw.trimStart().startsWith('+')) {
    for (const code of [...COUNTRY_CODES].sort((a, b) => b.length - a.length)) {
      if (digits.startsWith(code) && digits.length - code.length >= 6) {
        return build(code, digits.slice(code.length));
      }
    }
    return build(digits.slice(0, 1), digits.slice(1));
  }

  if (fallbackCountry === '1') {
    if (digits.length === 11 && digits.startsWith('1')) return build('1', digits.slice(1));
    if (digits.length === 10) return build('1', digits);
  }

  if (digits.length > 10 && digits.startsWith(fallbackCountry)) {
    return build(fallbackCountry, digits.slice(fallbackCountry.length));
  }
  return build(fallbackCountry, digits);
}

function build(country: string, national: string): Phone {
  return { country, national, e164: `+${country}${national}` };
}

export function isSamePhone(a: string, b: string): boolean {
  const left = parsePhone(a);
  const right = parsePhone(b);
  if (!left || !right) return false;
  if (left.e164 === right.e164) return true;
  return left.national === right.national && (!left.country || !right.country);
}

export type PhoneStyle = 'e164' | 'digits' | 'national-parens' | 'national-dashes' | 'national-spaces' | 'international';

export interface PhoneShape {
  style: PhoneStyle;
  withCountry: boolean;
  maxLength?: number | null;
}

export function formatPhone(phone: Phone, shape: PhoneShape): string {
  const { national, country } = phone;
  const grouped = (separator: string): string => {
    if (country === '1' && national.length === 10) {
      return `${national.slice(0, 3)}${separator}${national.slice(3, 6)}${separator}${national.slice(6)}`;
    }
    return national;
  };

  let body: string;
  switch (shape.style) {
    case 'digits':
      body = shape.withCountry ? country + national : national;
      return trim(body, shape.maxLength);
    case 'e164':
      return trim(`+${country}${national}`, shape.maxLength);
    case 'national-parens':
      body = country === '1' && national.length === 10
        ? `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`
        : grouped('-');
      break;
    case 'national-dashes':
      body = grouped('-');
      break;
    case 'national-spaces':
      body = grouped(' ');
      break;
    case 'international':
    default:
      body = grouped('-');
      return trim(shape.withCountry ? `+${country} ${body}` : body, shape.maxLength);
  }

  return trim(shape.withCountry ? `+${country} ${body}` : body, shape.maxLength);
}

function trim(value: string, maxLength?: number | null): string {
  if (!maxLength || maxLength <= 0 || value.length <= maxLength) return value;
  const digitsOnly = value.replace(/[^\d+]/g, '');
  if (digitsOnly.length <= maxLength) return digitsOnly;
  return digitsOnly.replace(/^\+/, '').slice(-maxLength);
}

export interface FieldHints {
  placeholder?: string;
  pattern?: string;
  maxLength?: number | null;
  hasCountryControl?: boolean;
}

function patternWantsDigits(pattern: string): boolean {
  const literals = pattern
    .replace(/\\[dswDSW]/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/[+*?^$|\\]/g, '');
  return !/[()\-. ]/.test(literals);
}

export function shapeFor(hints: FieldHints): PhoneShape {
  const placeholder = String(hints.placeholder ?? '');
  const pattern = String(hints.pattern ?? '');
  const maxLength = hints.maxLength ?? null;
  const withCountry = !hints.hasCountryControl;

  if (pattern) {
    if (patternWantsDigits(pattern)) return { style: 'digits', withCountry: /\+/.test(pattern), maxLength };
    if (/\(/.test(pattern)) return { style: 'national-parens', withCountry: /\+/.test(pattern), maxLength };
    if (/-/.test(pattern.replace(/\[[^\]]*\]/g, ''))) return { style: 'national-dashes', withCountry: /\+/.test(pattern), maxLength };
  }

  if (placeholder) {
    const sample = placeholder.trim();
    if (/^\+\d[\d\s]+$/.test(sample)) return { style: 'international', withCountry: true, maxLength };
    if (/^\+\d/.test(sample) && !/[\s()-]/.test(sample)) return { style: 'e164', withCountry: true, maxLength };
    if (/\(\d|\(x/i.test(sample)) return { style: 'national-parens', withCountry: false, maxLength };
    if (/\d-\d|x-x/i.test(sample)) return { style: 'national-dashes', withCountry: false, maxLength };
    if (/^\d+$/.test(sample.replace(/\s/g, '')) && !/[()-]/.test(sample)) {
      return { style: 'digits', withCountry: false, maxLength };
    }
  }

  if (maxLength && maxLength > 0) {
    if (maxLength <= 10) return { style: 'digits', withCountry: false, maxLength };
    if (maxLength <= 12) return { style: 'national-dashes', withCountry: false, maxLength };
    if (maxLength <= 14) return { style: 'national-parens', withCountry: false, maxLength };
  }

  if (hints.hasCountryControl) return { style: 'national-dashes', withCountry: false, maxLength };
  return { style: 'international', withCountry: true, maxLength };
}

export function renderPhone(value: string, hints: FieldHints, fallbackCountry = DEFAULT_COUNTRY): string {
  const phone = parsePhone(value, fallbackCountry);
  if (!phone) return value;
  return formatPhone(phone, shapeFor(hints));
}
