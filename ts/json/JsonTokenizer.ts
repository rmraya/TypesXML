/*******************************************************************************
 * Copyright (c) 2025 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse   License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

import { NeedMoreDataError } from "../NeedMoreDataError";

export type JsonToken =
    | { type: 'braceOpen' }
    | { type: 'braceClose' }
    | { type: 'bracketOpen' }
    | { type: 'bracketClose' }
    | { type: 'colon' }
    | { type: 'comma' }
    | { type: 'string'; value: string }
    | { type: 'number'; value: number }
    | { type: 'boolean'; value: boolean }
    | { type: 'null' }
    | { type: 'eof' };

export class JsonTokenizer {

    private buffer: string = '';
    private offset: number = 0;
    private finished: boolean = false;
    private lookahead: JsonToken | undefined;

    enqueue(chunk: string): void {
        if (chunk.length === 0) {
            return;
        }
        this.buffer += chunk;
    }

    markFinished(): void {
        this.finished = true;
    }

    nextToken(): JsonToken {
        if (this.lookahead) {
            const token: JsonToken = this.lookahead;
            this.lookahead = undefined;
            return token;
        }
        return this.readToken();
    }

    peekToken(): JsonToken {
        if (!this.lookahead) {
            this.lookahead = this.readToken();
        }
        return this.lookahead;
    }

    private readToken(): JsonToken {
        this.skipWhitespace();
        if (this.offset >= this.buffer.length) {
            if (this.finished) {
                return { type: 'eof' };
            }
            throw new NeedMoreDataError();
        }
        const char: string = this.buffer[this.offset];
        switch (char) {
            case '{':
                this.offset++;
                this.compactBuffer();
                return { type: 'braceOpen' };
            case '}':
                this.offset++;
                this.compactBuffer();
                return { type: 'braceClose' };
            case '[':
                this.offset++;
                this.compactBuffer();
                return { type: 'bracketOpen' };
            case ']':
                this.offset++;
                this.compactBuffer();
                return { type: 'bracketClose' };
            case ':':
                this.offset++;
                this.compactBuffer();
                return { type: 'colon' };
            case ',':
                this.offset++;
                this.compactBuffer();
                return { type: 'comma' };
            case '"':
                this.offset++;
                return this.makeStringToken();
            case 't':
                this.readLiteral('true');
                return { type: 'boolean', value: true };
            case 'f':
                this.readLiteral('false');
                return { type: 'boolean', value: false };
            case 'n':
                this.readLiteral('null');
                return { type: 'null' };
            default:
                if (char === '-' || this.isDigit(char)) {
                    const value: number = this.readNumber();
                    return { type: 'number', value };
                }
                throw new Error('Unexpected character in JSON stream: ' + char);
        }
    }

    private makeStringToken(): JsonToken {
        const openingOffset: number = this.offset - 1;
        let result: string = '';
        let escaping: boolean = false;
        while (true) {
            if (this.offset >= this.buffer.length) {
                if (this.finished) {
                    throw new Error('Unterminated string literal');
                }
                this.offset = openingOffset;
                throw new NeedMoreDataError();
            }
            const char: string = this.buffer[this.offset];
            this.offset++;
            if (escaping) {
                escaping = false;
                switch (char) {
                    case '"':
                        result += '"';
                        break;
                    case '\\':
                        result += '\\';
                        break;
                    case '/':
                        result += '/';
                        break;
                    case 'b':
                        result += '\b';
                        break;
                    case 'f':
                        result += '\f';
                        break;
                    case 'n':
                        result += '\n';
                        break;
                    case 'r':
                        result += '\r';
                        break;
                    case 't':
                        result += '\t';
                        break;
                    case 'u':
                        result += this.readUnicodeEscape(openingOffset);
                        break;
                    default:
                        throw new Error('Invalid escape sequence in string literal');
                }
                continue;
            }
            if (char === '\\') {
                escaping = true;
                continue;
            }
            if (char === '"') {
                this.compactBuffer();
                return { type: 'string', value: result };
            }
            result += char;
        }
    }

    private readUnicodeEscape(resetOffset: number): string {
        if (this.offset + 4 > this.buffer.length) {
            if (this.finished) {
                throw new Error('Unterminated unicode escape sequence');
            }
            this.offset = resetOffset;
            throw new NeedMoreDataError();
        }
        const hexDigits: string = this.buffer.substring(this.offset, this.offset + 4);
        if (!/^[0-9A-Fa-f]{4}$/.test(hexDigits)) {
            throw new Error('Invalid unicode escape sequence: \\u' + hexDigits);
        }
        this.offset += 4;
        const codePoint: number = parseInt(hexDigits, 16);
        return String.fromCharCode(codePoint);
    }

    private readNumber(): number {
        const startOffset: number = this.offset;
        let index: number = this.offset;

        const charAt = (position: number): string | undefined => {
            if (position >= this.buffer.length) {
                if (this.finished) {
                    return undefined;
                }
                this.offset = startOffset;
                throw new NeedMoreDataError();
            }
            return this.buffer[position];
        };

        const firstChar: string | undefined = charAt(index);
        if (firstChar === undefined) {
            throw new Error('Invalid number literal');
        }
        if (firstChar === '-') {
            index++;
        }

        const leadingDigit: string | undefined = charAt(index);
        if (leadingDigit === undefined || !this.isDigit(leadingDigit)) {
            throw new Error('Invalid number literal');
        }
        if (leadingDigit === '0') {
            index++;
        } else {
            do {
                index++;
                const nextChar: string | undefined = charAt(index);
                if (nextChar === undefined || !this.isDigit(nextChar)) {
                    break;
                }
            } while (true);
        }

        const fractionIndicator: string | undefined = charAt(index);
        if (fractionIndicator === '.') {
            index++;
            const fractionDigit: string | undefined = charAt(index);
            if (fractionDigit === undefined || !this.isDigit(fractionDigit)) {
                throw new Error('Invalid fractional part in number literal');
            }
            do {
                index++;
                const nextChar: string | undefined = charAt(index);
                if (nextChar === undefined || !this.isDigit(nextChar)) {
                    break;
                }
            } while (true);
        }

        const exponentIndicator: string | undefined = charAt(index);
        if (exponentIndicator === 'e' || exponentIndicator === 'E') {
            index++;
            const signChar: string | undefined = charAt(index);
            if (signChar === '+' || signChar === '-') {
                index++;
            }
            const exponentDigit: string | undefined = charAt(index);
            if (exponentDigit === undefined || !this.isDigit(exponentDigit)) {
                throw new Error('Invalid exponent in number literal');
            }
            do {
                index++;
                const nextChar: string | undefined = charAt(index);
                if (nextChar === undefined || !this.isDigit(nextChar)) {
                    break;
                }
            } while (true);
        }

        const fragment: string = this.buffer.substring(startOffset, index);
        const value: number = Number(fragment);
        if (!Number.isFinite(value)) {
            throw new Error('Invalid number literal: ' + fragment);
        }
        this.offset = index;
        this.compactBuffer();
        return value;
    }

    private readLiteral(expected: string): void {
        const startOffset: number = this.offset;
        const endOffset: number = this.offset + expected.length;
        while (endOffset > this.buffer.length) {
            if (this.finished) {
                throw new Error('Unexpected end of JSON stream while reading literal');
            }
            this.offset = startOffset;
            throw new NeedMoreDataError();
        }
        const fragment: string = this.buffer.substring(this.offset, endOffset);
        if (fragment !== expected) {
            throw new Error('Unexpected literal: ' + fragment);
        }
        this.offset = endOffset;
        this.compactBuffer();
    }

    private skipWhitespace(): void {
        while (this.offset < this.buffer.length) {
            const char: string = this.buffer[this.offset];
            if (char === ' ' || char === '\n' || char === '\r' || char === '\t') {
                this.offset++;
                continue;
            }
            break;
        }
        this.compactBuffer();
    }

    private isDigit(char: string): boolean {
        return char >= '0' && char <= '9';
    }

    private compactBuffer(): void {
        if (this.offset === 0) {
            return;
        }
        if (this.offset >= 4096) {
            this.buffer = this.buffer.substring(this.offset);
            this.offset = 0;
        }
    }
}
