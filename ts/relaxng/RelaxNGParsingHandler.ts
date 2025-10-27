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

import { ContentHandler } from '../ContentHandler';
import { XMLElement } from '../XMLElement';
import { XMLAttribute } from '../XMLAttribute';
import { XMLComment } from '../XMLComment';
import { TextNode } from '../TextNode';
import { Catalog } from '../Catalog';
import { GrammarHandler } from '../grammar/GrammarHandler';
import { RelaxNGParser } from './RelaxNGParser';
import { RelaxNGGrammar } from './RelaxNGGrammar';
import { RelaxNGPattern } from './RelaxNGPattern';

export class RelaxNGParsingHandler implements ContentHandler {
    private parser: RelaxNGParser;
    private elementStack: XMLElement[] = [];
    private currentElement: XMLElement | null = null;
    private grammar: RelaxNGGrammar | null = null;
    private textBuffer: string = '';
    private catalog: Catalog | null = null;
    private validating: boolean = false;
    private includeDefaultAttributes: boolean = false;
    private grammarHandler: GrammarHandler | null = null;

    constructor(parser: RelaxNGParser) {
        this.parser = parser;
    }

    initialize(): void {
        this.elementStack = [];
        this.currentElement = null;
        this.grammar = null;
        this.textBuffer = '';
    }

    setCatalog(catalog: Catalog): void {
        this.catalog = catalog;
    }

    setValidating(validating: boolean): void {
        this.validating = validating;
    }

    setIncludeDefaultAttributes(include: boolean): void {
        this.includeDefaultAttributes = include;
    }

    setGrammarHandler(grammarHandler: GrammarHandler): void {
        this.grammarHandler = grammarHandler;
    }

    startDocument(): void {
        this.elementStack = [];
        this.currentElement = null;
        this.grammar = null;
        this.textBuffer = '';
    }

    endDocument(): void {
        // Finalize the grammar if we have one
        if (this.grammar && this.currentElement) {
            try {
                // Store the grammar for retrieval
                this.finalizeGrammar();
            } catch (error) {
                console.warn('Failed to finalize RelaxNG grammar:', error);
            }
        }
    }

    xmlDeclaration(version: string, encoding: string, standalone: string | undefined): void {
        // XML declaration is not particularly relevant for RelaxNG parsing
    }

    startElement(name: string, atts: Array<XMLAttribute>): void {
        // Flush any accumulated text
        this.flushText();

        // Create XMLElement for this element
        const element = new XMLElement(name);
        
        // Add attributes
        for (const attribute of atts) {
            element.setAttribute(attribute);
        }

        // Set parent relationship
        if (this.currentElement) {
            this.currentElement.addElement(element);
            this.elementStack.push(this.currentElement);
        } else {
            // This is the root element - should be 'grammar' for RelaxNG
            if (name === 'grammar') {
                this.grammar = new RelaxNGGrammar();
            }
        }

        this.currentElement = element;
        this.textBuffer = '';
    }

    endElement(name: string): void {
        // Flush any accumulated text
        this.flushText();

        if (this.currentElement) {
            // Process the completed element
            this.processElement(this.currentElement);

            // Pop back to parent
            if (this.elementStack.length > 0) {
                this.currentElement = this.elementStack.pop()!;
            } else {
                // This was the root element
                if (name === 'grammar' && this.grammar) {
                    this.finalizeGrammar();
                }
                this.currentElement = null;
            }
        }

        this.textBuffer = '';
    }

    internalSubset(declaration: string): void {
        // RelaxNG doesn't use DTD internal subsets
    }

    characters(text: string): void {
        this.textBuffer += text;
    }

    ignorableWhitespace(whitespace: string): void {
        // For RelaxNG parsing, we typically ignore whitespace between elements
        // but preserve it within text content
        if (this.currentElement) {
            this.textBuffer += whitespace;
        }
    }

    processingInstruction(target: string, data: string): void {
        // RelaxNG schemas don't typically use processing instructions
        // but we'll store them for completeness
    }

    comment(text: string): void {
        // Comments in RelaxNG schemas are preserved for documentation
        if (this.currentElement) {
            const comment = new XMLComment(text);
            this.currentElement.addComment(comment);
        }
    }

    startCDATA(): void {
        // CDATA is treated as regular text in RelaxNG
    }

    endCDATA(): void {
        // CDATA is treated as regular text in RelaxNG
    }

    startDTD(name: string, publicId: string, systemId: string): void {
        // RelaxNG doesn't use DTDs
    }

    endDTD(): void {
        // RelaxNG doesn't use DTDs
    }

    skippedEntity(name: string): void {
        // Entity references should be resolved by the parser
        this.textBuffer += `&${name};`;
    }

    private flushText(): void {
        if (this.textBuffer.trim() !== '' && this.currentElement) {
            const textNode = new TextNode(this.textBuffer);
            this.currentElement.addTextNode(textNode);
        }
        this.textBuffer = '';
    }

    private processElement(element: XMLElement): void {
        if (!this.grammar) {
            return;
        }

        try {
            // Convert the XMLElement to a RelaxNG pattern using the parser
            const pattern = this.parser.parseElement(element);
            
            if (pattern) {
                // Add the pattern to the grammar based on element type
                this.addPatternToGrammar(pattern);
            }
        } catch (error) {
            console.warn(`Failed to process RelaxNG element '${element.getName()}':`, error);
        }
    }

    private addPatternToGrammar(pattern: RelaxNGPattern): void {
        if (!this.grammar) {
            return;
        }

        // Add pattern to grammar based on its type
        switch (pattern.getType()) {
            case 'start':
                this.grammar.setStartPattern(pattern);
                break;
            case 'define':
                const refName = pattern.getRefName();
                if (refName) {
                    this.grammar.addDefinition(refName, pattern);
                }
                break;
            default:
                // Other patterns are part of the structure
                break;
        }
    }

    private finalizeGrammar(): void {
        if (!this.grammar) {
            return;
        }

        try {
            // Validate and finalize the grammar
            this.grammar.validate();
        } catch (error) {
            console.warn('Failed to finalize RelaxNG grammar:', error);
        }
    }

    getGrammar(): RelaxNGGrammar | null {
        return this.grammar;
    }

    reset(): void {
        this.elementStack = [];
        this.currentElement = null;
        this.grammar = null;
        this.textBuffer = '';
    }

    setDocumentLocator(locator: any): void {
        // Document locator can be used for error reporting with line/column info
        // For now, we'll store it for potential future use
    }

    startPrefixMapping(prefix: string, uri: string): void {
        // Handle namespace prefix mappings for RelaxNG parsing
        // Store in grammar if available
        if (this.grammar) {
            this.grammar.addNamespaceMapping(prefix, uri);
        }
    }

    endPrefixMapping(prefix: string): void {
        // Clean up namespace prefix mappings
        if (this.grammar) {
            this.grammar.removeNamespaceMapping(prefix);
        }
    }
}