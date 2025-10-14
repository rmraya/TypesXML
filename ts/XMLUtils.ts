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

export class XMLUtils {

    static readonly SPACES: string = ' \t\r\n';

    static cleanString(text: string): string {
        let result: string = XMLUtils.replaceAll(text, '&', '&amp;');
        result = XMLUtils.replaceAll(result, '<', '&lt;');
        return XMLUtils.replaceAll(result, '>', '&gt;');
    }

    static unquote(text: string): string {
        return XMLUtils.replaceAll(text, '"', '&quot;');
    }

    static normalizeLines(text: string): string {
        let result: string = XMLUtils.replaceAll(text, '\r\n', '\n');
        return XMLUtils.replaceAll(result, '\r', '\n');
    }

    static isXmlSpace(char: string): boolean {
        return this.SPACES.indexOf(char) > -1;
    }

    static hasParameterEntity(text: string) {
        let index: number = text.indexOf('%');
        if (index === -1) {
            return false;
        }
        let length: number = text.length;
        for (let i: number = index + 1; i < length; i++) {
            let c: string = text.charAt(i);
            if (this.isXmlSpace(c)) {
                return false;
            }
            if (c === ';') {
                return true;
            }
        }
        return false;
    }

    static normalizeSpaces(text: string): string {
        return String(text).replace(/\s+/g, ' ');
    }

    static replaceAll(text: string, search: string, replacement: string): string {
        return String(text).split(search).join(replacement);
    }

    static escapeRegExpChars(text: string): string {
        let result: string = '';
        let length: number = text.length;
        for (let i: number = 0; i < length; i++) {
            let c: string = text.charAt(i);
            if ('[]{}()^$?*+.'.indexOf(c) > -1) {
                result += '\\';
            }
            result += c;
        }
        return result;
    }

    static validXml10Chars(text: string): string {
        let result: string = '';
        let length: number = text.length;
        for (let i: number = 0; i < length; i++) {
            let c: number = text.charCodeAt(i);
            if (XMLUtils.isValidXml10Char(c)) {
                result += String.fromCharCode(c);
            }
        }
        return result;
    }

    static isValidXml10Char(c: number): boolean {
        // From XML 1.0 spec valid chars: 
        // #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]	
        // any Unicode character, excluding the surrogate blocks, FFFE, and FFFF.
        return c === 0x9 || c == 0xA || c === 0xD ||
            (c >= 0x20 && c <= 0xD7FF) ||
            (c >= 0xE000 && c <= 0xFFFD) ||
            (c >= 0x10000 && c <= 0x10FFFF);
    }

    static validXml11Chars(text: string): string {
        let result: string = '';
        let length: number = text.length;
        for (let i = 0; i < length; i++) {
            let c: number = text.charCodeAt(i);
            if (XMLUtils.isValidXml11Char(c)) {
                result += String.fromCharCode(c);
            }
        }
        return result;
    }

    static isValidXml11Char(c: number): boolean {
        // From XML 1.1 spec valid chars: 
        // [#x1-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]	
        // any Unicode character, excluding the surrogate blocks, FFFE, and FFFF. 
        return (c >= 0x1 && c <= 0xD7FF) ||
            (c >= 0xE000 && c <= 0xFFFD) ||
            (c >= 0x10000 && c <= 0x10FFFF);
    }

    static lookingAt(search: string, text: string, start: number): boolean {
        let length: number = search.length;
        if (length + start > text.length) {
            return false;
        }
        for (let i = 0; i < length; i++) {
            if (text[start + i] !== search[i]) {
                return false;
            }
        }
        return true;
    }
}