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

import { CData } from "./CData";
import { Catalog } from "./Catalog";
import { ContentHandler } from "./ContentHandler";
import { ProcessingInstruction } from "./ProcessingInstruction";
import { TextNode } from "./TextNode";
import { XMLAttribute } from "./XMLAttribute";
import { XMLComment } from "./XMLComment";
import { XMLDeclaration } from "./XMLDeclaration";
import { XMLDocument } from "./XMLDocument";
import { XMLDocumentType } from "./XMLDocumentType";
import { XMLElement } from "./XMLElement";
import { XMLUtils } from "./XMLUtils";
import { AttDecl } from "./dtd/AttDecl";
import { AttListDecl } from "./dtd/AttListDecl";
import { DTDParser } from "./dtd/DTDParser";
import { Grammar } from "./grammar/Grammar";
import { GrammarHandler } from "./grammar/GrammarHandler";

export class DOMBuilder implements ContentHandler {

    inCdData: boolean = false;
    currentCData: CData = new CData('');
    document: XMLDocument | undefined;
    stack: Array<XMLElement> = [];
    catalog: Catalog | undefined;
    dtdParser: DTDParser | undefined;
    grammarHandler: GrammarHandler | undefined;
    grammarUrl: string | undefined;
    grammar: Grammar | undefined;
    validating: boolean = false;
    private includeDefaultAttributes: boolean = true;
    private declaredIds: Set<string> = new Set();
    private pendingIdrefs: string[] = [];
    private defaultAttributeLexicalCache: Map<string, Map<string, string>> = new Map();

    initialize(): void {
        this.document = new XMLDocument();
        this.stack = new Array();
        this.inCdData = false;
        this.declaredIds.clear();
        this.pendingIdrefs = [];
        this.defaultAttributeLexicalCache.clear();
        // Create initial GrammarHandler for this ContentHandler
        this.grammarHandler = new GrammarHandler();
    }

    setCatalog(catalog: Catalog): void {
        this.catalog = catalog;
    }

    setValidating(validating: boolean): void {
        this.validating = validating;
    }

    isValidating(): boolean {
        return this.validating;
    }

    setIncludeDefaultAttributes(include: boolean): void {
        this.includeDefaultAttributes = include;
    }

    setGrammarHandler(grammarHandler: GrammarHandler): void {
        this.grammarHandler = grammarHandler;
        // Get the current grammar from the handler
        this.grammar = this.grammarHandler.getGrammar();
    }

    private addDefaultAttributes(elementName: string, element: XMLElement): void {
        if (!this.grammar) {
            return;
        }

        const defaultAttrs = this.grammar.getDefaultAttributes(elementName);
        if (!defaultAttrs || defaultAttrs.size === 0) {
            return;
        }

        const existingAttNames = new Set<string>();
        const attributes = element.getAttributes();
        if (attributes) {
            attributes.forEach((att: XMLAttribute) => existingAttNames.add(att.getName()));
        }

        defaultAttrs.forEach((defaultValue: string, attName: string) => {
            if (existingAttNames.has(attName)) {
                const existingAttr: XMLAttribute | undefined = element.getAttribute(attName);
                if (existingAttr && !existingAttr.isSpecified() && existingAttr.getLexicalValue() === undefined) {
                    const lexicalValueExisting: string = this.getDefaultAttributeLexical(elementName, attName) ?? defaultValue;
                    existingAttr.setLexicalValue(lexicalValueExisting);
                }
                return;
            }
            const lexicalValue: string = this.getDefaultAttributeLexical(elementName, attName) ?? defaultValue;
            const defaultAttr: XMLAttribute = new XMLAttribute(attName, defaultValue, false, lexicalValue);
            element.setAttribute(defaultAttr);
        });
    }

    private getDefaultAttributeLexical(elementName: string, attributeName: string): string | undefined {
        // Check cache first
        const cachedForElement: Map<string, string> | undefined = this.defaultAttributeLexicalCache.get(elementName);
        if (cachedForElement && cachedForElement.has(attributeName)) {
            return cachedForElement.get(attributeName);
        }

        const docType: XMLDocumentType | undefined = this.document?.getDocumentType();
        const internalSubset: string | undefined = docType?.getInternalSubset();
        if (!internalSubset) {
            return undefined;
        }

            const attlistPattern: RegExp = new RegExp(String.raw`<!ATTLIST\s+${this.escapeRegExp(elementName)}\b([\s\S]*?)>`, 'g');
        let lexicalMapForElement: Map<string, string> | undefined = cachedForElement ?? new Map<string, string>();
        let match: RegExpExecArray | null;

        while ((match = attlistPattern.exec(internalSubset)) !== null) {
            const attributesText: string = match[1];
            try {
                const attList: AttListDecl = new AttListDecl(elementName, attributesText.trim());
                attList.getAttributes().forEach((attDecl: AttDecl, name: string) => {
                    const defaultValue: string = attDecl.getDefaultValue();
                    if (defaultValue && !lexicalMapForElement?.has(name)) {
                        lexicalMapForElement?.set(name, defaultValue);
                    }
                });
            } catch (error) {
                // Ignore parsing issues for malformed attlist fragments in internal subset
            }
        }

        if (!this.defaultAttributeLexicalCache.has(elementName) && lexicalMapForElement.size > 0) {
            this.defaultAttributeLexicalCache.set(elementName, lexicalMapForElement);
        }

        return lexicalMapForElement.get(attributeName);
    }

    private escapeRegExp(value: string): string {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    private trackIdAttributes(elementName: string, element: XMLElement): void {
        if (!this.validating || !this.grammar) {
            return;
        }

        const attDecls = this.grammar.getElementAttributes(elementName);
        if (!attDecls || attDecls.size === 0) {
            return;
        }

        element.getAttributes().forEach(attr => {
            const attName = attr.getName();
            const attValue = attr.getValue();
            const attInfo = attDecls.get(attName);

            if (attInfo && attInfo.datatype) {
                // ID uniqueness validation
                if (attInfo.datatype === 'ID') {
                    if (this.declaredIds.has(attValue)) {
                        throw new Error(`Duplicate ID value '${attValue}' found in element '${elementName}'`);
                    }
                    this.declaredIds.add(attValue);
                }

                // Collect IDREF values for later validation (only if not already declared)
                if (attInfo.datatype === 'IDREF') {
                    if (!this.declaredIds.has(attValue)) {
                        this.pendingIdrefs.push(attValue);
                    }
                } else if (attInfo.datatype === 'IDREFS') {
                    const idrefs = attValue.split(/\s+/);
                    idrefs.forEach(idref => {
                        if (!this.declaredIds.has(idref)) {
                            this.pendingIdrefs.push(idref);
                        }
                    });
                }
            }
        });
    }

    private validateIdReferences(): void {
        if (!this.validating) {
            return;
        }

        for (const idref of this.pendingIdrefs) {
            if (!this.declaredIds.has(idref)) {
                throw new Error(`IDREF '${idref}' does not reference any declared ID`);
            }
        }
    }

    setDTDParser(dtdParser: DTDParser): void {
        this.dtdParser = dtdParser;
    }

    getDocument(): XMLDocument | undefined {
        return this.document;
    }

    startDocument(): void {
    }

    endDocument(): void {
        this.validateIdReferences();
        if (this.document && this.grammarHandler) {
            this.document.setGrammar(this.grammarHandler.getGrammar());
        }
    }

    xmlDeclaration(version: string, encoding: string, standalone: string): void {
        let xmlDclaration = new XMLDeclaration(version, encoding, standalone);
        this.document?.setXmlDeclaration(xmlDclaration);
    }

    startElement(name: string, atts: XMLAttribute[]): void {
        let element: XMLElement = new XMLElement(name);
        atts.forEach((att: XMLAttribute) => {
            element.setAttribute(att);
            if (!att.isSpecified() && att.getLexicalValue() === undefined) {
                const lexicalDefault: string | undefined = this.getDefaultAttributeLexical(name, att.getName());
                if (lexicalDefault !== undefined) {
                    att.setLexicalValue(lexicalDefault);
                }
            }
        });

        // Add default attributes when includeDefaultAttributes flag is set
        if (this.includeDefaultAttributes) {
            this.addDefaultAttributes(name, element);
        }

        // Track ID/IDREF attributes for validation
        this.trackIdAttributes(name, element);

        if (this.stack.length === 0) {
            this.document?.setRoot(element);
        } else {
            this.stack[this.stack.length - 1].addElement(element);
        }
        this.stack.push(element);
    }

    endElement(name: string): void {
        XMLUtils.ignoreUnused(name);
        this.stack.pop();
    }

    internalSubset(declaration: string): void {
        let docType: XMLDocumentType | undefined = this.document?.getDocumentType();
        if (docType) {
            docType.setInternalSubset(declaration);
            // DOMBuilder does not process DTD - it just stores DTD info in document structure
        }
    }

    characters(ch: string): void {
        if (this.inCdData) {
            this.currentCData.setValue(this.currentCData.getValue() + ch);
            return;
        }
        let textNode: TextNode = new TextNode(ch);
        if (this.stack.length > 0) {
            this.stack[this.stack.length - 1].addTextNode(textNode);
        } else {
            this.document?.addTextNode(textNode);
        }
    }

    ignorableWhitespace(ch: string): void {
        let textNode: TextNode = new TextNode(ch);
        if (this.stack.length > 0) {
            this.stack[this.stack.length - 1].addTextNode(textNode);
        } else {
            this.document?.addTextNode(textNode);
        }
    }

    comment(ch: string): void {
        let comment: XMLComment = new XMLComment(ch);
        if (this.stack.length > 0) {
            this.stack[this.stack.length - 1].addComment(comment);
        } else {
            this.document?.addComment(comment);
        }
    }

    processingInstruction(target: string, data: string): void {
        let pi = new ProcessingInstruction(target, data);
        if (this.stack.length > 0) {
            this.stack[this.stack.length - 1].addProcessingInstruction(pi);
        } else {
            this.document?.addProcessingInstruction(pi);
        }
        if (target === 'xml-model' && this.catalog) {
            // TODO: Implement xml-model processing for different schema types
            // This will support XML Schema (.xsd), RelaxNG (.rng), and other schema formats
            // based on the schematypens attribute:
            // - http://www.w3.org/2001/XMLSchema for XML Schema
            // - http://relaxng.org/ns/structure/1.0 for RelaxNG
            /*
            let atts: Map<string, string> = this.parseXmlModel(data);
            let href: string = atts.get('href');
            let schematypens: string = atts.get('schematypens');
            
            // Future implementation would create appropriate parser based on schematypens:
            // if (schematypens === 'http://www.w3.org/2001/XMLSchema') {
            //     // Create XML Schema parser
            // } else if (schematypens === 'http://relaxng.org/ns/structure/1.0') {
            //     // Create RelaxNG parser
            // }
            */
        }
    }

    parseXmlModel(text: string): Map<string, string> {
        let map = new Map<string, string>();
        let pairs: string[] = [];
        let separator: string = '';
        while (text.indexOf('=') != -1) {
            let i: number = 0;
            for (; i < text.length; i++) {
                let char = text[i];
                if (XMLUtils.isXmlSpace(char) || '=' === char) {
                    break;
                }
            }
            for (; i < text.length; i++) {
                let char = text[i];
                if (separator === '' && ('\'' === char || '"' === char)) {
                    separator = char;
                    continue;
                }
                if (char === separator) {
                    break;
                }
            }
            // end of value
            let pair = text.substring(0, i + 1).trim();
            pairs.push(pair);
            text = text.substring(pair.length).trim();
            separator = '';
        }
        pairs.forEach((pair: string) => {
            let index = pair.indexOf('=');
            if (index === -1) {
                throw new Error('Malformed attributes list');
            }
            let name = pair.substring(0, index).trim();
            let value = pair.substring(index + 2, pair.length - 1);
            map.set(name, value);
        });
        return map;
    }

    startCDATA(): void {
        this.currentCData = new CData('');
        this.inCdData = true;
    }

    endCDATA(): void {
        if (this.stack.length > 0) {
            this.stack[this.stack.length - 1].addCData(this.currentCData);
        } else {
            throw new Error("CData section outside of root element");
        }
        this.inCdData = false;
    }

    startDTD(name: string, publicId: string, systemId: string): void {
        const docType = new XMLDocumentType(name, publicId, systemId);
        this.document?.setDocumentType(docType);
        // DOMBuilder tells GrammarHandler to start DTD processing
        if (this.grammarHandler) {
            this.grammarHandler.startDTDProcessing(name, publicId, systemId);
            const newGrammar = this.grammarHandler.getGrammar();
            this.grammar = newGrammar;
        }
    }

    endDTD(): void {
        // DOMBuilder delegates DTD processing to its GrammarHandler
        // Update grammar reference to get the newly created DTDComposite
        if (this.grammarHandler) {
            const newGrammar = this.grammarHandler.getGrammar();
            this.grammar = newGrammar;
        }
    }

    skippedEntity(name: string): void {
        if (this.validating) {
            // XML 1.0 spec section 5.1: In validating mode, undeclared entity references are fatal errors
            throw new Error(`Undeclared entity reference: '${name}'. Validating parsers must report this as a fatal error.`);
        } else {
            // XML 1.0 spec section 4.4.3: In non-validating mode, skip the entity and optionally report it
            // We preserve the original entity reference in the DOM to maintain document fidelity
            let entityRefText: string = '&' + name + ';';
            let textNode: TextNode = new TextNode(entityRefText);

            if (this.stack.length > 0) {
                // Add to current element
                this.stack[this.stack.length - 1].addTextNode(textNode);
            } else {
                // Add to document root level
                this.document?.addTextNode(textNode);
            }
        }
    }
}