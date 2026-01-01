/*******************************************************************************
 * Copyright (c) 2023-2026 Maxprograms.
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
import { JsonTokenizer, JsonToken } from "./JsonTokenizer";

export interface JsonAttributeDescriptor {
    name: string;
    value: string;
}

export type JsonNodeEvent =
    | { type: 'startDocument' }
    | { type: 'endDocument' }
    | { type: 'xmlDeclaration'; version: string; encoding: string; standalone?: string }
    | { type: 'startElement'; name: string; attributes: Array<JsonAttributeDescriptor> }
    | { type: 'endElement'; name: string }
    | { type: 'characters'; value: string }
    | { type: 'ignorableWhitespace'; value: string }
    | { type: 'comment'; value: string }
    | { type: 'processingInstruction'; target: string; data: string }
    | { type: 'startCDATA' }
    | { type: 'endCDATA' }
    | { type: 'startDTD'; name: string; publicId: string; systemId: string }
    | { type: 'internalSubset'; declaration: string }
    | { type: 'endDTD' }
    | { type: 'skippedEntity'; name: string };

export class JsonNodeReader {

    private readonly tokenizer: JsonTokenizer;
    private sequenceStarted: boolean = false;
    private sequenceEnded: boolean = false;
    private expectComma: boolean = false;
    private pendingTrailingValidation: boolean = false;

    constructor(tokenizer: JsonTokenizer) {
        this.tokenizer = tokenizer;
    }

    readNextEvent(): JsonNodeEvent | undefined {
        if (this.sequenceEnded) {
            if (this.pendingTrailingValidation) {
                const trailing: JsonToken = this.tokenizer.peekToken();
                if (trailing.type !== 'eof') {
                    throw new Error('Unexpected trailing content after JSON event stream');
                }
                this.pendingTrailingValidation = false;
            }
            return undefined;
        }
        this.ensureSequenceStarted();
        if (this.expectComma) {
            const nextToken: JsonToken = this.tokenizer.peekToken();
            if (nextToken.type === 'bracketClose') {
                this.consumeAndFinish();
                return undefined;
            }
            this.consumeDelimiter('comma');
            this.expectComma = false;
        }
        const lookAhead: JsonToken = this.tokenizer.peekToken();
        if (lookAhead.type === 'bracketClose') {
            this.consumeAndFinish();
            return undefined;
        }
        const value: unknown = this.parseValue();
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
            throw new Error('JSON event entries must be objects');
        }
        const payload: Record<string, unknown> = value as Record<string, unknown>;
        const event: JsonNodeEvent = this.toEvent(payload);
        this.expectComma = true;
        return event;
    }

    private ensureSequenceStarted(): void {
        if (this.sequenceStarted) {
            return;
        }
        const token: JsonToken = this.tokenizer.nextToken();
        if (token.type !== 'bracketOpen') {
            throw new Error('JSON event stream must start with an array');
        }
        this.sequenceStarted = true;
    }

    private consumeAndFinish(): void {
        const endToken: JsonToken = this.tokenizer.nextToken();
        if (endToken.type !== 'bracketClose') {
            throw new Error('Malformed JSON event stream: expected closing bracket');
        }
        this.sequenceEnded = true;
        try {
            const trailing: JsonToken = this.tokenizer.peekToken();
            if (trailing.type !== 'eof') {
                throw new Error('Unexpected trailing content after JSON event stream');
            }
            this.pendingTrailingValidation = false;
        } catch (error) {
            if (error instanceof NeedMoreDataError) {
                this.pendingTrailingValidation = true;
                return;
            }
            throw error;
        }
    }

    private consumeDelimiter(expected: 'comma'): void {
        const token: JsonToken = this.tokenizer.nextToken();
        if (token.type !== expected) {
            throw new Error('Malformed JSON event stream: expected comma delimiter');
        }
    }

    private parseValue(): unknown {
        const token: JsonToken = this.tokenizer.nextToken();
        switch (token.type) {
            case 'string':
                return token.value;
            case 'number':
                return token.value;
            case 'boolean':
                return token.value;
            case 'null':
                return null;
            case 'braceOpen':
                return this.parseObject();
            case 'bracketOpen':
                return this.parseArray();
            case 'eof':
                throw new Error('Unexpected end of JSON stream while parsing value');
            default:
                throw new Error('Unexpected token while parsing value');
        }
    }

    private parseObject(): Record<string, unknown> {
        const result: Record<string, unknown> = {};
        const next: JsonToken = this.tokenizer.peekToken();
        if (next.type === 'braceClose') {
            this.tokenizer.nextToken();
            return result;
        }
        while (true) {
            const keyToken: JsonToken = this.tokenizer.nextToken();
            if (keyToken.type !== 'string') {
                throw new Error('Object keys must be strings');
            }
            const colon: JsonToken = this.tokenizer.nextToken();
            if (colon.type !== 'colon') {
                throw new Error('Expected colon after object key');
            }
            const value: unknown = this.parseValue();
            result[keyToken.value] = value;
            const delimiter: JsonToken = this.tokenizer.nextToken();
            if (delimiter.type === 'braceClose') {
                break;
            }
            if (delimiter.type !== 'comma') {
                throw new Error('Expected comma between object members');
            }
        }
        return result;
    }

    private parseArray(): Array<unknown> {
        const result: Array<unknown> = [];
        const next: JsonToken = this.tokenizer.peekToken();
        if (next.type === 'bracketClose') {
            this.tokenizer.nextToken();
            return result;
        }
        while (true) {
            result.push(this.parseValue());
            const delimiter: JsonToken = this.tokenizer.nextToken();
            if (delimiter.type === 'bracketClose') {
                break;
            }
            if (delimiter.type !== 'comma') {
                throw new Error('Expected comma between array items');
            }
        }
        return result;
    }

    private toEvent(payload: Record<string, unknown>): JsonNodeEvent {
        const type: string = this.requireString(payload, 'type');
        switch (type) {
            case 'startDocument':
                return { type: 'startDocument' };
            case 'endDocument':
                return { type: 'endDocument' };
            case 'xmlDeclaration':
                return {
                    type: 'xmlDeclaration',
                    version: this.requireString(payload, 'version'),
                    encoding: this.requireString(payload, 'encoding'),
                    standalone: this.optionalString(payload, 'standalone')
                };
            case 'startElement':
                return {
                    type: 'startElement',
                    name: this.requireString(payload, 'name'),
                    attributes: this.readAttributes(payload.attributes)
                };
            case 'endElement':
                return {
                    type: 'endElement',
                    name: this.requireString(payload, 'name')
                };
            case 'characters':
                return {
                    type: 'characters',
                    value: this.requireString(payload, 'value')
                };
            case 'ignorableWhitespace':
                return {
                    type: 'ignorableWhitespace',
                    value: this.requireString(payload, 'value')
                };
            case 'comment':
                return {
                    type: 'comment',
                    value: this.requireString(payload, 'value')
                };
            case 'processingInstruction':
                return {
                    type: 'processingInstruction',
                    target: this.requireString(payload, 'target'),
                    data: this.requireString(payload, 'data')
                };
            case 'startCDATA':
                return { type: 'startCDATA' };
            case 'endCDATA':
                return { type: 'endCDATA' };
            case 'startDTD':
                return {
                    type: 'startDTD',
                    name: this.requireString(payload, 'name'),
                    publicId: this.optionalString(payload, 'publicId') ?? '',
                    systemId: this.optionalString(payload, 'systemId') ?? ''
                };
            case 'internalSubset':
                return {
                    type: 'internalSubset',
                    declaration: this.requireString(payload, 'declaration')
                };
            case 'endDTD':
                return { type: 'endDTD' };
            case 'skippedEntity':
                return {
                    type: 'skippedEntity',
                    name: this.requireString(payload, 'name')
                };
            default:
                throw new Error('Unsupported JSON event type: ' + type);
        }
    }

    private readAttributes(source: unknown): Array<JsonAttributeDescriptor> {
        if (source === undefined) {
            return [];
        }
        if (!Array.isArray(source)) {
            throw new Error('Attributes must be an array');
        }
        return source.map((item: unknown) => {
            if (item === null || typeof item !== 'object') {
                throw new Error('Attribute entries must be objects');
            }
            const record: Record<string, unknown> = item as Record<string, unknown>;
            const name: string = this.requireString(record, 'name');
            const value: string = this.requireString(record, 'value');
            return { name, value };
        });
    }

    private requireString(record: Record<string, unknown>, key: string): string {
        const value: unknown = record[key];
        if (typeof value === 'string') {
            return value;
        }
        throw new Error('Expected string value for property "' + key + '"');
    }

    private optionalString(record: Record<string, unknown>, key: string): string | undefined {
        const value: unknown = record[key];
        if (value === undefined) {
            return undefined;
        }
        if (typeof value === 'string') {
            return value;
        }
        throw new Error('Expected string value for property "' + key + '"');
    }
}
