/*******************************************************************************
 * Copyright (c) 2022 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse   License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

export class XMLUtils {

    static cleanString(text: string): string {
        let result: string = text.replace('&', '&amp;');
        return result.replace('<', '&lt;');
    }

    static unquote(text: string): string {
        return text.replace('"', '&quot;');
    }

    static normalizeLines(text: string): string {
        let result: string = text.replace('\r\n', '\n');
        return result.replace('\r', '\n');
    }

    static isXmlSpace(char: string): boolean {
        return char.charCodeAt(0) === 0x20 || char.charCodeAt(0) === 0x9 || char.charCodeAt(0) === 0xA;
    }

    static normalizeSpaces(text: string): string {
        return text.replace(/[\r\n\t]/s, ' ');
    }

    static validXml10Chars(text: string): string {
        let result: string = '';
        let length: number = text.length;
        for (let i = 0; i < length; i++) {
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