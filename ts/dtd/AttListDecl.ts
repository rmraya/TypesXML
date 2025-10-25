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
        let parts: string[] = this.split(text);
        let index: number = 0;
        while (index < parts.length) {
            let name: string = parts[index++];

            // Validate attribute name
            if (!XMLUtils.isValidXMLName(name)) {
                throw new Error(`Invalid attribute name in ATTLIST declaration: "${name}"`);
            }

            let attType: string = parts[index++];
            let defaultDecl: string = '';
            let defaultValue: string = '';

            if (AttListDecl.attTypes.includes(attType)) {
                // Standard attribute type
                if (index < parts.length) {
                    let nextPart = parts[index++];
                    if (nextPart === '#REQUIRED' || nextPart === '#IMPLIED') {
                        defaultDecl = nextPart;
                    } else if (nextPart === '#FIXED') {
                        defaultDecl = nextPart;
                        if (index < parts.length) {
                            defaultValue = parts[index++];
                            if (defaultValue.startsWith('"') && defaultValue.endsWith('"')) {
                                defaultValue = defaultValue.substring(1, defaultValue.length - 1);
                            }
                        }
                    } else if (nextPart && nextPart.startsWith('"') && nextPart.endsWith('"')) {
                        // Direct default value
                        defaultDecl = nextPart;
                        defaultValue = nextPart.substring(1, nextPart.length - 1); // Remove quotes
                    } else {
                        // Invalid: unquoted default value
                        throw new Error(`Invalid attribute declaration: default value "${nextPart}" must be quoted`);
                    }
                }
            } else {
                if (attType === 'NOTATION') {
                    // Parse the notations in the enumeration that follows
                    if (index < parts.length) {
                        let notations = parts[index++]; // This should be like "(notation1|notation2|notation3)"
                        attType = 'NOTATION ' + notations; // Store the full notation enumeration as the type
                        if (index < parts.length) {
                            let nextPart = parts[index++];
                            if (nextPart === '#REQUIRED' || nextPart === '#IMPLIED') {
                                defaultDecl = nextPart;
                            } else if (nextPart === '#FIXED') {
                                defaultDecl = nextPart;
                                if (index < parts.length) {
                                    defaultValue = parts[index++];
                                    if (defaultValue.startsWith('"') && defaultValue.endsWith('"')) {
                                        defaultValue = defaultValue.substring(1, defaultValue.length - 1);
                                    }
                                }
                            } else if (nextPart && nextPart.startsWith('"') && nextPart.endsWith('"')) {
                                // Direct default value
                                defaultDecl = nextPart;
                                defaultValue = nextPart.substring(1, nextPart.length - 1); // Remove quotes
                            } else {
                                defaultDecl = nextPart || '';
                            }
                        }
                    }
                } else {
                    // Handle other enumeration types (values in parentheses)
                    if (index < parts.length) {
                        let nextPart = parts[index++];
                        if (nextPart === '#REQUIRED' || nextPart === '#IMPLIED') {
                            defaultDecl = nextPart;
                        } else if (nextPart === '#FIXED') {
                            defaultDecl = nextPart;
                            if (index < parts.length) {
                                defaultValue = parts[index++];
                                if (defaultValue.startsWith('"') && defaultValue.endsWith('"')) {
                                    defaultValue = defaultValue.substring(1, defaultValue.length - 1);
                                }
                            }
                        } else if (nextPart && nextPart.startsWith('"') && nextPart.endsWith('"')) {
                            // Direct default value
                            defaultDecl = nextPart;
                            defaultValue = nextPart.substring(1, nextPart.length - 1); // Remove quotes
                        } else {
                            defaultDecl = nextPart || '';
                        }
                    }
                }
            }
            let att: AttDecl = new AttDecl(name, attType, defaultDecl, defaultValue);
            this.attributes.set(name, att);
        }
    }

    split(text: string): string[] {
        let result: string[] = [];
        let word: string = '';
        let inQuotes: boolean = false;

        for (let i: number = 0; i < text.length; i++) {
            let c: string = text.charAt(i);

            if (c === '"' && !inQuotes) {
                // Start of quoted string
                inQuotes = true;
                word += c;
            } else if (c === '"' && inQuotes) {
                // End of quoted string
                inQuotes = false;
                word += c;
                // Complete the quoted word
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