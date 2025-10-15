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

export class XMLCanonicalizer {

    public static canonicalize(document: XMLDocument): string {
        const canonicalizer = new XMLCanonicalizer();
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
        return text
            .replace(/\r\n/g, '\n')    // Normalize Windows line endings first
            .replace(/\r/g, '\n')      // Normalize Mac line endings
            .replace(/&/g, '&amp;')    // & must be after line ending normalization
            .replace(/</g, '&lt;')     // <
            .replace(/>/g, '&gt;')     // >
            .replace(/"/g, '&quot;')   // double quote (for canonical form)
            .replace(/\t/g, '&#9;')    // tab
            .replace(/\n/g, '&#10;');  // newline (now normalized)
    }

    private escapeAttributeValue(value: string): string {
        return value
            .replace(/&/g, '&amp;')    // & 
            .replace(/</g, '&lt;')     // <
            .replace(/>/g, '&gt;')     // >
            .replace(/"/g, '&quot;')   // double quote
            .replace(/\t/g, '&#9;')    // tab (should be rare after normalization)
            .replace(/\n/g, '&#10;')   // newline (should be rare after normalization) 
            .replace(/\r/g, '&#13;');  // carriage return (should be rare after normalization)
    }
}