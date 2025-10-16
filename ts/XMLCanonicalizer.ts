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

import { Constants } from "./Constants";
import { ProcessingInstruction } from "./ProcessingInstruction";
import { TextNode } from "./TextNode";
import { XMLAttribute } from "./XMLAttribute";
import { XMLDocument } from "./XMLDocument";
import { XMLElement } from "./XMLElement";
import { CData } from "./CData";
import { DTDGrammar } from "./dtd/DTDGrammar";

export class XMLCanonicalizer {

    private grammar: DTDGrammar | undefined;

    public static canonicalize(document: XMLDocument, grammar?: DTDGrammar): string {
        const canonicalizer = new XMLCanonicalizer();
        if (grammar) {
            canonicalizer.grammar = grammar;
        }
        return canonicalizer.canonicalizeDocument(document);
    }

    private canonicalizeDocument(document: XMLDocument): string {
        let result = '';
        
        // Process any processing instructions before the root element
        const children = document.contentIterator();
        let foundRoot = false;
        
        for (const child of children) {
            if (child instanceof ProcessingInstruction && !foundRoot) {
                result += this.canonicalizeProcessingInstruction(child);
            } else if (child instanceof XMLElement) {
                result += this.canonicalizeElement(child);
                foundRoot = true;
            }
        }
        
        // Process any processing instructions after the root element
        const childrenAfter = document.contentIterator();
        foundRoot = false;
        for (const child of childrenAfter) {
            if (child instanceof XMLElement) {
                foundRoot = true;
                continue;
            }
            if (foundRoot && child instanceof ProcessingInstruction) {
                result += this.canonicalizeProcessingInstruction(child);
            }
        }
        
        return result;
    }

    private canonicalizeElement(element: XMLElement): string {
        let result = '';
        
        // Start tag
        result += '<' + element.getName();
        
        // Attributes in lexicographical order
        const attributes = this.getSortedAttributes(element);
        for (const attr of attributes) {
            result += ' ' + attr.getName() + '="' + this.escapeAttributeValue(attr.getValue()) + '"';
        }
        
        result += '>';
        
        // Content
        const children = element.getContent();
        for (const child of children) {
            if (child instanceof XMLElement) {
                result += this.canonicalizeElement(child);
            } else if (child.getNodeType() === Constants.TEXT_NODE) {
                const textNode = child as TextNode;
                result += this.escapeCharacterData(textNode.getValue());
            } else if (child.getNodeType() === Constants.CDATA_SECTION_NODE) {
                // CDATA sections are treated as character data in canonical XML
                const cdataNode = child as CData;
                result += this.escapeCharacterData(cdataNode.getValue());
            } else if (child.getNodeType() === Constants.PROCESSING_INSTRUCTION_NODE) {
                const pi = child as ProcessingInstruction;
                result += this.canonicalizeProcessingInstruction(pi);
            }
            // Comments are omitted in canonical XML
        }
        
        // End tag
        result += '</' + element.getName() + '>';
        
        return result;
    }

    private canonicalizeProcessingInstruction(pi: ProcessingInstruction): string {
        const target = pi.getTarget();
        const data = pi.getData();
        
        // According to canonical XML spec, PI should always have a space before ?> if there's no data
        if (!data || data.trim() === '') {
            return '<?' + target + ' ?>';
        } else {
            return '<?' + target + ' ' + data + '?>';
        }
    }

    private getSortedAttributes(element: XMLElement): XMLAttribute[] {
        const attributes = element.getAttributes();
        
        // Sort attributes lexicographically by name (Unicode code point order)
        return attributes.sort((a, b) => {
            const nameA = a.getName();
            const nameB = b.getName();
            
            // Compare character by character using Unicode code points
            for (let i = 0; i < Math.min(nameA.length, nameB.length); i++) {
                const codeA = nameA.charCodeAt(i);
                const codeB = nameB.charCodeAt(i);
                if (codeA !== codeB) {
                    return codeA - codeB;
                }
            }
            
            // If one name is a prefix of the other, shorter comes first
            return nameA.length - nameB.length;
        });
    }

    private escapeCharacterData(text: string): string {
        // Avoid double-escaping by preserving existing valid entity references
        let result = '';
        let i = 0;
        
        while (i < text.length) {
            if (text.charAt(i) === '&') {
                // Check if this starts a valid entity reference
                const remainingText = text.substring(i);
                const entityMatch = remainingText.match(/^&(amp|lt|gt|quot|apos);/);
                
                if (entityMatch) {
                    // This is already a valid entity reference, preserve it
                    result += entityMatch[0];
                    i += entityMatch[0].length;
                    continue;
                }
            }
            
            // Regular character escaping
            const char = text.charAt(i);
            switch (char) {
                case '&':
                    result += '&amp;';
                    break;
                case '<':
                    result += '&lt;';
                    break;
                case '>':
                    result += '&gt;';
                    break;
                case '\r':
                    if (i + 1 < text.length && text.charAt(i + 1) === '\n') {
                        // CRLF sequence
                        result += '&#13;&#10;';
                        i++; // Skip the \n
                    } else {
                        result += '&#13;';
                    }
                    break;
                case '\n':
                    result += '&#10;';
                    break;
                default:
                    result += char;
                    break;
            }
            i++;
        }
        
        return result;
    }

    private escapeAttributeValue(value: string): string {
        let result = '';
        
        for (let i = 0; i < value.length; i++) {
            const char = value.charAt(i);
            
            // First priority: Check if this character has an original entity reference form from parsing
            if (this.grammar && this.grammar.getOriginalEntityReference(char)) {
                result += this.grammar.getOriginalEntityReference(char);
                continue;
            }
            
            // Second priority: Standard XML escaping for canonical form
            switch (char) {
                case '&':
                    result += '&amp;';
                    break;
                case '<':
                    result += '&lt;';
                    break;
                case '>':
                    result += '&gt;';
                    break;
                case '"':
                    result += '&quot;';
                    break;
                case '\t':
                    result += ' ';  // tab → space for canonical form
                    break;
                case '\n':
                    result += '&#10;';  // newline
                    break;
                case '\r':
                    result += '&#13;';  // carriage return
                    break;
                default:
                    result += char;
                    break;
            }
        }
        
        return result;
    }
}