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

export interface SchemaFacets {
    enumeration?: string[];
    patterns?: string[];
    minExclusive?: string;
    maxExclusive?: string;
    minInclusive?: string;
    maxInclusive?: string;
    length?: number;
    minLength?: number;
    maxLength?: number;
    totalDigits?: number;
    fractionDigits?: number;
}

export class SchemaTypeValidator {

    static validateFacets(value: string, facets: SchemaFacets): boolean {
        if (facets.enumeration && facets.enumeration.length > 0) {
            if (facets.enumeration.indexOf(value) === -1) {
                return false;
            }
        }
        if (facets.patterns && facets.patterns.length > 0) {
            let matched: boolean = false;
            for (let i: number = 0; i < facets.patterns.length; i++) {
                try {
                    if (new RegExp('^(?:' + facets.patterns[i] + ')$').test(value)) {
                        matched = true;
                        break;
                    }
                } catch (e) {
                    // Skip unrecognised XSD regex syntax.
                }
            }
            if (!matched) {
                return false;
            }
        }
        if (facets.minExclusive !== undefined || facets.maxExclusive !== undefined ||
                facets.minInclusive !== undefined || facets.maxInclusive !== undefined) {
            const numValue: number = parseFloat(value);
            const compare = (bound: string): number => {
                const numBound: number = parseFloat(bound);
                if (!isNaN(numValue) && !isNaN(numBound)) {
                    // Use BigInt for integers that exceed JavaScript's safe integer range.
                    if (/^-?[0-9]+$/.test(value) && /^-?[0-9]+$/.test(bound)) {
                        try {
                            const bigValue: bigint = BigInt(value);
                            const bigBound: bigint = BigInt(bound);
                            return bigValue < bigBound ? -1 : bigValue > bigBound ? 1 : 0;
                        } catch (e) {
                            // Fall through to float comparison.
                        }
                    }
                    return numValue < numBound ? -1 : numValue > numBound ? 1 : 0;
                }
                return value < bound ? -1 : value > bound ? 1 : 0;
            };
            if (facets.minExclusive !== undefined && compare(facets.minExclusive) <= 0) {
                return false;
            }
            if (facets.maxExclusive !== undefined && compare(facets.maxExclusive) >= 0) {
                return false;
            }
            if (facets.minInclusive !== undefined && compare(facets.minInclusive) < 0) {
                return false;
            }
            if (facets.maxInclusive !== undefined && compare(facets.maxInclusive) > 0) {
                return false;
            }
        }
        if (facets.length !== undefined && value.length !== facets.length) {
            return false;
        }
        if (facets.minLength !== undefined && value.length < facets.minLength) {
            return false;
        }
        if (facets.maxLength !== undefined && value.length > facets.maxLength) {
            return false;
        }
        if (facets.totalDigits !== undefined) {
            const stripped: string = value.replace(/[^0-9]/g, '');
            if (stripped.length > facets.totalDigits) {
                return false;
            }
        }
        if (facets.fractionDigits !== undefined) {
            const dotIndex: number = value.indexOf('.');
            if (dotIndex !== -1 && (value.length - dotIndex - 1) > facets.fractionDigits) {
                return false;
            }
        }
        return true;
    }

    static validate(value: string, typeName: string): boolean {
        const colonIndex: number = typeName.indexOf(':');
        const localType: string = colonIndex !== -1 ? typeName.substring(colonIndex + 1) : typeName;

        switch (localType) {
            case 'string':
            case 'normalizedString':
            case 'token':
            case 'anyURI':
            case 'base64Binary':
            case 'hexBinary':
            case 'anySimpleType':
            case 'anyAtomicType':
                return true;

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
            case 'date':
                return SchemaTypeValidator.isDate(value);
            case 'time':
                return SchemaTypeValidator.isTime(value);
            case 'duration':
                return SchemaTypeValidator.isDuration(value);
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
                return SchemaTypeValidator.isName(value);
            case 'NCName':
            case 'ID':
            case 'IDREF':
            case 'ENTITY':
                return SchemaTypeValidator.isNCName(value);
            case 'IDREFS':
            case 'ENTITIES':
                return SchemaTypeValidator.isWhitespaceList(value, SchemaTypeValidator.isNCName);
            case 'NMTOKEN':
                return SchemaTypeValidator.isNMTOKEN(value);
            case 'NMTOKENS':
                return SchemaTypeValidator.isWhitespaceList(value, SchemaTypeValidator.isNMTOKEN);
            case 'language':
                return SchemaTypeValidator.isLanguage(value);
            case 'QName':
                return SchemaTypeValidator.isQName(value);

            default:
                return true;
        }
    }

    private static isBoolean(value: string): boolean {
        return value === 'true' || value === 'false' || value === '1' || value === '0';
    }

    private static isDecimal(value: string): boolean {
        return /^[+-]?([0-9]+\.?[0-9]*|[0-9]*\.[0-9]+)$/.test(value);
    }

    private static isFloat(value: string): boolean {
        if (value === 'INF' || value === '-INF' || value === 'NaN') {
            return true;
        }
        return /^[+-]?([0-9]+\.?[0-9]*|[0-9]*\.[0-9]+)([eE][+-]?[0-9]+)?$/.test(value);
    }

    private static isInteger(value: string, typeName: string): boolean {
        if (!/^[+-]?[0-9]+$/.test(value)) {
            return false;
        }
        const n: number = parseInt(value, 10);
        if (isNaN(n)) {
            return false;
        }
        switch (typeName) {
            case 'nonNegativeInteger':
            case 'unsignedLong':
                return n >= 0;
            case 'positiveInteger':
                return n > 0;
            case 'nonPositiveInteger':
                return n <= 0;
            case 'negativeInteger':
                return n < 0;
            case 'byte':
                return n >= -128 && n <= 127;
            case 'short':
                return n >= -32768 && n <= 32767;
            case 'int':
                return n >= -2147483648 && n <= 2147483647;
            case 'unsignedByte':
                return n >= 0 && n <= 255;
            case 'unsignedShort':
                return n >= 0 && n <= 65535;
            case 'unsignedInt':
                return n >= 0 && n <= 4294967295;
            default:
                return true;
        }
    }

    private static isDateTime(value: string): boolean {
        return /^-?[0-9]{4,}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})?$/.test(value);
    }

    private static isDate(value: string): boolean {
        return /^-?[0-9]{4,}-[0-9]{2}-[0-9]{2}(Z|[+-][0-9]{2}:[0-9]{2})?$/.test(value);
    }

    private static isTime(value: string): boolean {
        return /^[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})?$/.test(value);
    }

    private static isDuration(value: string): boolean {
        if (value === 'P' || value === '-P') {
            return false;
        }
        return /^-?P([0-9]+Y)?([0-9]+M)?([0-9]+D)?(T([0-9]+H)?([0-9]+M)?([0-9]+(\.[0-9]+)?S)?)?$/.test(value);
    }

    private static isGYear(value: string): boolean {
        return /^-?[0-9]{4,}(Z|[+-][0-9]{2}:[0-9]{2})?$/.test(value);
    }

    private static isGYearMonth(value: string): boolean {
        return /^-?[0-9]{4,}-[0-9]{2}(Z|[+-][0-9]{2}:[0-9]{2})?$/.test(value);
    }

    private static isGMonth(value: string): boolean {
        return /^--[0-9]{2}(Z|[+-][0-9]{2}:[0-9]{2})?$/.test(value);
    }

    private static isGMonthDay(value: string): boolean {
        return /^--[0-9]{2}-[0-9]{2}(Z|[+-][0-9]{2}:[0-9]{2})?$/.test(value);
    }

    private static isGDay(value: string): boolean {
        return /^---[0-9]{2}(Z|[+-][0-9]{2}:[0-9]{2})?$/.test(value);
    }

    private static isName(value: string): boolean {
        return /^[:A-Za-z_\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD][:\-\.0-9A-Za-z_\u00B7\u0300-\u036F\u203F-\u2040\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]*$/.test(value);
    }

    private static isNCName(value: string): boolean {
        return /^[A-Za-z_\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD][A-Za-z0-9_\-\.\u00B7\u0300-\u036F\u203F-\u2040\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]*$/.test(value);
    }

    private static isNMTOKEN(value: string): boolean {
        return /^[A-Za-z0-9_\-\.\:]+$/.test(value) && value.length > 0;
    }

    private static isLanguage(value: string): boolean {
        return /^[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*$/.test(value);
    }

    private static isQName(value: string): boolean {
        const parts: string[] = value.split(':');
        if (parts.length === 1) {
            return SchemaTypeValidator.isNCName(parts[0]);
        }
        if (parts.length === 2) {
            return SchemaTypeValidator.isNCName(parts[0]) && SchemaTypeValidator.isNCName(parts[1]);
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
}
