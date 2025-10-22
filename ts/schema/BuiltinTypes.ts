/*******************************************************************************
 * Copyright (c) 2023 - 2025 Maxprograms.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *******************************************************************************/

import { SimpleType } from "./SimpleType";
import { ValidationResult } from "../grammar/Grammar";

export class BuiltinTypes {
    private static types: Map<string, SimpleType> = new Map();
    private static initialized: boolean = false;

    static initialize(): void {
        if (this.initialized) {
            return;
        }

        const xsNamespace = "http://www.w3.org/2001/XMLSchema";

        // Base types
        this.createType("anyType", xsNamespace, () => ValidationResult.success());
        this.createType("anySimpleType", xsNamespace, () => ValidationResult.success());
        
        // String types
        this.createType("string", xsNamespace, this.validateString);
        this.createType("normalizedString", xsNamespace, this.validateNormalizedString);
        this.createType("token", xsNamespace, this.validateToken);
        this.createType("language", xsNamespace, this.validateLanguage);
        this.createType("Name", xsNamespace, this.validateName);
        this.createType("NCName", xsNamespace, this.validateNCName);
        this.createType("ID", xsNamespace, this.validateID);
        this.createType("IDREF", xsNamespace, this.validateIDREF);
        this.createType("ENTITY", xsNamespace, this.validateNCName);
        this.createType("NMTOKEN", xsNamespace, this.validateNMTOKEN);
        
        // Numeric types
        this.createType("decimal", xsNamespace, this.validateDecimal);
        this.createType("integer", xsNamespace, this.validateInteger);
        this.createType("nonPositiveInteger", xsNamespace, this.validateNonPositiveInteger);
        this.createType("negativeInteger", xsNamespace, this.validateNegativeInteger);
        this.createType("long", xsNamespace, this.validateLong);
        this.createType("int", xsNamespace, this.validateInt);
        this.createType("short", xsNamespace, this.validateShort);
        this.createType("byte", xsNamespace, this.validateByte);
        this.createType("nonNegativeInteger", xsNamespace, this.validateNonNegativeInteger);
        this.createType("positiveInteger", xsNamespace, this.validatePositiveInteger);
        this.createType("unsignedLong", xsNamespace, this.validateUnsignedLong);
        this.createType("unsignedInt", xsNamespace, this.validateUnsignedInt);
        this.createType("unsignedShort", xsNamespace, this.validateUnsignedShort);
        this.createType("unsignedByte", xsNamespace, this.validateUnsignedByte);
        this.createType("float", xsNamespace, this.validateFloat);
        this.createType("double", xsNamespace, this.validateDouble);
        
        // Date/time types
        this.createType("duration", xsNamespace, this.validateDuration);
        this.createType("dateTime", xsNamespace, this.validateDateTime);
        this.createType("time", xsNamespace, this.validateTime);
        this.createType("date", xsNamespace, this.validateDate);
        this.createType("gYearMonth", xsNamespace, this.validateGYearMonth);
        this.createType("gYear", xsNamespace, this.validateGYear);
        this.createType("gMonthDay", xsNamespace, this.validateGMonthDay);
        this.createType("gDay", xsNamespace, this.validateGDay);
        this.createType("gMonth", xsNamespace, this.validateGMonth);
        
        // Other types
        this.createType("boolean", xsNamespace, this.validateBoolean);
        this.createType("base64Binary", xsNamespace, this.validateBase64Binary);
        this.createType("hexBinary", xsNamespace, this.validateHexBinary);
        this.createType("anyURI", xsNamespace, this.validateAnyURI);
        this.createType("QName", xsNamespace, this.validateQName);
        this.createType("NOTATION", xsNamespace, this.validateQName);

        this.initialized = true;
    }

    private static createType(localName: string, namespace: string, validator: (value: string) => ValidationResult): void {
        const type = new SimpleType(localName, namespace);
        type.setCustomValidator(validator);
        this.types.set(`{${namespace}}${localName}`, type);
    }

    static getType(name: string): SimpleType | undefined {
        this.initialize();
        const colonIndex = name.indexOf(':');
        const localName = colonIndex !== -1 ? name.substring(colonIndex + 1) : name;
        // For built-in types, assume XML Schema namespace
        const key = `{http://www.w3.org/2001/XMLSchema}${localName}`;
        return this.types.get(key);
    }

    static getAllTypes(): Map<string, SimpleType> {
        this.initialize();
        return this.types;
    }

    // String validation methods
    private static validateString(value: string): ValidationResult {
        return ValidationResult.success();
    }

    private static validateNormalizedString(value: string): ValidationResult {
        // No #x9 (tab), #xA (line feed) or #xD (carriage return)
        if (/[\t\n\r]/.test(value)) {
            return ValidationResult.error("normalizedString cannot contain tab, line feed, or carriage return");
        }
        return ValidationResult.success();
    }

    private static validateToken(value: string): ValidationResult {
        // normalizedString + no leading/trailing/consecutive spaces
        const normalized = this.validateNormalizedString(value);
        if (!normalized.isValid) {
            return normalized;
        }
        
        if (value !== value.trim() || /\s{2,}/.test(value)) {
            return ValidationResult.error("token cannot have leading/trailing whitespace or consecutive spaces");
        }
        return ValidationResult.success();
    }

    private static validateLanguage(value: string): ValidationResult {
        // RFC 3066 language codes
        const pattern = /^[a-zA-Z]{1,8}(-[a-zA-Z0-9]{1,8})*$/;
        if (!pattern.test(value)) {
            return ValidationResult.error("Invalid language code format");
        }
        return ValidationResult.success();
    }

    private static validateName(value: string): ValidationResult {
        // XML Name production
        const pattern = /^[a-zA-Z_:][a-zA-Z0-9_:.-]*$/;
        if (!pattern.test(value)) {
            return ValidationResult.error("Invalid XML Name");
        }
        return ValidationResult.success();
    }

    private static validateNCName(value: string): ValidationResult {
        // Name without colons
        const nameResult = this.validateName(value);
        if (!nameResult.isValid) {
            return nameResult;
        }
        
        if (value.includes(':')) {
            return ValidationResult.error("NCName cannot contain colons");
        }
        return ValidationResult.success();
    }

    private static validateID(value: string): ValidationResult {
        return this.validateNCName(value);
    }

    private static validateIDREF(value: string): ValidationResult {
        return this.validateNCName(value);
    }

    private static validateNMTOKEN(value: string): ValidationResult {
        // XML Nmtoken production
        const pattern = /^[a-zA-Z0-9_:.-]+$/;
        if (!pattern.test(value)) {
            return ValidationResult.error("Invalid NMTOKEN");
        }
        return ValidationResult.success();
    }

    // Numeric validation methods
    private static validateDecimal(value: string): ValidationResult {
        const pattern = /^[+-]?(\d+\.?\d*|\d*\.\d+)$/;
        if (!pattern.test(value)) {
            return ValidationResult.error("Invalid decimal format");
        }
        return ValidationResult.success();
    }

    private static validateInteger(value: string): ValidationResult {
        const pattern = /^[+-]?\d+$/;
        if (!pattern.test(value)) {
            return ValidationResult.error("Invalid integer format");
        }
        return ValidationResult.success();
    }

    private static validateNonPositiveInteger(value: string): ValidationResult {
        const intResult = this.validateInteger(value);
        if (!intResult.isValid) {
            return intResult;
        }
        
        const num = parseInt(value, 10);
        if (num > 0) {
            return ValidationResult.error("nonPositiveInteger must be <= 0");
        }
        return ValidationResult.success();
    }

    private static validateNegativeInteger(value: string): ValidationResult {
        const intResult = this.validateInteger(value);
        if (!intResult.isValid) {
            return intResult;
        }
        
        const num = parseInt(value, 10);
        if (num >= 0) {
            return ValidationResult.error("negativeInteger must be < 0");
        }
        return ValidationResult.success();
    }

    private static validateLong(value: string): ValidationResult {
        const intResult = this.validateInteger(value);
        if (!intResult.isValid) {
            return intResult;
        }
        
        const num = parseInt(value, 10);
        if (num < -9223372036854775808 || num > 9223372036854775807) {
            return ValidationResult.error("long value out of range");
        }
        return ValidationResult.success();
    }

    private static validateInt(value: string): ValidationResult {
        const intResult = this.validateInteger(value);
        if (!intResult.isValid) {
            return intResult;
        }
        
        const num = parseInt(value, 10);
        if (num < -2147483648 || num > 2147483647) {
            return ValidationResult.error("int value out of range");
        }
        return ValidationResult.success();
    }

    private static validateShort(value: string): ValidationResult {
        const intResult = this.validateInteger(value);
        if (!intResult.isValid) {
            return intResult;
        }
        
        const num = parseInt(value, 10);
        if (num < -32768 || num > 32767) {
            return ValidationResult.error("short value out of range");
        }
        return ValidationResult.success();
    }

    private static validateByte(value: string): ValidationResult {
        const intResult = this.validateInteger(value);
        if (!intResult.isValid) {
            return intResult;
        }
        
        const num = parseInt(value, 10);
        if (num < -128 || num > 127) {
            return ValidationResult.error("byte value out of range");
        }
        return ValidationResult.success();
    }

    private static validateNonNegativeInteger(value: string): ValidationResult {
        const intResult = this.validateInteger(value);
        if (!intResult.isValid) {
            return intResult;
        }
        
        const num = parseInt(value, 10);
        if (num < 0) {
            return ValidationResult.error("nonNegativeInteger must be >= 0");
        }
        return ValidationResult.success();
    }

    private static validatePositiveInteger(value: string): ValidationResult {
        const intResult = this.validateInteger(value);
        if (!intResult.isValid) {
            return intResult;
        }
        
        const num = parseInt(value, 10);
        if (num <= 0) {
            return ValidationResult.error("positiveInteger must be > 0");
        }
        return ValidationResult.success();
    }

    private static validateUnsignedLong(value: string): ValidationResult {
        const nonNegResult = this.validateNonNegativeInteger(value);
        if (!nonNegResult.isValid) {
            return nonNegResult;
        }
        
        const num = parseInt(value, 10);
        if (num > 18446744073709551615) {
            return ValidationResult.error("unsignedLong value out of range");
        }
        return ValidationResult.success();
    }

    private static validateUnsignedInt(value: string): ValidationResult {
        const nonNegResult = this.validateNonNegativeInteger(value);
        if (!nonNegResult.isValid) {
            return nonNegResult;
        }
        
        const num = parseInt(value, 10);
        if (num > 4294967295) {
            return ValidationResult.error("unsignedInt value out of range");
        }
        return ValidationResult.success();
    }

    private static validateUnsignedShort(value: string): ValidationResult {
        const nonNegResult = this.validateNonNegativeInteger(value);
        if (!nonNegResult.isValid) {
            return nonNegResult;
        }
        
        const num = parseInt(value, 10);
        if (num > 65535) {
            return ValidationResult.error("unsignedShort value out of range");
        }
        return ValidationResult.success();
    }

    private static validateUnsignedByte(value: string): ValidationResult {
        const nonNegResult = this.validateNonNegativeInteger(value);
        if (!nonNegResult.isValid) {
            return nonNegResult;
        }
        
        const num = parseInt(value, 10);
        if (num > 255) {
            return ValidationResult.error("unsignedByte value out of range");
        }
        return ValidationResult.success();
    }

    private static validateFloat(value: string): ValidationResult {
        if (value === "INF" || value === "-INF" || value === "NaN") {
            return ValidationResult.success();
        }
        
        const num = parseFloat(value);
        if (isNaN(num)) {
            return ValidationResult.error("Invalid float format");
        }
        return ValidationResult.success();
    }

    private static validateDouble(value: string): ValidationResult {
        return this.validateFloat(value);
    }

    // Date/time validation methods
    private static validateDuration(value: string): ValidationResult {
        // P[n]Y[n]M[n]DT[n]H[n]M[n]S
        const pattern = /^-?P(\d+Y)?(\d+M)?(\d+D)?(T(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?$/;
        if (!pattern.test(value)) {
            return ValidationResult.error("Invalid duration format");
        }
        return ValidationResult.success();
    }

    private static validateDateTime(value: string): ValidationResult {
        // YYYY-MM-DDTHH:MM:SS(.s+)?(Z|[+-]HH:MM)?
        const pattern = /^-?\d{4,}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;
        if (!pattern.test(value)) {
            return ValidationResult.error("Invalid dateTime format");
        }
        return ValidationResult.success();
    }

    private static validateTime(value: string): ValidationResult {
        // HH:MM:SS(.s+)?(Z|[+-]HH:MM)?
        const pattern = /^\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;
        if (!pattern.test(value)) {
            return ValidationResult.error("Invalid time format");
        }
        return ValidationResult.success();
    }

    private static validateDate(value: string): ValidationResult {
        // YYYY-MM-DD(Z|[+-]HH:MM)?
        const pattern = /^-?\d{4,}-\d{2}-\d{2}(Z|[+-]\d{2}:\d{2})?$/;
        if (!pattern.test(value)) {
            return ValidationResult.error("Invalid date format");
        }
        return ValidationResult.success();
    }

    private static validateGYearMonth(value: string): ValidationResult {
        // YYYY-MM(Z|[+-]HH:MM)?
        const pattern = /^-?\d{4,}-\d{2}(Z|[+-]\d{2}:\d{2})?$/;
        if (!pattern.test(value)) {
            return ValidationResult.error("Invalid gYearMonth format");
        }
        return ValidationResult.success();
    }

    private static validateGYear(value: string): ValidationResult {
        // YYYY(Z|[+-]HH:MM)?
        const pattern = /^-?\d{4,}(Z|[+-]\d{2}:\d{2})?$/;
        if (!pattern.test(value)) {
            return ValidationResult.error("Invalid gYear format");
        }
        return ValidationResult.success();
    }

    private static validateGMonthDay(value: string): ValidationResult {
        // --MM-DD(Z|[+-]HH:MM)?
        const pattern = /^--\d{2}-\d{2}(Z|[+-]\d{2}:\d{2})?$/;
        if (!pattern.test(value)) {
            return ValidationResult.error("Invalid gMonthDay format");
        }
        return ValidationResult.success();
    }

    private static validateGDay(value: string): ValidationResult {
        // ---DD(Z|[+-]HH:MM)?
        const pattern = /^---\d{2}(Z|[+-]\d{2}:\d{2})?$/;
        if (!pattern.test(value)) {
            return ValidationResult.error("Invalid gDay format");
        }
        return ValidationResult.success();
    }

    private static validateGMonth(value: string): ValidationResult {
        // --MM(Z|[+-]HH:MM)?
        const pattern = /^--\d{2}(Z|[+-]\d{2}:\d{2})?$/;
        if (!pattern.test(value)) {
            return ValidationResult.error("Invalid gMonth format");
        }
        return ValidationResult.success();
    }

    // Other validation methods
    private static validateBoolean(value: string): ValidationResult {
        if (value !== "true" && value !== "false" && value !== "1" && value !== "0") {
            return ValidationResult.error("boolean must be true, false, 1, or 0");
        }
        return ValidationResult.success();
    }

    private static validateBase64Binary(value: string): ValidationResult {
        // Base64 alphabet with optional padding
        const pattern = /^[A-Za-z0-9+/]*={0,2}$/;
        if (!pattern.test(value) || value.length % 4 !== 0) {
            return ValidationResult.error("Invalid base64Binary format");
        }
        return ValidationResult.success();
    }

    private static validateHexBinary(value: string): ValidationResult {
        const pattern = /^[0-9A-Fa-f]*$/;
        if (!pattern.test(value) || value.length % 2 !== 0) {
            return ValidationResult.error("Invalid hexBinary format");
        }
        return ValidationResult.success();
    }

    private static validateAnyURI(value: string): ValidationResult {
        // Very basic URI validation - could be more comprehensive
        try {
            new URL(value);
            return ValidationResult.success();
        } catch {
            // Allow relative URIs and other URI formats
            if (value.trim() === "") {
                return ValidationResult.error("anyURI cannot be empty");
            }
            return ValidationResult.success();
        }
    }

    private static validateQName(value: string): ValidationResult {
        // [prefix:]localPart
        const parts = value.split(':');
        if (parts.length > 2) {
            return ValidationResult.error("QName can have at most one colon");
        }
        
        for (const part of parts) {
            const ncNameResult = this.validateNCName(part);
            if (!ncNameResult.isValid) {
                return ValidationResult.error("Invalid QName: " + ncNameResult.errors[0].message);
            }
        }
        
        return ValidationResult.success();
    }
}