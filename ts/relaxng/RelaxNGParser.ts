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

import { Catalog } from '../Catalog';
import { SAXParser } from '../SAXParser';
import { DOMBuilder } from '../DOMBuilder';
import { XMLElement } from '../XMLElement';
import { XMLUtils } from '../XMLUtils';
import { RelaxNGGrammar } from './RelaxNGGrammar';
import { RelaxNGPattern, RelaxNGPatternType } from './RelaxNGPattern';

export class RelaxNGParser {
    private catalog: Catalog | undefined;
    private validating: boolean = false;

    setCatalog(catalog: Catalog): void {
        this.catalog = catalog;
    }

    setValidating(validating: boolean): void {
        this.validating = validating;
    }

    parseGrammar(location: string): RelaxNGGrammar {
        const grammar = new RelaxNGGrammar();
        grammar.setValidating(this.validating);
        
        // Parse the RelaxNG schema file
        const parser = new SAXParser();
        const builder = new DOMBuilder();
        parser.setContentHandler(builder);
        
        try {
            parser.parseFile(location);
            const document = builder.getDocument();
            
            if (!document || !document.getRoot()) {
                throw new Error('Failed to parse RelaxNG schema document');
            }
            
            const rootElement = document.getRoot()!;
            this.validateSchemaStructure(rootElement);
            
            // Process the schema
            this.processSchemaElement(rootElement, grammar);
            
            // Validate grammar constraints
            this.validateGrammarConstraints(grammar);
            
            return grammar;
        } catch (error) {
            throw new Error(`RelaxNG schema parsing failed: ${(error as Error).message}`);
        }
    }

    parseElement(element: XMLElement): RelaxNGPattern {
        return this.convertToPattern(element);
    }

    private validateSchemaStructure(rootElement: XMLElement): void {
        const rootName = this.getLocalName(rootElement);
        
        // Check for valid RelaxNG root element by looking at both namespace URI and default namespace
        const explicitNamespace = rootElement.getNamespace();
        const defaultNamespace = this.getDefaultNamespace(rootElement);
        const relaxNGNamespace = 'http://relaxng.org/ns/structure/1.0';
        
        // Check if this is a RelaxNG schema (either explicit namespace or default namespace)
        const isRelaxNGNamespace = explicitNamespace === relaxNGNamespace || 
                                   defaultNamespace === relaxNGNamespace ||
                                   this.hasRelaxNGNamespaceDeclaration(rootElement);
        
        if (!isRelaxNGNamespace) {
            // If no RelaxNG namespace found, this might not be a RelaxNG schema
            // In a composite environment, we should let other parsers handle it
            throw new Error(`Not a RelaxNG schema - no RelaxNG namespace found`);
        }
        
        if (rootName !== 'grammar' && rootName !== 'element' && rootName !== 'choice' && 
            rootName !== 'text' && rootName !== 'notAllowed' && rootName !== 'group' &&
            rootName !== 'interleave' && rootName !== 'externalRef') {
            throw new Error(`Invalid RelaxNG root element: ${rootName}. Expected 'grammar', 'element', 'choice', 'text', 'notAllowed', 'group', 'interleave', or 'externalRef'`);
        }
        
        // Check for syntax errors at root level
        this.validateElementStructure(rootElement);
    }

    private getLocalName(element: XMLElement): string {
        const fullName = element.getName();
        const colonIndex = fullName.indexOf(':');
        return colonIndex !== -1 ? fullName.substring(colonIndex + 1) : fullName;
    }

    private getDefaultNamespace(element: XMLElement): string | undefined {
        // Check for xmlns attribute (default namespace)
        const xmlnsAttr = element.getAttribute('xmlns');
        if (xmlnsAttr) {
            return xmlnsAttr.getValue();
        }
        
        // RelaxNG namespace check - if we're parsing a RelaxNG document
        // the default namespace is likely RelaxNG namespace 
        const relaxNGNamespace = 'http://relaxng.org/ns/structure/1.0';
        if (this.hasRelaxNGNamespaceDeclaration(element)) {
            return relaxNGNamespace;
        }
        
        return undefined;
    }

    private hasRelaxNGNamespaceDeclaration(element: XMLElement): boolean {
        const relaxNGNamespace = 'http://relaxng.org/ns/structure/1.0';
        
        // Check all attributes for namespace declarations
        const attributes = element.getAttributes();
        for (const attr of attributes) {
            const attrName = attr.getName();
            const attrValue = attr.getValue();
            
            // Check for xmlns="relaxng-namespace"
            if (attrName === 'xmlns' && attrValue === relaxNGNamespace) {
                return true;
            }
            
            // Check for xmlns:prefix="relaxng-namespace"
            if (attrName.startsWith('xmlns:') && attrValue === relaxNGNamespace) {
                return true;
            }
        }
        
        return false;
    }

    private validateElementStructure(element: XMLElement): void {
        const elementName = this.getLocalName(element);
        
        // Validate based on RelaxNG syntax rules
        switch (elementName) {
            case 'grammar':
                this.validateGrammarElement(element);
                break;
            case 'element':
                this.validateElementPattern(element);
                break;
            case 'attribute':
                this.validateAttributePattern(element);
                break;
            case 'start':
                this.validateStartElement(element);
                break;
            case 'define':
                this.validateDefineElement(element);
                break;
            case 'ref':
                this.validateRefElement(element);
                break;
            case 'empty':
                this.validateEmptyElement(element);
                break;
            case 'text':
                this.validateTextElement(element);
                break;
            case 'notAllowed':
                this.validateNotAllowedElement(element);
                break;
            case 'value':
                this.validateValueElement(element);
                break;
            case 'data':
                this.validateDataElement(element);
                break;
            // Add more validations as needed
        }
        
        // Recursively validate children
        const children = element.getChildren();
        for (const child of children) {
            this.validateElementStructure(child);
        }
    }

    private validateGrammarElement(element: XMLElement): void {
        const children = element.getChildren();
        let hasStart = false;
        
        for (const child of children) {
            const childName = this.getLocalName(child);
            if (childName === 'start') {
                if (hasStart) {
                    throw new Error('Grammar cannot have multiple start elements');
                }
                hasStart = true;
            }
        }
        
        // According to RelaxNG specification, a grammar element must have exactly one start element
        if (!hasStart) {
            throw new Error('Grammar element must contain a start element');
        }
    }

    private validateElementPattern(element: XMLElement): void {
        // Check for unknown attributes
        this.validateUnknownAttributes(element, ['name', 'ns', 'datatypeLibrary']);
        
        const name = element.getAttribute('name');
        const nameChild = element.getChild('name');
        const nsNameChild = element.getChild('nsName');
        const anyNameChild = element.getChild('anyName');
        
        // Element must have some form of name specification
        const hasNameSpec = name || nameChild || nsNameChild || anyNameChild;
        if (!hasNameSpec) {
            throw new Error('Element pattern must have a name attribute or name child element');
        }
        
        // Element cannot have multiple name specifications
        const nameSpecCount = [name, nameChild, nsNameChild, anyNameChild].filter(Boolean).length;
        if (nameSpecCount > 1) {
            throw new Error('Element cannot have multiple name specifications');
        }

        // Validate name attribute value if present
        if (name && name.getValue()) {
            const nameValue = name.getValue();
            if (!XMLUtils.isValidXMLName(nameValue)) {
                throw new Error(`Invalid element name: "${nameValue}" - XML names must start with a letter, underscore, or colon`);
            }
        }

        // Validate content model
        this.validateElementContentModel(element);
    }

    private validateElementContentModel(element: XMLElement): void {
        const children = element.getChildren();
        let hasPattern = false;
        let hasDefine = false;

        for (const child of children) {
            const childName = this.getLocalName(child);
            
            // Define elements should not appear in element patterns
            if (childName === 'define') {
                hasDefine = true;
            }
            
            // Check for pattern content
            if (this.isPatternElement(childName)) {
                hasPattern = true;
            }
        }

        // Element patterns with define elements are invalid outside grammar context
        if (hasDefine) {
            throw new Error('Define elements cannot appear inside element patterns');
        }
    }

    private isPatternElement(elementName: string): boolean {
        const patternElements = [
            'element', 'attribute', 'group', 'choice', 'interleave',
            'optional', 'zeroOrMore', 'oneOrMore', 'list', 'mixed',
            'text', 'empty', 'notAllowed', 'value', 'data', 'ref'
        ];
        return patternElements.includes(elementName);
    }

    private validateAttributePattern(element: XMLElement): void {
        // Check for unknown attributes
        this.validateUnknownAttributes(element, ['name', 'ns', 'datatypeLibrary']);
        
        const name = element.getAttribute('name');
        const nameChild = element.getChild('name');
        const nsNameChild = element.getChild('nsName');
        const anyNameChild = element.getChild('anyName');
        
        // Attribute must have some form of name specification
        const hasNameSpec = name || nameChild || nsNameChild || anyNameChild;
        if (!hasNameSpec) {
            throw new Error('Attribute pattern must have a name attribute or name child element');
        }
        
        // Attribute cannot have multiple name specifications
        const nameSpecCount = [name, nameChild, nsNameChild, anyNameChild].filter(Boolean).length;
        if (nameSpecCount > 1) {
            throw new Error('Attribute cannot have multiple name specifications');
        }

        // Validate name attribute value if present
        if (name && name.getValue()) {
            const nameValue = name.getValue();
            if (!XMLUtils.isValidXMLName(nameValue)) {
                throw new Error(`Invalid attribute name: "${nameValue}" - XML names must start with a letter, underscore, or colon`);
            }
        }
    }

    private validateStartElement(element: XMLElement): void {
        const children = element.getChildren();
        if (children.length === 0) {
            throw new Error('Start element must have content');
        }
        
        // Count non-comment children for pattern validation
        const nonCommentChildren = children.filter(child => this.getLocalName(child) !== 'comment');
        if (nonCommentChildren.length === 0) {
            throw new Error('Start element must have content');
        }
        
        if (nonCommentChildren.length > 1) {
            throw new Error('Start element can only have one child pattern');
        }
    }

    private validateDefineElement(element: XMLElement): void {
        const name = element.getAttribute('name');
        if (!name || !name.getValue()) {
            throw new Error('Define element must have a name attribute');
        }
        
        // Validate that the name is a valid XML name
        const nameValue = name.getValue();
        if (!XMLUtils.isValidXMLName(nameValue)) {
            throw new Error(`Invalid define name: "${nameValue}" - XML names must start with a letter, underscore, or colon`);
        }
        
        const children = element.getChildren();
        if (children.length === 0) {
            throw new Error('Define element must have content');
        }
    }

    private validateRefElement(element: XMLElement): void {
        const name = element.getAttribute('name');
        if (!name || !name.getValue()) {
            throw new Error('Ref element must have a name attribute');
        }
        
        const nameValue = name.getValue();
        if (!XMLUtils.isValidXMLName(nameValue)) {
            throw new Error(`Ref element has invalid XML name: '${nameValue}'`);
        }
        
        const children = element.getChildren();
        if (children.length > 0) {
            throw new Error('Ref element cannot have child elements');
        }
    }

    private validateEmptyElement(element: XMLElement): void {
        // Empty element should not have any attributes except namespace-related ones
        const attributes = element.getAttributes();
        for (const attr of attributes) {
            const attrName = attr.getName();
            // Only ns attributes and foreign namespace attributes are allowed
            if (!attrName.startsWith('xmlns') && !attrName.includes(':')) {
                throw new Error(`Empty element cannot have attribute: '${attrName}'`);
            }
        }
        
        // Empty element should not have child elements
        const children = element.getChildren();
        if (children.length > 0) {
            throw new Error('Empty element cannot have child elements');
        }
    }

    private validateTextElement(element: XMLElement): void {
        // Text element should not have any attributes except common ones
        const attributes = element.getAttributes();
        for (const attr of attributes) {
            const attrName = attr.getName();
            // Only ns attributes are allowed
            if (!attrName.startsWith('xmlns')) {
                throw new Error(`Text element cannot have attribute: '${attrName}'`);
            }
        }
        
        // Text element should not have child elements
        const children = element.getChildren();
        if (children.length > 0) {
            throw new Error('Text element cannot have child elements');
        }
    }

    private validateUnknownAttributes(element: XMLElement, allowedAttributes: string[]): void {
        const attributes = element.getAttributes();
        for (const attr of attributes) {
            const attrName = attr.getName();
            // Skip namespace declarations and namespace-prefixed attributes
            if (attrName.startsWith('xmlns') || attrName.includes(':')) {
                continue;
            }
            if (!allowedAttributes.includes(attrName)) {
                throw new Error(`Unknown attribute '${attrName}' on ${this.getLocalName(element)} element`);
            }
        }
    }

    private validateNotAllowedElement(element: XMLElement): void {
        // NotAllowed element should not have any attributes except common ones
        const attributes = element.getAttributes();
        for (const attr of attributes) {
            const attrName = attr.getName();
            // Only ns attributes are allowed
            if (!attrName.startsWith('xmlns') && !attrName.includes(':')) {
                throw new Error(`NotAllowed element cannot have attribute: '${attrName}'`);
            }
        }
        
        // NotAllowed element should not have child elements
        const children = element.getChildren();
        if (children.length > 0) {
            throw new Error('NotAllowed element cannot have child elements');
        }
    }

    private validateValueElement(element: XMLElement): void {
        // Value element can have type and ns attributes
        this.validateUnknownAttributes(element, ['type', 'ns', 'datatypeLibrary']);
        
        // Value element should contain text content for the value
        // Child elements are not allowed in simple value patterns
    }

    private validateDataElement(element: XMLElement): void {
        // Data element must have a type attribute
        this.validateUnknownAttributes(element, ['type', 'datatypeLibrary']);
        
        const type = element.getAttribute('type');
        if (!type || !type.getValue()) {
            throw new Error('Data element must have a type attribute');
        }
        
        // Data element can have param, except, and comment children
        const children = element.getChildren();
        for (const child of children) {
            const childName = this.getLocalName(child);
            if (childName !== 'param' && childName !== 'except' && childName !== 'comment') {
                throw new Error(`Data element can only have param, except, and comment children, not '${childName}'`);
            }
        }
    }

    private processSchemaElement(element: XMLElement, grammar: RelaxNGGrammar): void {
        // Convert DOM to RelaxNG patterns
        const pattern = this.convertToPattern(element);
        
        if (this.getLocalName(element) === 'grammar') {
            // Process grammar contents
            const children = element.getChildren();
            for (const child of children) {
                const childLocalName = this.getLocalName(child);
                if (childLocalName === 'start') {
                    const startPattern = this.convertToPattern(child.getChildren()[0]);
                    grammar.setStartPattern(startPattern);
                } else if (childLocalName === 'define') {
                    const nameAttr = child.getAttribute('name');
                    if (nameAttr) {
                        const definePattern = this.convertToPattern(child.getChildren()[0]);
                        grammar.addDefine(nameAttr.getValue(), definePattern);
                    }
                }
            }
        } else {
            // Simple element schema
            grammar.setStartPattern(pattern);
        }
    }

    private convertToPattern(element: XMLElement): RelaxNGPattern {
        const elementName = this.getLocalName(element);
        
        // Skip comment elements entirely
        if (elementName === 'comment') {
            return new RelaxNGPattern(RelaxNGPatternType.EMPTY);
        }
        
        let patternType: RelaxNGPatternType;
        
        // Map element names to pattern types
        switch (elementName) {
            case 'element':
                patternType = RelaxNGPatternType.ELEMENT;
                break;
            case 'attribute':
                patternType = RelaxNGPatternType.ATTRIBUTE;
                break;
            case 'group':
                patternType = RelaxNGPatternType.GROUP;
                break;
            case 'choice':
                patternType = RelaxNGPatternType.CHOICE;
                break;
            case 'interleave':
                patternType = RelaxNGPatternType.INTERLEAVE;
                break;
            case 'optional':
                patternType = RelaxNGPatternType.OPTIONAL;
                break;
            case 'zeroOrMore':
                patternType = RelaxNGPatternType.ZERO_OR_MORE;
                break;
            case 'oneOrMore':
                patternType = RelaxNGPatternType.ONE_OR_MORE;
                break;
            case 'mixed':
                patternType = RelaxNGPatternType.MIXED;
                break;
            case 'text':
                patternType = RelaxNGPatternType.TEXT;
                break;
            case 'empty':
                patternType = RelaxNGPatternType.EMPTY;
                break;
            case 'notAllowed':
                patternType = RelaxNGPatternType.NOT_ALLOWED;
                break;
            case 'value':
                patternType = RelaxNGPatternType.VALUE;
                break;
            case 'data':
                patternType = RelaxNGPatternType.DATA;
                break;
            case 'ref':
                patternType = RelaxNGPatternType.REF;
                break;
            case 'list':
                patternType = RelaxNGPatternType.LIST;
                break;
            case 'grammar':
                patternType = RelaxNGPatternType.GRAMMAR;
                break;
            case 'start':
                patternType = RelaxNGPatternType.START;
                break;
            case 'define':
                patternType = RelaxNGPatternType.DEFINE;
                break;
            case 'include':
                patternType = RelaxNGPatternType.INCLUDE;
                break;
            case 'div':
                patternType = RelaxNGPatternType.DIV;
                break;
            case 'param':
                patternType = RelaxNGPatternType.PARAM;
                break;
            case 'except':
                patternType = RelaxNGPatternType.EXCEPT;
                break;
            case 'externalRef':
                patternType = RelaxNGPatternType.EXTERNAL_REF;
                break;
            case 'parentRef':
                patternType = RelaxNGPatternType.PARENT_REF;
                break;
            case 'name':
                patternType = RelaxNGPatternType.NAME;
                break;
            case 'nsName':
                patternType = RelaxNGPatternType.NS_NAME;
                break;
            case 'anyName':
                patternType = RelaxNGPatternType.ANY_NAME;
                break;
            default:
                throw new Error(`Unsupported RelaxNG element: ${elementName}`);
        }
        
        const pattern = new RelaxNGPattern(patternType);
        
        // Set pattern attributes
        const nameAttr = element.getAttribute('name');
        if (nameAttr) {
            pattern.setName(nameAttr.getValue());
        }
        
        const nsAttr = element.getAttribute('ns');
        if (nsAttr) {
            pattern.setNamespace(nsAttr.getValue());
        }
        
        const typeAttr = element.getAttribute('type');
        if (typeAttr) {
            pattern.setDataType(typeAttr.getValue());
        }
        
        const datatypeLibraryAttr = element.getAttribute('datatypeLibrary');
        if (datatypeLibraryAttr) {
            pattern.setDatatypeLibrary(datatypeLibraryAttr.getValue());
        }

        // Set combine attribute for define patterns
        const combineAttr = element.getAttribute('combine');
        if (combineAttr) {
            pattern.setCombine(combineAttr.getValue());
        }

        // Set href attribute for externalRef and include patterns
        const hrefAttr = element.getAttribute('href');
        if (hrefAttr) {
            pattern.setHref(hrefAttr.getValue());
        }

        // Handle ns attribute for nsName patterns
        if (patternType === RelaxNGPatternType.NS_NAME && nsAttr) {
            pattern.setNs(nsAttr.getValue());
        }
        
        // Set text content for value patterns
        if (patternType === RelaxNGPatternType.VALUE) {
            pattern.setValue(element.getText());
        }

        // Set text content for name patterns
        if (patternType === RelaxNGPatternType.NAME) {
            pattern.setTextContent(element.getText());
        }
        
        // Set ref name
        if (patternType === RelaxNGPatternType.REF) {
            if (nameAttr) {
                pattern.setRefName(nameAttr.getValue());
            }
        }
        
        // Process children - handle name elements specially for element and attribute patterns
        const children = element.getChildren();
        
        // Check for name child element in element and attribute patterns
        if ((patternType === RelaxNGPatternType.ELEMENT || patternType === RelaxNGPatternType.ATTRIBUTE) && !nameAttr) {
            const nameChild = children.find(child => child.getName() === 'name');
            if (nameChild) {
                const nameValue = nameChild.getText();
                if (!XMLUtils.isValidXMLName(nameValue)) {
                    throw new Error(`Name child element has invalid XML name: '${nameValue}'`);
                }
                pattern.setName(nameValue);
                // Process other children (not the name element)
                for (const child of children) {
                    if (child.getName() !== 'name') {
                        const childPattern = this.convertToPattern(child);
                        pattern.addChild(childPattern);
                    }
                }
            } else {
                // Process all children normally
                for (const child of children) {
                    const childPattern = this.convertToPattern(child);
                    pattern.addChild(childPattern);
                }
            }
        } else {
            // Process all children normally
            for (const child of children) {
                const childPattern = this.convertToPattern(child);
                pattern.addChild(childPattern);
            }
        }
        
        return pattern;
    }

    private validateGrammarConstraints(grammar: RelaxNGGrammar): void {
        // Check that all references have corresponding defines
        this.validateReferences(grammar);
        
        // Check for recursion issues (simplified check)
        this.validateRecursion(grammar);
    }

    private validateReferences(grammar: RelaxNGGrammar): void {
        const startPattern = grammar.getStartPattern();
        if (startPattern) {
            this.validateReferencesInPattern(startPattern, grammar);
        }
        
        const defines = grammar.getDefines();
        defines.forEach((pattern) => {
            this.validateReferencesInPattern(pattern, grammar);
        });
    }

    private validateReferencesInPattern(pattern: RelaxNGPattern, grammar: RelaxNGGrammar): void {
        if (pattern.getType() === RelaxNGPatternType.REF) {
            const refName = pattern.getRefName();
            if (refName && !grammar.getDefines().has(refName)) {
                throw new Error(`Undefined reference: ${refName}`);
            }
        }
        
        for (const child of pattern.getChildren()) {
            this.validateReferencesInPattern(child, grammar);
        }
    }

    private validateRecursion(grammar: RelaxNGGrammar): void {
        const visited = new Set<string>();
        const defines = grammar.getDefines();
        
        defines.forEach((pattern, name) => {
            if (!visited.has(name)) {
                this.checkRecursion(pattern, name, new Set<string>(), defines);
                visited.add(name);
            }
        });
    }

    private checkRecursion(pattern: RelaxNGPattern, currentDefine: string, path: Set<string>, defines: Map<string, RelaxNGPattern>): void {
        if (pattern.getType() === RelaxNGPatternType.REF) {
            const refName = pattern.getRefName();
            if (refName) {
                if (path.has(refName)) {
                    throw new Error(`Circular reference detected: ${Array.from(path).join(' -> ')} -> ${refName}`);
                }
                
                const referencedPattern = defines.get(refName);
                if (referencedPattern) {
                    const newPath = new Set(path);
                    newPath.add(refName);
                    this.checkRecursion(referencedPattern, refName, newPath, defines);
                }
            }
        }
        
        for (const child of pattern.getChildren()) {
            this.checkRecursion(child, currentDefine, path, defines);
        }
    }
}