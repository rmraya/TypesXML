/*******************************************************************************
 * Copyright (c) 2023-2025 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

import { Constants } from "../Constants";
import { XMLNode } from "../XMLNode";
import { XMLUtils } from "../XMLUtils";
import { AttDecl } from "./AttDecl";

export class AttListDecl implements XMLNode {

    private name: string;
    private attributes: Map<string, AttDecl>;

    static readonly attTypes: string[] = ['CDATA', 'ID', 'IDREF', 'IDREFS', 'ENTITY', 'ENTITIES', 'NMTOKEN', 'NMTOKENS'];

    constructor(name: string, attributesText: string) {
        this.name = name;
        this.attributes = new Map<string, AttDecl>();
        this.parseAttributes(attributesText);
    }

    getName(): string {
        return this.name;
    }

    getAttributes(): Map<string, AttDecl> {
        return this.attributes;
    }

    parseAttributes(text: string) {
        const parts: string[] = this.split(text);
        const state = { index: 0 };

        while (state.index < parts.length) {
            const name: string = parts[state.index++];
            if (!name) {
                continue;
            }

            if (!XMLUtils.isValidXMLName(name)) {
                throw new Error(`Invalid attribute name in ATTLIST declaration: "${name}"`);
            }

            if (state.index >= parts.length) {
                throw new Error(`Missing attribute type for attribute "${name}"`);
            }

            let attType: string = this.readAttributeType(parts, state);
            let defaultDecl: string = '';
            let defaultValue: string = '';

            if (state.index < parts.length) {
                const nextPart = parts[state.index];
                if (nextPart === '#REQUIRED' || nextPart === '#IMPLIED') {
                    defaultDecl = nextPart;
                    state.index++;
                } else if (nextPart === '#FIXED') {
                    defaultDecl = nextPart;
                    state.index++;
                    if (state.index < parts.length) {
                        const valueToken = parts[state.index++];
                        if (this.isQuotedValue(valueToken)) {
                            defaultValue = this.trimQuotes(valueToken);
                        } else {
                            defaultValue = valueToken;
                        }
                    }
                } else if (nextPart && this.isQuotedValue(nextPart)) {
                    defaultDecl = nextPart;
                    defaultValue = this.trimQuotes(nextPart);
                    state.index++;
                } else if (nextPart) {
                    throw new Error(`Invalid attribute declaration: default value "${nextPart}" must be quoted`);
                }
            }

            const att: AttDecl = new AttDecl(name, attType, defaultDecl, defaultValue);
            this.attributes.set(name, att);
        }
    }

    split(text: string): string[] {
        let result: string[] = [];
        let word: string = '';
        let inQuotes: boolean = false;
        let quoteChar: string = '';

        for (let i: number = 0; i < text.length; i++) {
            let c: string = text.charAt(i);

            if ((c === '"' || c === "'") && !inQuotes) {
                inQuotes = true;
                quoteChar = c;
                word += c;
            } else if (inQuotes && c === quoteChar) {
                inQuotes = false;
                quoteChar = '';
                word += c;
                if (word.length > 0) {
                    result.push(word);
                    word = '';
                }
            } else if ((c === ' ' || c === '\n' || c === '\r' || c === '\t') && !inQuotes) {
                // Whitespace outside quotes - split here
                if (word.length > 0) {
                    result.push(word);
                    word = '';
                }
            } else {
                // Regular character (including parentheses)
                word += c;
            }
        }

        if (word.length > 0) {
            result.push(word);
        }
        return result;
    }

    private readAttributeType(parts: string[], state: { index: number }): string {
        let token: string = parts[state.index++];

        if (token === 'NOTATION') {
            if (state.index >= parts.length) {
                throw new Error('Expected NOTATION enumeration in ATTLIST declaration');
            }
            let enumeration: string = parts[state.index++];
            enumeration = this.readParenthesized(enumeration, parts, state);
            return 'NOTATION ' + enumeration;
        }

        if (token.includes('(')) {
            return this.readParenthesized(token, parts, state);
        }

        return token;
    }

    private readParenthesized(initial: string, parts: string[], state: { index: number }): string {
        let result = initial;
        let balance: number = this.countParenthesis(initial);

        while (balance > 0) {
            if (state.index >= parts.length) {
                throw new Error('Unterminated parenthesized list in ATTLIST declaration');
            }
            const next: string = parts[state.index++];
            result += ' ' + next;
            balance += this.countParenthesis(next);
        }

        return this.normalizeEnumeration(result);
    }

    private countParenthesis(value: string): number {
        let balance: number = 0;
        for (const char of value) {
            if (char === '(') {
                balance++;
            } else if (char === ')') {
                balance--;
            }
        }
        return balance;
    }

    private normalizeEnumeration(value: string): string {
        let normalized = value.replace(/\s+/g, ' ');
        normalized = normalized.replace(/\s*\|\s*/g, '|');
        normalized = normalized.replace(/\(\s*/g, '(');
        normalized = normalized.replace(/\s*\)/g, ')');
        return normalized.trim();
    }

    private isQuotedValue(value: string): boolean {
        return (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"));
    }

    private trimQuotes(value: string): string {
        return this.isQuotedValue(value) ? value.substring(1, value.length - 1) : value;
    }

    getNodeType(): number {
        return Constants.ATTRIBUTE_LIST_DECL_NODE;
    }

    toString(): string {
        let result: string = '<!ATTLIST ' + this.name + '\n';
        this.attributes.forEach((a: AttDecl) => {
            result += ' ' + a.toString() + '\n';
        });
        return result + '>';
    }

    equals(node: XMLNode): boolean {
        if (node instanceof AttListDecl) {
            let nodeAtts: Map<string, AttDecl> = node.getAttributes();
            if (this.name !== node.getName() || this.attributes.size !== nodeAtts.size) {
                return false;
            }
            for (let [key, value] of this.attributes) {
                let att: AttDecl | undefined = nodeAtts.get(key);
                if (att === undefined) {
                    return false;
                }
                if (!value.equals(att)) {
                    return false;
                }
            }
            return true;
        }
        return false;
    }
}