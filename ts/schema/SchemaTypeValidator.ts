/*******************************************************************************
 * Copyright (c) 2023-2026 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

import { XMLUtils } from '../XMLUtils.js';

export interface SchemaFacets {
    enumeration?: string[];
    patterns?: string[][];
    minExclusive?: string;
    maxExclusive?: string;
    minInclusive?: string;
    maxInclusive?: string;
    length?: number;
    minLength?: number;
    maxLength?: number;
    totalDigits?: number;
    fractionDigits?: number;
    whiteSpace?: string;
    isList?: boolean;
}

export class SchemaTypeValidator {

    static validateFacets(value: string, facets: SchemaFacets, typeName?: string): boolean {
        if (facets.whiteSpace === 'replace') {
            value = value.replace(/[\t\n\r]/g, ' ');
        } else if (facets.whiteSpace === 'collapse') {
            value = value.replace(/[\t\n\r ]+/g, ' ').trim();
        }
        if (facets.enumeration && facets.enumeration.length > 0) {
            if (facets.enumeration.indexOf(value) === -1) {
                return false;
            }
        }
        if (facets.patterns && facets.patterns.length > 0) {
            for (let g: number = 0; g < facets.patterns.length; g++) {
                const group: string[] = facets.patterns[g];
                let groupMatched: boolean = false;
                for (let i: number = 0; i < group.length; i++) {
                    if (new RegExp('^(?:' + SchemaTypeValidator.translateXsdPattern(group[i]) + ')$', 'u').test(value)) {
                        groupMatched = true;
                        break;
                    }
                }
                if (!groupMatched) {
                    return false;
                }
            }
        }
        if (facets.minExclusive !== undefined || facets.maxExclusive !== undefined ||
            facets.minInclusive !== undefined || facets.maxInclusive !== undefined) {
            const localTypeForRange: string = typeName !== undefined
                ? (typeName.indexOf(':') !== -1 ? typeName.substring(typeName.indexOf(':') + 1) : typeName)
                : '';
            if (localTypeForRange === 'duration') {
                if (facets.minExclusive !== undefined &&
                    SchemaTypeValidator.compareDurations(value, facets.minExclusive) !== null &&
                    SchemaTypeValidator.compareDurations(value, facets.minExclusive)! <= 0) {
                    return false;
                }
                if (facets.maxExclusive !== undefined &&
                    SchemaTypeValidator.compareDurations(value, facets.maxExclusive) !== null &&
                    SchemaTypeValidator.compareDurations(value, facets.maxExclusive)! >= 0) {
                    return false;
                }
                if (facets.minInclusive !== undefined &&
                    SchemaTypeValidator.compareDurations(value, facets.minInclusive) !== null &&
                    SchemaTypeValidator.compareDurations(value, facets.minInclusive)! < 0) {
                    return false;
                }
                if (facets.maxInclusive !== undefined &&
                    SchemaTypeValidator.compareDurations(value, facets.maxInclusive) !== null &&
                    SchemaTypeValidator.compareDurations(value, facets.maxInclusive)! > 0) {
                    return false;
                }
            } else {
                const compare: (a: string, b: string) => number = SchemaTypeValidator.getCompareFunction(typeName);
                if (facets.minExclusive !== undefined && compare(value, facets.minExclusive) <= 0) {
                    return false;
                }
                if (facets.maxExclusive !== undefined && compare(value, facets.maxExclusive) >= 0) {
                    return false;
                }
                if (facets.minInclusive !== undefined && compare(value, facets.minInclusive) < 0) {
                    return false;
                }
                if (facets.maxInclusive !== undefined && compare(value, facets.maxInclusive) > 0) {
                    return false;
                }
            }
        }
        const localTypeName: string = typeName !== undefined
            ? (typeName.indexOf(':') !== -1 ? typeName.substring(typeName.indexOf(':') + 1) : typeName)
            : '';
        const noLengthFacets: boolean = localTypeName === 'QName' || localTypeName === 'NOTATION';
        if (!noLengthFacets) {
            let effectiveLength: number;
            if (facets.isList) {
                const trimmed: string = value.trim();
                effectiveLength = trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
            } else if (localTypeName === 'base64Binary') {
                const clean: string = value.replace(/\s/g, '');
                const padding: number = (clean.match(/=+$/) || [''])[0].length;
                effectiveLength = Math.floor(clean.length * 3 / 4) - padding;
            } else if (localTypeName === 'hexBinary') {
                effectiveLength = Math.floor(value.length / 2);
            } else {
                effectiveLength = Array.from(value).length;
            }
            if (facets.length !== undefined && effectiveLength !== facets.length) {
                return false;
            }
            if (facets.minLength !== undefined && effectiveLength < facets.minLength) {
                return false;
            }
            if (facets.maxLength !== undefined && effectiveLength > facets.maxLength) {
                return false;
            }
        }
        if (facets.totalDigits !== undefined || facets.fractionDigits !== undefined) {
            const s: string = value.startsWith('+') || value.startsWith('-') ? value.substring(1) : value;
            const dotIdx: number = s.indexOf('.');
            const rawInt: string = dotIdx === -1 ? s : s.substring(0, dotIdx);
            const rawFrac: string = dotIdx === -1 ? '' : s.substring(dotIdx + 1);
            const canonInt: string = rawInt.replace(/^0+/, '') || '0';
            const canonFrac: string = rawFrac.replace(/0+$/, '');
            const total: number = canonInt.length + canonFrac.length;
            if (facets.totalDigits !== undefined && total > facets.totalDigits) {
                return false;
            }
            if (facets.fractionDigits !== undefined && canonFrac.length > facets.fractionDigits) {
                return false;
            }
        }
        return true;
    }

    static validate(value: string, typeName: string, instanceNs?: Map<string, string>): boolean {
        const colonIndex: number = typeName.indexOf(':');
        const localType: string = colonIndex !== -1 ? typeName.substring(colonIndex + 1) : typeName;

        switch (localType) {
            case 'string':
                return true;
            case 'error':
                return false;
            case 'anyURI':
                return SchemaTypeValidator.isAnyURI(value);
            case 'anySimpleType':
            case 'anyAtomicType':
                return true;

            case 'normalizedString':
                return !/[\t\n\r]/.test(value);

            case 'token':
                return value === value.replace(/[\t\n\r ]+/g, ' ').trim();

            case 'hexBinary': {
                const cleanHex: string = value.replace(/\s/g, '');
                return cleanHex.length % 2 === 0 && /^[0-9A-Fa-f]*$/.test(cleanHex);
            }
            case 'base64Binary': {
                const cleanB64: string = value.replace(/\s/g, '');
                if (cleanB64.length % 4 !== 0) { return false; }
                if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleanB64)) { return false; }
                const eqIdx: number = cleanB64.indexOf('=');
                return eqIdx === -1 || eqIdx >= cleanB64.length - 2;
            }

            case 'boolean':
                return SchemaTypeValidator.isBoolean(value);

            // Decimal/float
            case 'decimal':
                return SchemaTypeValidator.isDecimal(value);
            case 'float':
            case 'double':
                return SchemaTypeValidator.isFloat(value);

            // Integer family
            case 'integer':
            case 'long':
            case 'int':
            case 'short':
            case 'byte':
            case 'unsignedLong':
            case 'unsignedInt':
            case 'unsignedShort':
            case 'unsignedByte':
            case 'nonNegativeInteger':
            case 'positiveInteger':
            case 'nonPositiveInteger':
            case 'negativeInteger':
                return SchemaTypeValidator.isInteger(value, localType);

            // Date/time primitives
            case 'dateTime':
                return SchemaTypeValidator.isDateTime(value);
            case 'dateTimeStamp':
                return SchemaTypeValidator.isDateTimeStamp(value);
            case 'date':
                return SchemaTypeValidator.isDate(value);
            case 'time':
                return SchemaTypeValidator.isTime(value);
            case 'duration':
                return SchemaTypeValidator.isDuration(value);
            case 'dayTimeDuration':
                return SchemaTypeValidator.isDayTimeDuration(value);
            case 'yearMonthDuration':
                return SchemaTypeValidator.isYearMonthDuration(value);
            case 'gYear':
                return SchemaTypeValidator.isGYear(value);
            case 'gYearMonth':
                return SchemaTypeValidator.isGYearMonth(value);
            case 'gMonth':
                return SchemaTypeValidator.isGMonth(value);
            case 'gMonthDay':
                return SchemaTypeValidator.isGMonthDay(value);
            case 'gDay':
                return SchemaTypeValidator.isGDay(value);

            // Name / token types
            case 'Name':
                return XMLUtils.isValidXMLName(value);
            case 'NCName':
            case 'ID':
            case 'IDREF':
            case 'ENTITY':
                return XMLUtils.isValidNCName(value);
            case 'IDREFS':
            case 'ENTITIES':
                return SchemaTypeValidator.isWhitespaceList(value, XMLUtils.isValidNCName);
            case 'NMTOKEN':
                return XMLUtils.isValidNMTOKEN(value);
            case 'NMTOKENS':
                return SchemaTypeValidator.isWhitespaceList(value, XMLUtils.isValidNMTOKEN);
            case 'language':
                return SchemaTypeValidator.isLanguage(value);
            case 'QName':
            case 'NOTATION':
                return SchemaTypeValidator.isQName(value, instanceNs);

            default:
                return true;
        }
    }

    private static readonly XSD_I: string = '[A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD:]';
    private static readonly XSD_I_NO_COLON: string = '[A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]';
    private static readonly XSD_C: string = '[A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD:\\.\\-0-9\u00B7\u0300-\u036F\u203F-\u2040]';
    private static readonly XSD_C_NO_COLON: string = '[A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\\.\\-0-9\u00B7\u0300-\u036F\u203F-\u2040]';
    private static readonly XSD_NOT_I: string = '[^A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD:]';
    private static readonly XSD_NOT_C: string = '[^A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD:\\.\\-0-9\u00B7\u0300-\u036F\u203F-\u2040]';

    private static translateXsdPattern(pattern: string): string {
        return pattern
            .replace(/\[\\i-\[:\]\]/g, SchemaTypeValidator.XSD_I_NO_COLON)
            .replace(/\[\\c-\[:\]\]/g, SchemaTypeValidator.XSD_C_NO_COLON)
            .replace(/\\i/g, SchemaTypeValidator.XSD_I)
            .replace(/\\I/g, SchemaTypeValidator.XSD_NOT_I)
            .replace(/\\c/g, SchemaTypeValidator.XSD_C)
            .replace(/\\C/g, SchemaTypeValidator.XSD_NOT_C)
            .replace(/\\p\{Is([^}]+)\}/g, (_m, name) => '\\p{Script=' + name + '}')
            .replace(/\\P\{Is([^}]+)\}/g, (_m, name) => '\\P{Script=' + name + '}')
            .replace(/\\p\{([^}]+)\}/g, (_m, name) => SchemaTypeValidator.xsdUnicodeCategory(name, false))
            .replace(/\\P\{([^}]+)\}/g, (_m, name) => SchemaTypeValidator.xsdUnicodeCategory(name, true))
            // Convert \X where X is not a valid JS Unicode-mode escape character to \xNN.
            // Valid JS Unicode escapes after \: d D w W s S n r t f v b B u x p P 0-9
            // and the syntax characters: ^ $ . | ? * + ( ) [ ] { } / \
            .replace(/\\([^\\dDwWsSnrtfvbBuxpP0-9\^$.|?*+()[\]{}/])/g, (_m, ch) => {
                return '\\x' + ch.charCodeAt(0).toString(16).padStart(2, '0');
            });
    }

    private static xsdUnicodeCategory(name: string, negate: boolean): string {
        const prefix: string = negate ? '\\P' : '\\p';
        switch (name) {
            case 'L': return prefix + '{L}';
            case 'Lu': return prefix + '{Lu}';
            case 'Ll': return prefix + '{Ll}';
            case 'Lt': return prefix + '{Lt}';
            case 'Lm': return prefix + '{Lm}';
            case 'Lo': return prefix + '{Lo}';
            case 'M': return prefix + '{M}';
            case 'Mn': return prefix + '{Mn}';
            case 'Mc': return prefix + '{Mc}';
            case 'Me': return prefix + '{Me}';
            case 'N': return prefix + '{N}';
            case 'Nd': return prefix + '{Nd}';
            case 'Nl': return prefix + '{Nl}';
            case 'No': return prefix + '{No}';
            case 'P': return prefix + '{P}';
            case 'Pc': return prefix + '{Pc}';
            case 'Pd': return prefix + '{Pd}';
            case 'Ps': return prefix + '{Ps}';
            case 'Pe': return prefix + '{Pe}';
            case 'Pi': return prefix + '{Pi}';
            case 'Pf': return prefix + '{Pf}';
            case 'Po': return prefix + '{Po}';
            case 'Z': return prefix + '{Z}';
            case 'Zs': return prefix + '{Zs}';
            case 'Zl': return prefix + '{Zl}';
            case 'Zp': return prefix + '{Zp}';
            case 'S': return prefix + '{S}';
            case 'Sm': return prefix + '{Sm}';
            case 'Sc': return prefix + '{Sc}';
            case 'Sk': return prefix + '{Sk}';
            case 'So': return prefix + '{So}';
            case 'C': return prefix + '{C}';
            case 'Cc': return prefix + '{Cc}';
            case 'Cf': return prefix + '{Cf}';
            case 'Co': return prefix + '{Co}';
            case 'Cn': return prefix + '{Cn}';
            default: return prefix + '{' + name + '}';
        }
    }

    private static isAnyURI(value: string): boolean {
        // XSD anyURI lexical space: any string that is a valid IRI reference per RFC 3987.
        // Reject control characters (U+0000-U+001F, U+007F) which are never allowed in an IRI.
        // Reject unbalanced brackets and fragment-invalid sequences.
        if (/[\x00-\x1F\x7F]/.test(value)) {
            return false;
        }
        // Check balanced square brackets (used only in IPv6 host).
        const opens: number = (value.match(/\[/g) || []).length;
        const closes: number = (value.match(/\]/g) || []).length;
        if (opens !== closes) {
            return false;
        }
        // Percent-encoded octets must be well-formed: %XX where X is hex.
        const pct: RegExp = /%(?![0-9A-Fa-f]{2})/;
        if (pct.test(value)) {
            return false;
        }
        return true;
    }

    private static isBoolean(value: string): boolean {
        return value === 'true' || value === 'false' || value === '1' || value === '0';
    }

    private static isDecimal(value: string): boolean {
        return /^[+-]?([0-9]+\.?[0-9]*|[0-9]*\.[0-9]+)$/.test(value);
    }

    private static isFloat(value: string): boolean {
        if (value === 'INF' || value === '+INF' || value === '-INF' || value === 'NaN') {
            return true;
        }
        return /^[+-]?([0-9]+\.?[0-9]*|[0-9]*\.[0-9]+)([eE][+-]?[0-9]+)?$/.test(value);
    }

    private static isInteger(value: string, typeName: string): boolean {
        if (!/^[+-]?[0-9]+$/.test(value)) {
            return false;
        }
        switch (typeName) {
            case 'nonNegativeInteger':
                return !value.startsWith('-');
            case 'unsignedLong': {
                if (value.startsWith('-')) { return false; }
                const n: bigint = BigInt(value.replace(/^\+/, ''));
                return n <= BigInt('18446744073709551615');
            }
            case 'long': {
                const n: bigint = BigInt(value.replace(/^\+/, ''));
                return n >= BigInt('-9223372036854775808') && n <= BigInt('9223372036854775807');
            }
            case 'positiveInteger':
                return !value.startsWith('-') && value.replace(/^\+/, '') !== '0';
            case 'nonPositiveInteger': {
                if (value.startsWith('-')) { return true; }
                const stripped: string = value.replace(/^\+/, '');
                return stripped === '0';
            }
            case 'negativeInteger':
                return value.startsWith('-');
            case 'byte': {
                const n: number = parseInt(value, 10);
                return n >= -128 && n <= 127;
            }
            case 'short': {
                const n: number = parseInt(value, 10);
                return n >= -32768 && n <= 32767;
            }
            case 'int': {
                const n: number = parseInt(value, 10);
                return n >= -2147483648 && n <= 2147483647;
            }
            case 'unsignedByte': {
                const n: number = parseInt(value, 10);
                return n >= 0 && n <= 255;
            }
            case 'unsignedShort': {
                const n: number = parseInt(value, 10);
                return n >= 0 && n <= 65535;
            }
            case 'unsignedInt': {
                const n: number = parseInt(value, 10);
                return n >= 0 && n <= 4294967295;
            }
            default:
                return true;
        }
    }

    private static isValidTimezone(tz: string | undefined): boolean {
        if (tz === undefined || tz === 'Z') { return true; }
        const tzM: RegExpMatchArray | null = tz.match(/^([+-])([0-9]{2}):([0-9]{2})$/);
        if (!tzM) { return false; }
        const offsetMinutes: number = parseInt(tzM[2], 10) * 60 + parseInt(tzM[3], 10);
        return offsetMinutes <= 840;
    }

    private static isLeapYear(year: number): boolean {
        return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    }

    private static daysInMonth(year: number, month: number): number {
        const days: number[] = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        if (month === 2 && SchemaTypeValidator.isLeapYear(year)) {
            return 29;
        }
        return days[month];
    }

    private static isDateTimeStamp(value: string): boolean {
        const m: RegExpMatchArray | null = value.match(
            /^(-?)([0-9]{4,})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$/
        );
        if (!m) { return false; }
        if (parseInt(m[2], 10) === 0) { return false; }
        const year: number = parseInt(m[2], 10) * (m[1] === '-' ? -1 : 1);
        const month: number = parseInt(m[3], 10);
        const day: number = parseInt(m[4], 10);
        const hour: number = parseInt(m[5], 10);
        const minute: number = parseInt(m[6], 10);
        const second: number = parseFloat(m[7]);
        if (month < 1 || month > 12) { return false; }
        if (day < 1 || day > SchemaTypeValidator.daysInMonth(year, month)) { return false; }
        if (hour === 24) {
            if (minute !== 0 || second !== 0) { return false; }
        } else if (hour > 23) {
            return false;
        }
        if (minute > 59 || second >= 60) { return false; }
        return SchemaTypeValidator.isValidTimezone(m[9]);
    }

    private static isDayTimeDuration(value: string): boolean {
        if (value === 'P' || value === '-P') { return false; }
        const m: RegExpMatchArray | null = value.match(
            /^-?P([0-9]+D)?(T([0-9]+H)?([0-9]+M)?([0-9]+(\.?[0-9]+)?S)?)?$/
        );
        if (!m) { return false; }
        if (m[2] !== undefined && !m[3] && !m[4] && !m[5]) { return false; }
        if (!m[1] && !m[2]) { return false; }
        return true;
    }

    private static isYearMonthDuration(value: string): boolean {
        if (value === 'P' || value === '-P') { return false; }
        const m: RegExpMatchArray | null = value.match(/^-?P([0-9]+Y)?([0-9]+M)?$/);
        if (!m) { return false; }
        if (!m[1] && !m[2]) { return false; }
        return true;
    }

    private static isDateTime(value: string): boolean {
        const m: RegExpMatchArray | null = value.match(
            /^(-?)([0-9]{4,})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})?$/
        );
        if (!m) { return false; }
        if (parseInt(m[2], 10) === 0) { return false; }
        const year: number = parseInt(m[2], 10) * (m[1] === '-' ? -1 : 1);
        const month: number = parseInt(m[3], 10);
        const day: number = parseInt(m[4], 10);
        const hour: number = parseInt(m[5], 10);
        const minute: number = parseInt(m[6], 10);
        const second: number = parseFloat(m[7]);
        if (month < 1 || month > 12) { return false; }
        if (day < 1 || day > SchemaTypeValidator.daysInMonth(year, month)) { return false; }
        if (hour === 24) {
            if (minute !== 0 || second !== 0) { return false; }
        } else if (hour > 23) {
            return false;
        }
        if (minute > 59 || second >= 60) { return false; }
        if (!SchemaTypeValidator.isValidTimezone(m[9])) { return false; }
        return true;
    }

    private static isDate(value: string): boolean {
        const m: RegExpMatchArray | null = value.match(
            /^(-?)([0-9]{4,})-([0-9]{2})-([0-9]{2})(Z|[+-][0-9]{2}:[0-9]{2})?$/
        );
        if (!m) { return false; }
        if (parseInt(m[2], 10) === 0) { return false; }
        const year: number = parseInt(m[2], 10) * (m[1] === '-' ? -1 : 1);
        const month: number = parseInt(m[3], 10);
        const day: number = parseInt(m[4], 10);
        if (month < 1 || month > 12) { return false; }
        if (day < 1 || day > SchemaTypeValidator.daysInMonth(year, month)) { return false; }
        if (!SchemaTypeValidator.isValidTimezone(m[5])) { return false; }
        return true;
    }

    private static isTime(value: string): boolean {
        const m: RegExpMatchArray | null = value.match(
            /^([0-9]{2}):([0-9]{2}):([0-9]{2})(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})?$/
        );
        if (!m) { return false; }
        const hour: number = parseInt(m[1], 10);
        const minute: number = parseInt(m[2], 10);
        const second: number = parseFloat(m[3]);
        if (hour === 24) {
            if (minute !== 0 || second !== 0) { return false; }
        } else if (hour > 23) {
            return false;
        }
        if (minute > 59 || second >= 60) { return false; }
        if (!SchemaTypeValidator.isValidTimezone(m[5])) { return false; }
        return true;
    }

    private static isDuration(value: string): boolean {
        if (value === 'P' || value === '-P') {
            return false;
        }
        const m: RegExpMatchArray | null = value.match(
            /^-?P([0-9]+Y)?([0-9]+M)?([0-9]+D)?(T([0-9]+H)?([0-9]+M)?([0-9]+(\.?[0-9]+)?S)?)?$/
        );
        if (!m) { return false; }
        if (m[4] !== undefined && !m[5] && !m[6] && !m[7]) { return false; }
        return true;
    }

    private static isGYear(value: string): boolean {
        const m: RegExpMatchArray | null = value.match(/^(-?)([0-9]{4,})(Z|[+-][0-9]{2}:[0-9]{2})?$/);
        if (!m) { return false; }
        if (parseInt(m[2], 10) === 0) { return false; }
        return SchemaTypeValidator.isValidTimezone(m[3]);
    }

    private static isGYearMonth(value: string): boolean {
        const m: RegExpMatchArray | null = value.match(/^(-?)([0-9]{4,})-([0-9]{2})(Z|[+-][0-9]{2}:[0-9]{2})?$/);
        if (!m) { return false; }
        if (parseInt(m[2], 10) === 0) { return false; }
        const month: number = parseInt(m[3], 10);
        if (month < 1 || month > 12) { return false; }
        return SchemaTypeValidator.isValidTimezone(m[4]);
    }

    private static isGMonth(value: string): boolean {
        const m: RegExpMatchArray | null = value.match(/^--([0-9]{2})(Z|[+-][0-9]{2}:[0-9]{2})?$/);
        if (!m) { return false; }
        const month: number = parseInt(m[1], 10);
        if (month < 1 || month > 12) { return false; }
        return SchemaTypeValidator.isValidTimezone(m[2]);
    }

    private static isGMonthDay(value: string): boolean {
        const m: RegExpMatchArray | null = value.match(/^--([0-9]{2})-([0-9]{2})(Z|[+-][0-9]{2}:[0-9]{2})?$/);
        if (!m) { return false; }
        const month: number = parseInt(m[1], 10);
        const day: number = parseInt(m[2], 10);
        if (month < 1 || month > 12) { return false; }
        if (day < 1 || day > SchemaTypeValidator.daysInMonth(2000, month)) { return false; }
        return SchemaTypeValidator.isValidTimezone(m[3]);
    }

    private static isGDay(value: string): boolean {
        const m: RegExpMatchArray | null = value.match(/^---([0-9]{2})(Z|[+-][0-9]{2}:[0-9]{2})?$/);
        if (!m) { return false; }
        const day: number = parseInt(m[1], 10);
        if (day < 1 || day > 31) { return false; }
        return SchemaTypeValidator.isValidTimezone(m[2]);
    }

    private static isLanguage(value: string): boolean {
        return /^[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*$/.test(value);
    }

    private static isQName(value: string, instanceNs?: Map<string, string>): boolean {
        const parts: string[] = value.split(':');
        if (parts.length === 1) {
            return XMLUtils.isValidNCName(parts[0]);
        }
        if (parts.length === 2) {
            if (!XMLUtils.isValidNCName(parts[0]) || !XMLUtils.isValidNCName(parts[1])) {
                return false;
            }
            if (instanceNs !== undefined && !instanceNs.has(parts[0])) {
                return false;
            }
            return true;
        }
        return false;
    }

    private static isWhitespaceList(value: string, checker: (token: string) => boolean): boolean {
        const trimmed: string = value.trim();
        if (trimmed.length === 0) {
            return false;
        }
        const tokens: string[] = trimmed.split(/\s+/);
        for (const token of tokens) {
            if (!checker(token)) {
                return false;
            }
        }
        return true;
    }

    static getCompareFunction(typeName?: string): (a: string, b: string) => number {
        const colonIndex: number = typeName ? typeName.indexOf(':') : -1;
        const local: string = typeName ? (colonIndex !== -1 ? typeName.substring(colonIndex + 1) : typeName) : '';
        switch (local) {
            case 'dateTime': return SchemaTypeValidator.compareDateTimes;
            case 'date': return SchemaTypeValidator.compareDates;
            case 'time': return SchemaTypeValidator.compareTimes;
            case 'gYear': return SchemaTypeValidator.compareGYears;
            case 'gYearMonth': return SchemaTypeValidator.compareGYearMonths;
            case 'gMonthDay': return SchemaTypeValidator.compareGMonthDays;
            case 'gMonth': return SchemaTypeValidator.compareGMonths;
            case 'gDay': return SchemaTypeValidator.compareGDays;
            default: return SchemaTypeValidator.compareNumericOrLexicographic;
        }
    }

    private static dateTimeToMs(s: string): number {
        const negative: boolean = s.startsWith('-');
        const abs: string = negative ? s.substring(1) : s;

        const tIndex: number = abs.indexOf('T');
        if (tIndex === -1) {
            return NaN;
        }
        const datePart: string = abs.substring(0, tIndex);
        let rest: string = abs.substring(tIndex + 1);

        let tzOffsetMs: number = 0;
        if (rest.endsWith('Z')) {
            rest = rest.substring(0, rest.length - 1);
        } else {
            const tzMatch: RegExpMatchArray | null = rest.match(/([+-])([0-9]{2}):([0-9]{2})$/);
            if (tzMatch) {
                rest = rest.substring(0, rest.length - tzMatch[0].length);
                const sign: number = tzMatch[1] === '+' ? 1 : -1;
                tzOffsetMs = sign * (parseInt(tzMatch[2], 10) * 60 + parseInt(tzMatch[3], 10)) * 60000;
            }
        }

        const dateParts: string[] = datePart.split('-');
        const year: number = parseInt(dateParts[0], 10) * (negative ? -1 : 1);
        const month: number = parseInt(dateParts[1], 10) - 1;
        const day: number = parseInt(dateParts[2], 10);

        const c1: number = rest.indexOf(':');
        const c2: number = rest.indexOf(':', c1 + 1);
        const hours: number = parseInt(rest.substring(0, c1), 10);
        const minutes: number = parseInt(rest.substring(c1 + 1, c2), 10);
        const secFloat: number = parseFloat(rest.substring(c2 + 1));
        const secInt: number = Math.floor(secFloat);
        const ms: number = Math.round((secFloat - secInt) * 1000);

        const d: Date = new Date(Date.UTC(year, month, day, hours, minutes, secInt, ms));
        if (isNaN(d.getTime())) {
            return NaN;
        }
        // Subtract tzOffsetMs: a value of +05:00 means local = UTC+5, so UTC = local - 5 h.
        return d.getTime() - tzOffsetMs;
    }

    private static dateToMs(s: string): number {
        const negative: boolean = s.startsWith('-');
        let abs: string = negative ? s.substring(1) : s;

        let tzOffsetMs: number = 0;
        if (abs.endsWith('Z')) {
            abs = abs.substring(0, abs.length - 1);
        } else {
            const tzMatch: RegExpMatchArray | null = abs.match(/([+-])([0-9]{2}):([0-9]{2})$/);
            if (tzMatch) {
                abs = abs.substring(0, abs.length - tzMatch[0].length);
                const sign: number = tzMatch[1] === '+' ? 1 : -1;
                tzOffsetMs = sign * (parseInt(tzMatch[2], 10) * 60 + parseInt(tzMatch[3], 10)) * 60000;
            }
        }

        const parts: string[] = abs.split('-');
        const year: number = parseInt(parts[0], 10) * (negative ? -1 : 1);
        const month: number = parseInt(parts[1], 10) - 1;
        const day: number = parseInt(parts[2], 10);

        const d: Date = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
        if (isNaN(d.getTime())) {
            return NaN;
        }
        return d.getTime() - tzOffsetMs;
    }

    private static timeToMs(s: string): number {
        let rest: string = s;
        let tzOffsetMs: number = 0;

        if (rest.endsWith('Z')) {
            rest = rest.substring(0, rest.length - 1);
        } else {
            const tzMatch: RegExpMatchArray | null = rest.match(/([+-])([0-9]{2}):([0-9]{2})$/);
            if (tzMatch) {
                rest = rest.substring(0, rest.length - tzMatch[0].length);
                const sign: number = tzMatch[1] === '+' ? 1 : -1;
                tzOffsetMs = sign * (parseInt(tzMatch[2], 10) * 60 + parseInt(tzMatch[3], 10)) * 60000;
            }
        }

        const c1: number = rest.indexOf(':');
        const c2: number = rest.indexOf(':', c1 + 1);
        const hours: number = parseInt(rest.substring(0, c1), 10);
        const minutes: number = parseInt(rest.substring(c1 + 1, c2), 10);
        const secFloat: number = parseFloat(rest.substring(c2 + 1));
        const secInt: number = Math.floor(secFloat);
        const ms: number = Math.round((secFloat - secInt) * 1000);

        return (hours * 3600 + minutes * 60 + secInt) * 1000 + ms - tzOffsetMs;
    }

    private static compareDateTimes(a: string, b: string): number {
        const msA: number = SchemaTypeValidator.dateTimeToMs(a);
        const msB: number = SchemaTypeValidator.dateTimeToMs(b);
        if (isNaN(msA) || isNaN(msB)) {
            return a < b ? -1 : a > b ? 1 : 0;
        }
        return msA < msB ? -1 : msA > msB ? 1 : 0;
    }

    private static compareDates(a: string, b: string): number {
        const msA: number = SchemaTypeValidator.dateToMs(a);
        const msB: number = SchemaTypeValidator.dateToMs(b);
        if (isNaN(msA) || isNaN(msB)) {
            return a < b ? -1 : a > b ? 1 : 0;
        }
        return msA < msB ? -1 : msA > msB ? 1 : 0;
    }

    private static compareTimes(a: string, b: string): number {
        const msA: number = SchemaTypeValidator.timeToMs(a);
        const msB: number = SchemaTypeValidator.timeToMs(b);
        if (isNaN(msA) || isNaN(msB)) {
            return a < b ? -1 : a > b ? 1 : 0;
        }
        return msA < msB ? -1 : msA > msB ? 1 : 0;
    }

    private static compareGYears(a: string, b: string): number {
        const parseYear = (s: string): number => {
            const m: RegExpMatchArray | null = s.match(/^(-?)([0-9]{4,})/);
            if (!m) { return NaN; }
            return parseInt(m[2], 10) * (m[1] === '-' ? -1 : 1);
        };
        const ya: number = parseYear(a);
        const yb: number = parseYear(b);
        if (isNaN(ya) || isNaN(yb)) { return a < b ? -1 : a > b ? 1 : 0; }
        return ya < yb ? -1 : ya > yb ? 1 : 0;
    }

    private static compareGYearMonths(a: string, b: string): number {
        const parseYM = (s: string): number => {
            const m: RegExpMatchArray | null = s.match(/^(-?)([0-9]{4,})-([0-9]{2})/);
            if (!m) { return NaN; }
            const year: number = parseInt(m[2], 10) * (m[1] === '-' ? -1 : 1);
            return year * 12 + parseInt(m[3], 10);
        };
        const va: number = parseYM(a);
        const vb: number = parseYM(b);
        if (isNaN(va) || isNaN(vb)) { return a < b ? -1 : a > b ? 1 : 0; }
        return va < vb ? -1 : va > vb ? 1 : 0;
    }

    private static compareGMonthDays(a: string, b: string): number {
        const parseMD = (s: string): number => {
            const m: RegExpMatchArray | null = s.match(/^--([0-9]{2})-([0-9]{2})/);
            if (!m) { return NaN; }
            return parseInt(m[1], 10) * 100 + parseInt(m[2], 10);
        };
        const va: number = parseMD(a);
        const vb: number = parseMD(b);
        if (isNaN(va) || isNaN(vb)) { return a < b ? -1 : a > b ? 1 : 0; }
        return va < vb ? -1 : va > vb ? 1 : 0;
    }

    private static compareGMonths(a: string, b: string): number {
        const parseM = (s: string): number => {
            const m: RegExpMatchArray | null = s.match(/^--([0-9]{2})/);
            if (!m) { return NaN; }
            return parseInt(m[1], 10);
        };
        const va: number = parseM(a);
        const vb: number = parseM(b);
        if (isNaN(va) || isNaN(vb)) { return a < b ? -1 : a > b ? 1 : 0; }
        return va < vb ? -1 : va > vb ? 1 : 0;
    }

    private static compareGDays(a: string, b: string): number {
        const parseD = (s: string): number => {
            const m: RegExpMatchArray | null = s.match(/^---([0-9]{2})/);
            if (!m) { return NaN; }
            return parseInt(m[1], 10);
        };
        const va: number = parseD(a);
        const vb: number = parseD(b);
        if (isNaN(va) || isNaN(vb)) { return a < b ? -1 : a > b ? 1 : 0; }
        return va < vb ? -1 : va > vb ? 1 : 0;
    }

    private static parseDuration(s: string): { negative: boolean; months: number; seconds: number } | null {
        const m: RegExpMatchArray | null = s.match(
            /^(-?)P(?:([0-9]+)Y)?(?:([0-9]+)M)?(?:([0-9]+)D)?(?:T(?:([0-9]+)H)?(?:([0-9]+)M)?(?:([0-9]+(?:\.[0-9]+)?)S)?)?$/
        );
        if (!m) { return null; }
        const negative: boolean = m[1] === '-';
        const years: number = m[2] ? parseInt(m[2], 10) : 0;
        const months: number = m[3] ? parseInt(m[3], 10) : 0;
        const days: number = m[4] ? parseInt(m[4], 10) : 0;
        const hours: number = m[5] ? parseInt(m[5], 10) : 0;
        const minutes: number = m[6] ? parseInt(m[6], 10) : 0;
        const seconds: number = m[7] ? parseFloat(m[7]) : 0;
        const totalMonths: number = years * 12 + months;
        const totalSeconds: number = days * 86400 + hours * 3600 + minutes * 60 + seconds;
        return { negative, months: totalMonths, seconds: totalSeconds };
    }

    private static durationToSeconds(d: { negative: boolean; months: number; seconds: number }, refMonthSecs: number): number {
        const raw: number = d.months * refMonthSecs + d.seconds;
        return d.negative ? -raw : raw;
    }

    private static compareDurations(a: string, b: string): number | null {
        const dA = SchemaTypeValidator.parseDuration(a);
        const dB = SchemaTypeValidator.parseDuration(b);
        if (!dA || !dB) { return null; }
        const refPoints: number[] = [
            28 * 86400,
            29 * 86400,
            30 * 86400,
            31 * 86400
        ];
        let result: number | null = null;
        for (const ref of refPoints) {
            const sA: number = SchemaTypeValidator.durationToSeconds(dA, ref);
            const sB: number = SchemaTypeValidator.durationToSeconds(dB, ref);
            const cmp: number = sA < sB ? -1 : sA > sB ? 1 : 0;
            if (result === null) {
                result = cmp;
            } else if (result !== cmp) {
                return null;
            }
        }
        return result;
    }

    private static compareNumericOrLexicographic(a: string, b: string): number {
        const decimalPattern: RegExp = /^-?[0-9]+(\.[0-9]+)?$/;
        if (decimalPattern.test(a) && decimalPattern.test(b)) {
            try {
                const parseDecimal = (s: string): { negative: boolean; integer: bigint; fraction: string } => {
                    const negative: boolean = s.startsWith('-');
                    const abs: string = negative ? s.substring(1) : s;
                    const dotIndex: number = abs.indexOf('.');
                    const intPart: string = dotIndex === -1 ? abs : abs.substring(0, dotIndex);
                    const fracPart: string = dotIndex === -1 ? '' : abs.substring(dotIndex + 1);
                    return { negative, integer: BigInt(intPart), fraction: fracPart };
                };
                const padFraction = (frac: string, len: number): bigint => BigInt(frac.padEnd(len, '0').substring(0, len));
                const dA = parseDecimal(a);
                const dB = parseDecimal(b);
                const fracLen: number = Math.max(dA.fraction.length, dB.fraction.length);
                const scaleA: bigint = dA.integer * BigInt(10 ** fracLen) + padFraction(dA.fraction, fracLen);
                const scaleB: bigint = dB.integer * BigInt(10 ** fracLen) + padFraction(dB.fraction, fracLen);
                const signedA: bigint = dA.negative ? -scaleA : scaleA;
                const signedB: bigint = dB.negative ? -scaleB : scaleB;
                return signedA < signedB ? -1 : signedA > signedB ? 1 : 0;
            } catch (e) {
                // Fall through to float comparison.
            }
        }
        const numA: number = parseFloat(a);
        const numB: number = parseFloat(b);
        if (!isNaN(numA) && !isNaN(numB)) {
            return numA < numB ? -1 : numA > numB ? 1 : 0;
        }
        return a < b ? -1 : a > b ? 1 : 0;
    }

    static canonicalize(value: string, typeName: string, nsMap?: Map<string, string>): string {
        const colonIndex: number = typeName.indexOf(':');
        const localType: string = colonIndex !== -1 ? typeName.substring(colonIndex + 1) : typeName;
        switch (localType) {
            case 'decimal':
                return SchemaTypeValidator.canonicalDecimal(value);
            case 'integer':
            case 'long':
            case 'int':
            case 'short':
            case 'byte':
            case 'nonNegativeInteger':
            case 'positiveInteger':
            case 'unsignedLong':
            case 'unsignedInt':
            case 'unsignedShort':
            case 'unsignedByte':
            case 'nonPositiveInteger':
            case 'negativeInteger':
                return SchemaTypeValidator.canonicalInteger(value);
            case 'float':
            case 'double':
                return SchemaTypeValidator.canonicalFloat(value);
            case 'boolean':
                if (value === '1') { return 'true'; }
                if (value === '0') { return 'false'; }
                return value;
            case 'normalizedString':
                return value.replace(/[\t\n\r]/g, ' ');
            case 'token':
            case 'language':
            case 'Name':
            case 'NCName':
            case 'ID':
            case 'IDREF':
            case 'ENTITY':
            case 'NMTOKEN':
            case 'anyURI':
            case 'IDREFS':
            case 'ENTITIES':
            case 'NMTOKENS':
                return value.replace(/[\t\n\r ]+/g, ' ').trim();
            case 'QName': {
                const normalized: string = value.replace(/[\t\n\r ]+/g, ' ').trim();
                if (nsMap !== undefined) {
                    const qColon: number = normalized.indexOf(':');
                    if (qColon !== -1) {
                        const prefix: string = normalized.substring(0, qColon);
                        const localPart: string = normalized.substring(qColon + 1);
                        const nsUri: string | undefined = nsMap.get(prefix);
                        if (nsUri !== undefined) {
                            return '{' + nsUri + '}' + localPart;
                        }
                    } else {
                        const defaultNs: string | undefined = nsMap.get('');
                        if (defaultNs !== undefined) {
                            return '{' + defaultNs + '}' + normalized;
                        }
                    }
                }
                return normalized;
            }
            case 'hexBinary':
                return value.replace(/\s/g, '').toUpperCase();
            case 'base64Binary':
                return value.replace(/\s/g, '');
            case 'dateTime':
            case 'date':
            case 'time':
            case 'gYear':
            case 'gYearMonth':
            case 'gMonth':
            case 'gMonthDay':
            case 'gDay':
            case 'dateTimeStamp':
            case 'duration':
            case 'dayTimeDuration':
            case 'yearMonthDuration':
                return SchemaTypeValidator.canonicalizeTemporal(value);
            default:
                return value;
        }
    }

    private static canonicalDecimal(value: string): string {
        const s: string = value.trim();
        const negative: boolean = s.startsWith('-');
        const unsigned: string = (s.startsWith('+') || s.startsWith('-')) ? s.substring(1) : s;
        const dotIndex: number = unsigned.indexOf('.');
        let intPart: string = dotIndex === -1 ? unsigned : unsigned.substring(0, dotIndex);
        let fracPart: string = dotIndex === -1 ? '0' : unsigned.substring(dotIndex + 1);
        intPart = intPart.replace(/^0+/, '') || '0';
        fracPart = fracPart.replace(/0+$/, '') || '0';
        const isZero: boolean = intPart === '0' && /^0*$/.test(fracPart);
        if (isZero) {
            return '0.0';
        }
        return (negative ? '-' : '') + intPart + '.' + fracPart;
    }

    private static canonicalInteger(value: string): string {
        const s: string = value.trim();
        const negative: boolean = s.startsWith('-');
        const unsigned: string = (s.startsWith('+') || s.startsWith('-')) ? s.substring(1) : s;
        const stripped: string = unsigned.replace(/^0+/, '') || '0';
        if (stripped === '0') {
            return '0';
        }
        return (negative ? '-' : '') + stripped;
    }

    private static canonicalFloat(value: string): string {
        const trimmed: string = value.trim();
        if (trimmed === 'INF' || trimmed === '+INF') { return 'INF'; }
        if (trimmed === '-INF') { return '-INF'; }
        if (trimmed === 'NaN') { return 'NaN'; }
        return String(parseFloat(trimmed));
    }

    private static canonicalizeTemporal(value: string): string {
        // Normalize timezone: +00:00 → Z.
        let v: string = value.trim().replace(/\+00:00$/, 'Z');
        // Strip trailing zeros from fractional seconds, e.g. .100 → .1, .000 → remove.
        v = v.replace(/(\.[0-9]*?)0+(Z|[+-][0-9]{2}:[0-9]{2}|T|$)/, (_, frac, suffix) => {
            const trimmed: string = frac.replace(/\.?0+$/, '');
            return (trimmed === '.' ? '' : trimmed) + suffix;
        });
        return v;
    }
}
