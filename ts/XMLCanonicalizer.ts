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

import { Constants } from "./Constants";
import { ProcessingInstruction } from "./ProcessingInstruction";
import { TextNode } from "./TextNode";
import { XMLAttribute } from "./XMLAttribute";
import { XMLDocument } from "./XMLDocument";
import { XMLElement } from "./XMLElement";
import { CData } from "./CData";
import { Grammar } from "./grammar/Grammar";

export class XMLCanonicalizer {

    private grammar: Grammar | undefined;

    public static canonicalize(document: XMLDocument, grammar?: Grammar): string {
        const canonicalizer = new XMLCanonicalizer();
        if (grammar) {
            canonicalizer.grammar = grammar;
        } else if (document.getGrammar) {
            canonicalizer.grammar = document.getGrammar();
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
        const attributes: XMLAttribute[] = this.getSortedAttributes(element);
        for (const attr of attributes) {
            const lexicalValue: string | undefined = attr.getLexicalValue();
            if (lexicalValue !== undefined) {
                const preserveLexical: boolean = attr.isSpecified()
                    ? this.shouldPreserveAttributeLexicalValue(lexicalValue)
                    : this.shouldPreserveDefaultAttributeLexicalValue(lexicalValue);
                if (preserveLexical) {
                    result += ' ' + attr.getName() + '="' + lexicalValue + '"';
                    continue;
                }
            }
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
        let result = '';
        for (let i = 0; i < text.length; i++) {
            const char = text.charAt(i);
            switch (char) {
                case '&': result += '&amp;'; break;
                case '<': result += '&lt;'; break;
                case '>': result += '&gt;'; break;
                case '\t': result += '&#9;'; break;
                case '\n': result += '&#10;'; break;
                case '\r': result += '&#13;'; break;
                case '"': result += '&quot;'; break;
                default: result += char; break;
            }
        }
        return result;
    }

    private escapeAttributeValue(value: string): string {
        let result = '';
        for (let i = 0; i < value.length; i++) {
            const char = value.charAt(i);
            switch (char) {
                case '&': result += '&amp;'; break;
                case '<': result += '&lt;'; break;
                case '>': result += '&gt;'; break;
                case '"': result += '&quot;'; break;
                case '\t': result += '&#9;'; break;
                case '\n': result += '&#10;'; break;
                case '\r': result += '&#13;'; break;
                default: result += char; break;
            }
        }
        return result;
    }

    private shouldPreserveAttributeLexicalValue(lexicalValue: string): boolean {
        return lexicalValue.includes('&#');
    }

    private shouldPreserveDefaultAttributeLexicalValue(lexicalValue: string): boolean {
        // Preserve lexical form for default attributes when they rely on entity or parameter references.
        return lexicalValue.includes('&#') || lexicalValue.includes('&') || lexicalValue.includes('%');
    }
}