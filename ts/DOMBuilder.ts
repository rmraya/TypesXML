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

import { existsSync } from "fs";
import { CData } from "./CData";
import { Catalog } from "./Catalog";
import { Constants } from "./Constants";
import { ContentHandler } from "./ContentHandler";
import { ProcessingInstruction } from "./ProcessingInstruction";
import { TextNode } from "./TextNode";
import { XMLAttribute } from "./XMLAttribute";
import { XMLComment } from "./XMLComment";
import { XMLDeclaration } from "./XMLDeclaration";
import { XMLDocument } from "./XMLDocument";
import { XMLDocumentType } from "./XMLDocumentType";
import { XMLElement } from "./XMLElement";
import { XMLNode } from "./XMLNode";
import { XMLUtils } from "./XMLUtils";
import { DTDParser } from "./dtd/DTDParser";
import { AttributeUse, Grammar, QualifiedName, ValidationContext } from "./grammar/Grammar";

export class DOMBuilder implements ContentHandler {

    inCdData: boolean = false;
    currentCData: CData = new CData('');
    document: XMLDocument | undefined;
    stack: Array<XMLElement> = [];
    catalog: Catalog | undefined;
    dtdParser: DTDParser | undefined;
    grammarUrl: string | undefined;
    grammar: Grammar | undefined;
    validating: boolean = false;
    private includeDefaultAttributes: boolean = true;
    private rootElementValidated: boolean = false;
    private declaredIds: Set<string> = new Set();
    private pendingIdrefs: string[] = [];

    initialize(): void {
        this.document = new XMLDocument();
        this.stack = new Array();
        this.inCdData = false;
        this.rootElementValidated = false;
        this.declaredIds.clear();
        this.pendingIdrefs = [];
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

    private validateRootElement(elementName: string): void {
        if (!this.validating || this.rootElementValidated) {
            return;
        }

        const docType = this.document?.getDocumentType();
        if (docType && docType.getName() !== elementName) {
            throw new Error(`Root element '${elementName}' does not match DOCTYPE declaration '${docType.getName()}'`);
        }
        this.rootElementValidated = true;
    }

    private addDefaultAttributes(elementName: string, element: XMLElement): void {
        if (!this.grammar) {
            return;
        }

        const elementQName = QualifiedName.fromString(elementName);
        const defaultAttrs = this.grammar.getDefaultAttributes(elementQName);
        if (!defaultAttrs || defaultAttrs.size === 0) {
            return;
        }

        const existingAttNames = new Set<string>();
        const attributes = element.getAttributes();
        if (attributes) {
            attributes.forEach(att => existingAttNames.add(att.getName()));
        }

        defaultAttrs.forEach((defaultValue, attQName) => {
            const attName = attQName.toString();
            if (!existingAttNames.has(attName)) {
                const defaultAttr = new XMLAttribute(attName, defaultValue);
                element.setAttribute(defaultAttr);
            }
        });
    }

    private validateRequiredAttributes(elementName: string, attributes: XMLAttribute[]): void {
        if (!this.validating || !this.grammar) {
            return;
        }

        const elementQName = QualifiedName.fromString(elementName);
        const attDecls = this.grammar.getElementAttributes(elementQName);
        if (!attDecls || attDecls.size === 0) {
            if (attributes.length > 0) {
                const attNames = attributes.map(att => att.getName()).join(', ');
                throw new Error(`Element '${elementName}' has no declared attributes but contains: [${attNames}]`);
            }
            return;
        }

        const providedAttNames = new Set(attributes.map(att => att.getName()));

        attDecls.forEach((attInfo, attQName) => {
            const attName = attQName.toString();
            if (attInfo.use === AttributeUse.REQUIRED && !providedAttNames.has(attName)) {
                throw new Error(`Required attribute '${attName}' is missing from element '${elementName}'`);
            }
        });
    }

    private validateAttributeValues(elementName: string, attributes: XMLAttribute[]): void {
        if (!this.validating || !this.grammar) {
            return;
        }

        const elementQName = QualifiedName.fromString(elementName);
        const attDecls = this.grammar.getElementAttributes(elementQName);
        if (!attDecls || attDecls.size === 0) {
            return;
        }

        for (const attribute of attributes) {
            const attName = attribute.getName();
            const attValue = attribute.getValue();
            const attQName = QualifiedName.fromString(attName);
            const attInfo = attDecls.get(attQName);

            if (attInfo) {
                // ID uniqueness and IDREF collection for validation  
                if (attInfo.datatype === 'ID') {
                    if (this.declaredIds.has(attValue)) {
                        throw new Error(`Duplicate ID value '${attValue}' found in element '${elementName}'`);
                    }
                    this.declaredIds.add(attValue);
                }

                if (attInfo.datatype === 'IDREF') {
                    this.pendingIdrefs.push(attValue);
                } else if (attInfo.datatype === 'IDREFS') {
                    const idrefs = attValue.split(/\s+/);
                    this.pendingIdrefs.push(...idrefs);
                }
            } else {
                throw new Error(`Undeclared attribute '${attName}' found in element '${elementName}'`);
            }
        }
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

    private validateElementContent(elementName: string, children: XMLNode[]): void {
        if (!this.validating || !this.grammar) {
            return;
        }

        // Create ValidationContext for the element
        const elementQName = QualifiedName.fromString(elementName);

        // Extract child element names
        const childElementNames = children
            .filter(child => child.getNodeType() === Constants.ELEMENT_NODE)
            .map(child => QualifiedName.fromString((child as XMLElement).getName()));

        // Extract text content
        const textNodes = children
            .filter(child => child.getNodeType() === Constants.TEXT_NODE)
            .map(child => (child as TextNode).getValue());
        const textContent = textNodes.join('');

        // Create attributes map
        const currentElement = this.stack[this.stack.length - 1];
        const attributesArray = currentElement?.getAttributes() || [];
        const attributesMap = new Map<QualifiedName, string>();
        attributesArray.forEach(attr => {
            attributesMap.set(QualifiedName.fromString(attr.getName()), attr.getValue());
        });

        // Create validation context
        const context = new ValidationContext(
            childElementNames,
            attributesMap,
            textContent,
            this.stack.length > 1 ? QualifiedName.fromString(this.stack[this.stack.length - 2].getName()) : undefined
        );

        // Validate using Grammar interface
        const result = this.grammar.validateElement(elementQName, context);
        if (!result.isValid) {
            const errorMessages = result.errors.map(err => err.message).join('; ');
            throw new Error(`Element '${elementName}' validation failed: ${errorMessages}`);
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
    }

    xmlDeclaration(version: string, encoding: string, standalone: string): void {
        let xmlDclaration = new XMLDeclaration(version, encoding, standalone);
        this.document?.setXmlDeclaration(xmlDclaration);
    }

    startElement(name: string, atts: XMLAttribute[]): void {
        if (this.stack.length === 0) {
            this.validateRootElement(name);
        }

        let element: XMLElement = new XMLElement(name);
        atts.forEach((att) => {
            element.setAttribute(att);
        });

        // Add default attributes when includeDefaultAttributes flag is set
        if (this.includeDefaultAttributes) {
            this.addDefaultAttributes(name, element);
        }

        // Validate attributes when validating is enabled
        if (this.validating) {
            this.validateRequiredAttributes(name, element.getAttributes());
        }

        this.validateAttributeValues(name, element.getAttributes());

        if (this.stack.length === 0) {
            this.document?.setRoot(element);
        } else {
            this.stack[this.stack.length - 1].addElement(element);
        }
        this.stack.push(element);
    }

    endElement(name: string): void {
        const element = this.stack[this.stack.length - 1];

        if (element && this.validating) {
            const children = element.getChildren ? element.getChildren() : [];
            this.validateElementContent(name, children);
        }

        this.stack.pop();
    }

    internalSubset(declaration: string): void {
        let docType: XMLDocumentType | undefined = this.document?.getDocumentType();
        if (docType) {
            docType.setInternalSubset(declaration);

            // Parse DTD for default attributes and validation
            if (!this.dtdParser) {
                this.dtdParser = new DTDParser();
            }

            try {
                const legacyGrammar = this.dtdParser.parseString(declaration);
                this.grammar = legacyGrammar;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                if (this.validating) {
                    throw new Error(`DTD parsing error: ${errorMessage}`);
                } else {
                    console.warn(`DTD parsing warning: ${errorMessage}`);
                }
            }
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
        let docType: XMLDocumentType = new XMLDocumentType(name, publicId, systemId);
        this.document?.setDocumentType(docType);

        // Create DTDParser when we encounter a DTD declaration (helpful behavior)
        if (!this.dtdParser) {
            this.dtdParser = new DTDParser();
        }

        // Try to load DTD for default attributes (helpful behavior, not just for validation)
        if (publicId || systemId) {
            let dtdUrl: string | undefined;

            // First, try to resolve via catalog if available
            if (this.catalog) {
                dtdUrl = this.catalog.resolveEntity(publicId, systemId);
            }

            // If no catalog or catalog resolution failed, try SYSTEM identifier directly
            if (!dtdUrl && systemId) {
                dtdUrl = systemId;
            }

            // If we have a DTD URL, try to load and parse it
            if (dtdUrl && this.dtdParser) {
                try {
                    // For local files, check existence before parsing
                    if (!dtdUrl.startsWith('http://') && !dtdUrl.startsWith('https://')) {
                        if (!existsSync(dtdUrl)) {
                            if (this.validating) {
                                throw new Error(`DTD file not found: ${dtdUrl}`);
                            } else {
                                // In non-validating mode, just warn and continue
                                console.warn(`DTD file not found: ${dtdUrl} (continuing without DTD support)`);
                                return;
                            }
                        }
                    }

                    let legacyGrammar = this.dtdParser.parseDTD(dtdUrl);
                    if (legacyGrammar) {
                        this.grammar = legacyGrammar;
                        this.grammarUrl = dtdUrl;
                    }
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    if (this.validating) {
                        throw new Error(`Failed to load DTD from '${dtdUrl}': ${errorMessage}`);
                    } else {
                        // In non-validating mode, just warn and continue
                        console.warn(`Failed to load DTD from '${dtdUrl}': ${errorMessage} (continuing without DTD support)`);
                    }
                }
            } else if (this.validating) {
                // In validating mode, if DTD is declared but unreachable, throw error
                throw new Error(`DTD validation required but DTD is unreachable. PUBLIC: '${publicId}', SYSTEM: '${systemId}'`);
            }
        }
    }

    endDTD(): void {
        // do nothing
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