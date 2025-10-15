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
import { ContentModelType, Cardinality } from "./grammar/ContentModel";
import { ContentParticleType } from "./grammar/contentParticle";
import { Grammar } from "./grammar/Grammar";

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

    // Validation infrastructure
    private rootElementValidated: boolean = false;
    private declaredIds: Set<string> = new Set();
    private pendingIdrefs: string[] = [];

    initialize(): void {
        this.document = new XMLDocument();
        this.stack = new Array();
        this.inCdData = false;
        // Reset validation state
        this.rootElementValidated = false;
        this.declaredIds.clear();
        this.pendingIdrefs = [];
    }

    setCatalog(catalog: Catalog): void {
        this.catalog = catalog;
    }

    setValidating(validating: boolean): void {
        this.validating = validating;
        // Note: DTDParser will be created on-demand when a DTD is actually encountered
        // This allows for other schema types (XML Schema, RelaxNG) to be supported in the future
    }

    isValidating(): boolean {
        return this.validating;
    }

    // Validation methods
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
        // Add default attributes whenever we have a grammar available (not just in validating mode)
        if (!this.grammar) {
            return;
        }

        const attDecls = this.grammar.getElementAttributesMap(elementName);
        if (!attDecls) {
            return; // No attribute declarations for this element
        }

        // Get currently set attribute names
        const existingAttNames = new Set<string>();
        const attributes = element.getAttributes();
        if (attributes) {
            attributes.forEach(att => existingAttNames.add(att.getName()));
        }

        // Add default values for attributes that are not already set
        attDecls.forEach((attDecl, attName) => {
            if (!existingAttNames.has(attName)) {
                const defaultDecl = attDecl.getDefaultDecl();
                const defaultValue = attDecl.getDefaultValue();

                // Set default value if it exists (either direct default or #FIXED)
                if (defaultValue && defaultValue.trim() !== '') {
                    const defaultAttr = new XMLAttribute(attName, defaultValue);
                    element.setAttribute(defaultAttr);
                }
            }
        });
    }

    private validateRequiredAttributes(elementName: string, attributes: XMLAttribute[]): void {
        if (!this.validating || !this.grammar) {
            return;
        }

        const attDecls = this.grammar.getElementAttributesMap(elementName);
        if (!attDecls) {
            // No attribute declarations for this element - if attributes are provided, it's an error
            if (attributes.length > 0) {
                const attNames = attributes.map(att => att.getName()).join(', ');
                throw new Error(`Element '${elementName}' has no declared attributes but contains: [${attNames}]`);
            }
            return;
        }

        const providedAttNames = new Set(attributes.map(att => att.getName()));

        attDecls.forEach((attDecl, attName) => {
            if (attDecl.getDefaultDecl() === '#REQUIRED' && !providedAttNames.has(attName)) {
                throw new Error(`Required attribute '${attName}' is missing from element '${elementName}'`);
            }
        });
    }

    private validateAttributeValues(elementName: string, attributes: XMLAttribute[]): void {
        if (!this.validating || !this.grammar) {
            return;
        }

        const attDecls = this.grammar.getElementAttributesMap(elementName);
        if (!attDecls) {
            // Already handled in validateRequiredAttributes - no attributes should be present
            return;
        }

        for (const attribute of attributes) {
            const attName = attribute.getName();
            const attValue = attribute.getValue();
            const attDecl = attDecls.get(attName);

            if (attDecl) {
                if (!attDecl.isValid(attValue)) {
                    throw new Error(`Invalid value '${attValue}' for attribute '${attName}' of type '${attDecl.getType()}' in element '${elementName}'`);
                }

                // Track ID values for uniqueness validation
                if (attDecl.getType() === 'ID') {
                    if (this.declaredIds.has(attValue)) {
                        throw new Error(`Duplicate ID value '${attValue}' found in element '${elementName}'`);
                    }
                    this.declaredIds.add(attValue);
                }

                // Collect IDREF values for later validation
                if (attDecl.getType() === 'IDREF') {
                    this.pendingIdrefs.push(attValue);
                } else if (attDecl.getType() === 'IDREFS') {
                    const idrefs = attValue.split(/\s+/);
                    this.pendingIdrefs.push(...idrefs);
                }
            } else {
                // Undeclared attribute - validation error
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

        // Get the content model for this element
        const contentModel = this.grammar.getContentModel(elementName);
        if (!contentModel) {
            return; // No content model declared for this element
        }

        // Get child element names (filter out text nodes and other non-element content)
        const childElementNames = children
            .filter(child => child.getNodeType() === Constants.ELEMENT_NODE)
            .map(child => (child as XMLElement).getName());

        // Check for text content (excluding whitespace-only)
        const hasTextContent = children.some(child =>
            child.getNodeType() === Constants.TEXT_NODE &&
            (child as TextNode).getValue().trim().length > 0
        );

        // Validate based on content model type
        if (contentModel.toString() === ContentModelType.EMPTY) {
            if (childElementNames.length > 0) {
                throw new Error(`Element '${elementName}' declared as EMPTY but contains child elements: [${childElementNames.join(', ')}]`);
            }
            if (hasTextContent) {
                throw new Error(`Element '${elementName}' declared as EMPTY but contains text content`);
            }
            return;
        }

        if (contentModel.toString() === ContentModelType.ANY) {
            // ANY content allows all content - no validation needed
            return;
        }

        // For MIXED content models
        if (contentModel.isMixed()) {
            // Mixed content allows text and declared child elements
            const allowedChildren = contentModel.getChildren();
            for (const childName of childElementNames) {
                if (!allowedChildren.has(childName)) {
                    throw new Error(`Element '${childName}' is not allowed in mixed content model of element '${elementName}'. Allowed: [${Array.from(allowedChildren).join(', ')}]`);
                }
            }
            return;
        }

        // For element-only content models (CHILDREN)
        if (hasTextContent) {
            throw new Error(`Element '${elementName}' has element-only content model but contains text content`);
        }

        // Validate element sequence against content model
        const allowedChildren = contentModel.getChildren();
        for (const childName of childElementNames) {
            if (!allowedChildren.has(childName)) {
                throw new Error(`Element '${childName}' is not allowed in element '${elementName}'. Allowed: [${Array.from(allowedChildren).join(', ')}]`);
            }
        }

        // Validate element sequence against detailed content model
        this.validateContentModelStructure(elementName, childElementNames, contentModel);
    }

    private validateContentModelStructure(elementName: string, childElementNames: string[], contentModel: any): void {
        if (!this.validating || !this.grammar) {
            return;
        }

        // Get the actual content particles from the content model
        const contentParticles = contentModel.getContent();
        if (!contentParticles || contentParticles.length === 0) {
            return;
        }

        // Validate the child elements against the content model structure
        try {
            this.validateParticleSequence(childElementNames, contentParticles, elementName);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Content model validation failed for element '${elementName}': ${errorMessage}`);
        }
    }

    private validateParticleSequence(childElements: string[], particles: any[], elementName: string): boolean {
        // Create a copy of child elements for consumption during validation
        let remainingChildren = [...childElements];
        
        // Process each particle in the content model
        for (const particle of particles) {
            const consumed = this.consumeParticle(remainingChildren, particle, elementName);
            if (!consumed && this.isRequiredParticle(particle)) {
                throw new Error(`Required content particle '${particle.toString()}' not satisfied`);
            }
        }

        // Check if there are unconsumed child elements
        if (remainingChildren.length > 0) {
            throw new Error(`Unexpected elements found: [${remainingChildren.join(', ')}]`);
        }

        return true;
    }

    private consumeParticle(remainingChildren: string[], particle: any, elementName: string): boolean {
        const particleType = particle.getType();
        const cardinality = particle.getCardinality();
        
        if (particleType === ContentParticleType.NAME) {
            return this.consumeNameParticle(remainingChildren, particle, cardinality);
        } else if (particleType === ContentParticleType.SEQUENCE) {
            return this.consumeSequenceParticle(remainingChildren, particle, cardinality);
        } else if (particleType === ContentParticleType.CHOICE) {
            return this.consumeChoiceParticle(remainingChildren, particle, cardinality);
        }
        
        return false;
    }

    private consumeNameParticle(remainingChildren: string[], particle: any, cardinality: any): boolean {
        const elementName = particle.getName();
        let consumedCount = 0;
        
        // Consume matching elements from the beginning of the list
        while (remainingChildren.length > 0 && remainingChildren[0] === elementName) {
            remainingChildren.shift();
            consumedCount++;
        }
        
        // Validate cardinality
        return this.validateCardinality(consumedCount, cardinality, elementName);
    }

    private consumeSequenceParticle(remainingChildren: string[], particle: any, cardinality: any): boolean {
        const subParticles = particle.getParticles();
        let sequenceConsumedCount = 0;
        
        // Try to consume the sequence as many times as the cardinality allows
        while (true) {
            const childrenBeforeSequence = remainingChildren.length;
            let sequenceMatched = true;
            
            // Try to match the entire sequence
            for (const subParticle of subParticles) {
                if (!this.consumeParticle(remainingChildren, subParticle, particle.toString())) {
                    if (this.isRequiredParticle(subParticle)) {
                        sequenceMatched = false;
                        break;
                    }
                }
            }
            
            if (sequenceMatched && remainingChildren.length < childrenBeforeSequence) {
                sequenceConsumedCount++;
            } else {
                // Restore children if sequence didn't match completely
                if (!sequenceMatched) {
                    // This is a simplified restoration - in a full implementation we'd need proper backtracking
                    break;
                }
                break;
            }
        }
        
        return this.validateCardinality(sequenceConsumedCount, cardinality, particle.toString());
    }

    private consumeChoiceParticle(remainingChildren: string[], particle: any, cardinality: any): boolean {
        const subParticles = particle.getParticles();
        let choiceConsumedCount = 0;
        
        // Try to consume the choice as many times as the cardinality allows
        while (remainingChildren.length > 0) {
            const childrenBeforeChoice = remainingChildren.length;
            let choiceMatched = false;
            
            // Try each alternative in the choice
            for (const subParticle of subParticles) {
                const childrenCopy = [...remainingChildren];
                if (this.consumeParticle(childrenCopy, subParticle, particle.toString())) {
                    // This alternative matched, update the actual remaining children
                    remainingChildren.length = 0;
                    remainingChildren.push(...childrenCopy);
                    choiceMatched = true;
                    break;
                }
            }
            
            if (choiceMatched && remainingChildren.length < childrenBeforeChoice) {
                choiceConsumedCount++;
            } else {
                break;
            }
        }
        
        return this.validateCardinality(choiceConsumedCount, cardinality, particle.toString());
    }

    private validateCardinality(consumedCount: number, cardinality: any, particleName: string): boolean {
        switch (cardinality) {
            case Cardinality.NONE: // exactly one
                return consumedCount === 1;
            case Cardinality.OPTIONAL: // zero or one
                return consumedCount === 0 || consumedCount === 1;
            case Cardinality.ZEROMANY: // zero or more
                return consumedCount >= 0;
            case Cardinality.ONEMANY: // one or more
                return consumedCount >= 1;
            default:
                return false;
        }
    }

    private isRequiredParticle(particle: any): boolean {
        const cardinality = particle.getCardinality();
        return cardinality === Cardinality.NONE || cardinality === Cardinality.ONEMANY;
    }

    setDTDParser(dtdParser: DTDParser): void {
        this.dtdParser = dtdParser;
    }

    getDocument(): XMLDocument | undefined {
        return this.document;
    }

    startDocument(): void {
        // do nothing
    }

    endDocument(): void {
        // Validate all IDREF references at the end of parsing
        this.validateIdReferences();
    }

    xmlDeclaration(version: string, encoding: string, standalone: string): void {
        let xmlDclaration = new XMLDeclaration(version, encoding, standalone);
        this.document?.setXmlDeclaration(xmlDclaration);
    }

    startElement(name: string, atts: XMLAttribute[]): void {
        // Validate root element if this is the first element
        if (this.stack.length === 0) {
            this.validateRootElement(name);
        }

        let element: XMLElement = new XMLElement(name);
        atts.forEach((att) => {
            element.setAttribute(att);
        });

        // Add default attribute values from DTD when validating
        this.addDefaultAttributes(name, element);

        // Validate required attributes and their values (after defaults are added)
        const allAttributes = element.getAttributes() || [];
        this.validateRequiredAttributes(name, allAttributes);
        this.validateAttributeValues(name, allAttributes);

        if (this.stack.length > 0) {
            this.stack[this.stack.length - 1].addElement(element);
        } else {
            this.document?.setRoot(element);
        }
        this.stack.push(element);
    }

    endElement(name: string): void {
        // Get the element being closed
        const element = this.stack[this.stack.length - 1];

        // Validate element content against DTD
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

            // Parse the DTD to create Grammar (for default attributes and validation if enabled)
            // This is helpful behavior - we parse DTDs even when not validating to provide default attributes
            if (!this.dtdParser) {
                this.dtdParser = new DTDParser();
            }

            try {
                this.grammar = this.dtdParser.parseString(declaration);
            } catch (error) {
                // If DTD parsing fails in validating mode, throw an error
                // In non-validating mode, just log the error and continue without DTD support
                const errorMessage = error instanceof Error ? error.message : String(error);
                if (this.validating) {
                    throw new Error(`DTD parsing error: ${errorMessage}`);
                } else {
                    // Silently continue without DTD support in non-validating mode
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

                    let dtdGrammar: Grammar = this.dtdParser.parseDTD(dtdUrl);
                    if (dtdGrammar) {
                        this.grammar = dtdGrammar;
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