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

import { AttributeInfo, AttributeUse, Grammar, GrammarType, ValidationContext, ValidationResult } from '../grammar/Grammar';
import { XMLUtils } from '../XMLUtils';
import { RelaxNGPattern, RelaxNGPatternType } from './RelaxNGPattern';

export class RelaxNGGrammar implements Grammar {
    private startPattern: RelaxNGPattern | undefined;
    private defines: Map<string, RelaxNGPattern> = new Map();
    private targetNamespace: string | undefined;
    private namespaces: Map<string, string> = new Map();
    private validating: boolean = false;

    constructor() {
    }

    setValidating(validating: boolean): void {
        this.validating = validating;
    }

    setStartPattern(pattern: RelaxNGPattern): void {
        this.startPattern = pattern;
    }

    getStartPattern(): RelaxNGPattern | undefined {
        return this.startPattern;
    }

    addDefine(name: string, pattern: RelaxNGPattern): void {
        this.defines.set(name, pattern);
    }

    addDefinition(name: string, pattern: RelaxNGPattern): void {
        this.addDefine(name, pattern);
    }

    getDefine(name: string): RelaxNGPattern | undefined {
        return this.defines.get(name);
    }

    getDefines(): Map<string, RelaxNGPattern> {
        return new Map(this.defines);
    }

    setTargetNamespace(namespace: string): void {
        this.targetNamespace = namespace;
    }

    addNamespace(prefix: string, uri: string): void {
        this.namespaces.set(prefix, uri);
    }

    addNamespaceMapping(prefix: string, uri: string): void {
        this.addNamespace(prefix, uri);
    }

    removeNamespaceMapping(prefix: string): void {
        this.namespaces.delete(prefix);
    }

    validate(): void {
        if (!this.startPattern) {
            throw new Error('RelaxNG grammar must have a start pattern');
        }

        // Additional validation can be added here
        // For example: checking that all referenced defines exist
        this.validateReferences();
    }

    private validateReferences(): void {
        // This would recursively check all patterns to ensure refs point to valid defines
        // For now, just a basic check
        if (this.startPattern) {
            this.validatePatternReferences(this.startPattern);
        }
    }

    private validatePatternReferences(pattern: RelaxNGPattern): void {
        if (pattern.getType() === RelaxNGPatternType.REF) {
            const refName = pattern.getRefName();
            if (refName && !this.defines.has(refName)) {
                console.warn(`Reference to undefined pattern: ${refName}`);
            }
        }

        // Recursively check children
        for (const child of pattern.getChildren()) {
            this.validatePatternReferences(child);
        }
    }

    validateElement(element: string, content: ValidationContext): ValidationResult {
        if (!this.startPattern) {
            return ValidationResult.error('No start pattern defined in RelaxNG grammar');
        }

        // Find the element pattern in the grammar
        const elementPattern = this.findElementPattern(element);
        if (!elementPattern) {
            return ValidationResult.error(`Element '${element}' not allowed by RelaxNG grammar`);
        }

        // Validate element content model
        return this.validateElementContent(elementPattern, content);
    }

    validateAttributes(element: string, attributes: Map<string, string>, context: ValidationContext): ValidationResult {
        // Find the element pattern in the grammar
        const elementPattern = this.findElementPattern(element);
        if (!elementPattern) {
            return ValidationResult.error(`Element '${element}' not found in RelaxNG grammar`);
        }

        // Extract attribute patterns from the element
        const attributePatterns = this.extractAttributePatterns(elementPattern);

        // Validate each provided attribute
        for (const [attrName, attrValue] of attributes) {
            const attrPattern = this.findAttributePattern(attributePatterns, attrName);
            if (!attrPattern) {
                return ValidationResult.error(`Attribute '${attrName}' not allowed on element '${element}'`);
            }

            // Validate attribute value
            const valueValidation = this.validateAttributeValue(attrPattern, attrValue);
            if (!valueValidation.isValid) {
                return valueValidation;
            }
        }

        // Check for required attributes that are missing
        for (const attrPattern of attributePatterns) {
            const attrName = attrPattern.getName();
            if (attrName && this.isAttributeRequired(attrPattern) && !attributes.has(attrName)) {
                return ValidationResult.error(`Required attribute '${attrName}' missing on element '${element}'`);
            }
        }

        return ValidationResult.success();
    }

    getDefaultAttributes(element: string): Map<string, string> {
        const defaults = new Map<string, string>();

        const elementPattern = this.findElementPattern(element);
        if (!elementPattern) return defaults;

        const attributePatterns = this.extractAttributePatterns(elementPattern);

        for (const attrPattern of attributePatterns) {
            const defaultValue = this.extractDefaultValue(attrPattern);
            if (defaultValue) {
                const attrName = attrPattern.getName();
                if (attrName) {
                    defaults.set(attrName, defaultValue);
                }
            }
        }

        return defaults;
    }

    private findElementPattern(elementName: string): RelaxNGPattern | undefined {
        if (!this.startPattern) return undefined;
        return this.searchElementPattern(this.startPattern, elementName);
    }

    private searchElementPattern(pattern: RelaxNGPattern, targetElement: string): RelaxNGPattern | undefined {
        if (pattern.getType() === RelaxNGPatternType.ELEMENT) {
            const patternName = pattern.getName();
            if (patternName === targetElement) {
                return pattern;
            }

            // Handle namespace-aware matching
            if (this.matchesWithNamespace(patternName, targetElement, pattern)) {
                return pattern;
            }
        }

        for (const child of pattern.getChildren()) {
            const result = this.searchElementPattern(child, targetElement);
            if (result) return result;
        }

        return undefined;
    }

    private matchesWithNamespace(patternName: string | undefined, targetElement: string, pattern: RelaxNGPattern): boolean {
        if (!patternName) return false;

        // Handle QName matching (prefix:localName)
        const targetParts = targetElement.split(':');
        const patternParts = patternName.split(':');

        if (targetParts.length === 2 && patternParts.length === 2) {
            // Both have prefixes - compare local names and resolve namespaces
            const targetLocal = targetParts[1];
            const patternLocal = patternParts[1];

            if (targetLocal === patternLocal) {
                // Check if namespaces match (simplified - in real implementation would resolve prefixes)
                const patternNs = pattern.getNamespace();
                return patternNs !== undefined; // Basic namespace presence check
            }
        } else if (targetParts.length === 1 && patternParts.length === 1) {
            // Both are local names - direct comparison
            return targetElement === patternName;
        }

        return false;
    }

    private extractAttributePatterns(elementPattern: RelaxNGPattern): RelaxNGPattern[] {
        const attributePatterns: RelaxNGPattern[] = [];
        this.collectAttributePatterns(elementPattern, attributePatterns);
        return attributePatterns;
    }

    private collectAttributePatterns(pattern: RelaxNGPattern, collector: RelaxNGPattern[]): void {
        if (pattern.getType() === RelaxNGPatternType.ATTRIBUTE) {
            collector.push(pattern);
        }

        for (const child of pattern.getChildren()) {
            this.collectAttributePatterns(child, collector);
        }
    }

    private extractDefaultValue(attrPattern: RelaxNGPattern): string | undefined {
        if (attrPattern.getType() === RelaxNGPatternType.OPTIONAL) {
            const children = attrPattern.getChildren();
            if (children.length === 1 && children[0].getType() === RelaxNGPatternType.ATTRIBUTE) {
                return this.extractSingleValueFromAttribute(children[0]);
            }
        }

        return undefined;
    }

    private extractSingleValueFromAttribute(attrPattern: RelaxNGPattern): string | undefined {
        const children = attrPattern.getChildren();
        if (children.length === 1 && children[0].getType() === RelaxNGPatternType.VALUE) {
            return children[0].getValue();
        }
        return undefined;
    }

    getElementAttributes(element: string): Map<string, AttributeInfo> {
        const attributeInfos = new Map<string, AttributeInfo>();

        const elementPattern = this.findElementPattern(element);
        if (!elementPattern) return attributeInfos;

        const attributePatterns = this.extractAttributePatterns(elementPattern);

        for (const attrPattern of attributePatterns) {
            const attrName = attrPattern.getName();
            if (attrName) {
                const isRequired = this.isAttributeRequired(attrPattern);
                const use = isRequired ? AttributeUse.REQUIRED : AttributeUse.OPTIONAL;
                const datatype = this.getAttributeDatatype(attrPattern);
                const defaultValue = this.extractDefaultValue(attrPattern);

                attributeInfos.set(attrName, new AttributeInfo(attrName, datatype, use, defaultValue));
            }
        }

        return attributeInfos;
    }

    private isAttributeRequired(attrPattern: RelaxNGPattern): boolean {
        // In RelaxNG, attributes are required unless they are wrapped in optional
        let parent = attrPattern.getParent();
        while (parent) {
            if (parent.getType() === RelaxNGPatternType.OPTIONAL) {
                return false;
            }
            parent = parent.getParent();
        }
        return true;
    }

    private findAttributePattern(attributePatterns: RelaxNGPattern[], attrName: string): RelaxNGPattern | undefined {
        return attributePatterns.find(pattern => pattern.getName() === attrName);
    }

    private validateAttributeValue(attrPattern: RelaxNGPattern, value: string): ValidationResult {
        // Get the value constraint from the attribute pattern
        const children = attrPattern.getChildren();

        for (const child of children) {
            if (child.getType() === RelaxNGPatternType.VALUE) {
                const expectedValue = child.getValue();
                if (expectedValue && value !== expectedValue) {
                    return ValidationResult.error(`Attribute value '${value}' does not match expected value '${expectedValue}'`);
                }
                return ValidationResult.success();
            } else if (child.getType() === RelaxNGPatternType.DATA) {
                // Validate against datatype
                return this.validateDatatype(child, value);
            } else if (child.getType() === RelaxNGPatternType.TEXT) {
                // TEXT allows any text content
                return ValidationResult.success();
            } else if (child.getType() === RelaxNGPatternType.CHOICE) {
                // Try each choice option
                for (const choiceChild of child.getChildren()) {
                    if (choiceChild.getType() === RelaxNGPatternType.VALUE) {
                        const expectedValue = choiceChild.getValue();
                        if (expectedValue && value === expectedValue) {
                            return ValidationResult.success();
                        }
                    }
                }
                return ValidationResult.error(`Attribute value '${value}' does not match any choice option`);
            }
        }

        // If no specific constraint, allow any value
        return ValidationResult.success();
    }

    private validateElementContent(elementPattern: RelaxNGPattern, content: ValidationContext): ValidationResult {
        // Extract content pattern from element
        const contentPattern = this.extractContentPattern(elementPattern);
        if (!contentPattern) {
            return ValidationResult.error('No content pattern found for element');
        }

        // Validate the content against the pattern
        return this.validatePattern(contentPattern, content);
    }

    private extractContentPattern(elementPattern: RelaxNGPattern): RelaxNGPattern | undefined {
        const children = elementPattern.getChildren();
        for (const child of children) {
            // Skip attribute patterns, look for content patterns
            if (child.getType() !== RelaxNGPatternType.ATTRIBUTE) {
                return child;
            }
        }
        return undefined;
    }

    private validatePattern(pattern: RelaxNGPattern, content: ValidationContext): ValidationResult {
        switch (pattern.getType()) {
            case RelaxNGPatternType.EMPTY:
                return this.validateEmpty(content);

            case RelaxNGPatternType.TEXT:
                return ValidationResult.success(); // TEXT allows any content

            case RelaxNGPatternType.ELEMENT:
                return this.validateElementPattern(pattern, content);

            case RelaxNGPatternType.GROUP:
                return this.validateGroup(pattern, content);

            case RelaxNGPatternType.CHOICE:
                return this.validateChoice(pattern, content);

            case RelaxNGPatternType.INTERLEAVE:
                return this.validateInterleave(pattern, content);

            case RelaxNGPatternType.OPTIONAL:
                return this.validateOptional(pattern, content);

            case RelaxNGPatternType.ZERO_OR_MORE:
                return this.validateZeroOrMore(pattern, content);

            case RelaxNGPatternType.ONE_OR_MORE:
                return this.validateOneOrMore(pattern, content);

            case RelaxNGPatternType.MIXED:
                return this.validateMixed(pattern, content);

            case RelaxNGPatternType.REF:
                return this.validateRef(pattern, content);

            case RelaxNGPatternType.VALUE:
                return this.validateValue(pattern, content);

            case RelaxNGPatternType.DATA:
                return this.validateDatatype(pattern, content.textContent);

            case RelaxNGPatternType.NOT_ALLOWED:
                return ValidationResult.error('Content not allowed');

            default:
                return ValidationResult.error(`Unsupported pattern type: ${pattern.getType()}`);
        }
    }

    private validateEmpty(content: ValidationContext): ValidationResult {
        if (content.childrenNames.length > 0 || content.textContent.trim().length > 0) {
            return ValidationResult.error('Empty content expected, but found child elements or text');
        }
        return ValidationResult.success();
    }

    private validateElementPattern(pattern: RelaxNGPattern, content: ValidationContext): ValidationResult {
        const elementName = pattern.getName();
        if (!elementName) {
            return ValidationResult.error('Element pattern missing name');
        }

        // Check if the element appears in the content
        if (!content.childrenNames.includes(elementName)) {
            return ValidationResult.error(`Required element '${elementName}' not found`);
        }

        return ValidationResult.success();
    }

    private validateGroup(pattern: RelaxNGPattern, content: ValidationContext): ValidationResult {
        const children = pattern.getChildren();
        let childIndex = 0;

        // All children must match in sequence
        for (const child of children) {
            const remainingContent = {
                ...content,
                childrenNames: content.childrenNames.slice(childIndex)
            };

            const result = this.validatePattern(child, remainingContent);
            if (!result.isValid) {
                return result;
            }

            // Advance based on how many elements this pattern consumed
            childIndex += this.countElementsConsumed(child, remainingContent);
        }

        return ValidationResult.success();
    }

    private validateChoice(pattern: RelaxNGPattern, content: ValidationContext): ValidationResult {
        const children = pattern.getChildren();

        // Try each choice option
        for (const child of children) {
            const result = this.validatePattern(child, content);
            if (result.isValid) {
                return result;
            }
        }

        return ValidationResult.error('Content does not match any choice option');
    }

    private validateInterleave(pattern: RelaxNGPattern, content: ValidationContext): ValidationResult {
        // Simplified interleave validation - check that all required patterns can be satisfied
        const children = pattern.getChildren();
        const remainingElements = [...content.childrenNames];

        for (const child of children) {
            const tempContent = {
                ...content,
                childrenNames: remainingElements
            };

            const result = this.validatePattern(child, tempContent);
            if (!result.isValid) {
                return result;
            }

            // Remove consumed elements (simplified approach)
            const consumed = this.countElementsConsumed(child, tempContent);
            remainingElements.splice(0, consumed);
        }

        return ValidationResult.success();
    }

    private validateOptional(pattern: RelaxNGPattern, content: ValidationContext): ValidationResult {
        const children = pattern.getChildren();
        if (children.length === 0) {
            return ValidationResult.success();
        }

        // Try to match the content, but success if it doesn't match
        const result = this.validatePattern(children[0], content);
        return ValidationResult.success(); // Optional always succeeds
    }

    private validateZeroOrMore(pattern: RelaxNGPattern, content: ValidationContext): ValidationResult {
        const children = pattern.getChildren();
        if (children.length === 0) {
            return ValidationResult.success();
        }

        // Keep trying to match the pattern until it fails
        let remainingContent = content;
        while (true) {
            const result = this.validatePattern(children[0], remainingContent);
            if (!result.isValid) {
                break; // No more matches, which is OK for zeroOrMore
            }

            // Advance content
            const consumed = this.countElementsConsumed(children[0], remainingContent);
            if (consumed === 0) {
                break; // Avoid infinite loop
            }

            remainingContent = {
                ...remainingContent,
                childrenNames: remainingContent.childrenNames.slice(consumed)
            };
        }

        return ValidationResult.success();
    }

    private validateOneOrMore(pattern: RelaxNGPattern, content: ValidationContext): ValidationResult {
        const children = pattern.getChildren();
        if (children.length === 0) {
            return ValidationResult.error('oneOrMore pattern requires child patterns');
        }

        // Must match at least once
        let matchCount = 0;
        let remainingContent = content;

        while (true) {
            const result = this.validatePattern(children[0], remainingContent);
            if (!result.isValid) {
                break;
            }

            matchCount++;
            const consumed = this.countElementsConsumed(children[0], remainingContent);
            if (consumed === 0) {
                break; // Avoid infinite loop
            }

            remainingContent = {
                ...remainingContent,
                childrenNames: remainingContent.childrenNames.slice(consumed)
            };
        }

        if (matchCount === 0) {
            return ValidationResult.error('oneOrMore pattern requires at least one match');
        }

        return ValidationResult.success();
    }

    private validateMixed(pattern: RelaxNGPattern, content: ValidationContext): ValidationResult {
        // Mixed allows text content interleaved with elements
        const children = pattern.getChildren();
        if (children.length === 0) {
            return ValidationResult.success();
        }

        return this.validatePattern(children[0], content);
    }

    private validateRef(pattern: RelaxNGPattern, content: ValidationContext): ValidationResult {
        const refName = pattern.getRefName();
        if (!refName) {
            return ValidationResult.error('Reference pattern missing name');
        }

        const definePattern = this.defines.get(refName);
        if (!definePattern) {
            return ValidationResult.error(`Undefined reference: ${refName}`);
        }

        return this.validatePattern(definePattern, content);
    }

    private validateValue(pattern: RelaxNGPattern, content: ValidationContext): ValidationResult {
        const expectedValue = pattern.getValue();
        if (!expectedValue) {
            return ValidationResult.error('Value pattern missing expected value');
        }

        const actualValue = content.textContent.trim();
        if (actualValue !== expectedValue) {
            return ValidationResult.error(`Expected value '${expectedValue}', got '${actualValue}'`);
        }

        return ValidationResult.success();
    }

    private validateDatatype(pattern: RelaxNGPattern, value: string): ValidationResult {
        const datatype = pattern.getDataType();
        const datatypeLibrary = pattern.getDatatypeLibrary();

        if (!datatype) {
            return ValidationResult.error('Data pattern missing type');
        }

        // Handle different datatype libraries
        if (!datatypeLibrary || datatypeLibrary === '' || datatypeLibrary === 'http://www.w3.org/2001/XMLSchema-datatypes') {
            // Default XML Schema datatypes
            return this.validateXMLSchemaDatatype(datatype, value);
        } else {
            // For other datatype libraries, we'll do basic validation
            return this.validateBasicDatatype(datatype, value);
        }
    }

    private validateXMLSchemaDatatype(datatype: string, value: string): ValidationResult {
        const trimmedValue = value.trim();

        switch (datatype) {
            case 'string':
                return ValidationResult.success(); // Any string is valid

            case 'token':
                // No leading/trailing whitespace, no sequences of whitespace
                if (value !== trimmedValue || /\s{2,}/.test(value)) {
                    return ValidationResult.error(`Invalid token: "${value}"`);
                }
                return ValidationResult.success();

            case 'normalizedString':
                // No tab, line feed, or carriage return characters
                if (/[\t\n\r]/.test(value)) {
                    return ValidationResult.error(`Invalid normalizedString: "${value}"`);
                }
                return ValidationResult.success();

            case 'boolean':
                if (!['true', 'false', '1', '0'].includes(trimmedValue)) {
                    return ValidationResult.error(`Invalid boolean: "${value}"`);
                }
                return ValidationResult.success();

            case 'decimal':
                if (!/^[+-]?\d*\.?\d+$/.test(trimmedValue)) {
                    return ValidationResult.error(`Invalid decimal: "${value}"`);
                }
                return ValidationResult.success();

            case 'integer':
            case 'int':
                if (!/^[+-]?\d+$/.test(trimmedValue)) {
                    return ValidationResult.error(`Invalid integer: "${value}"`);
                }
                return ValidationResult.success();

            case 'double':
            case 'float':
                const floatValue = parseFloat(trimmedValue);
                if (isNaN(floatValue) && trimmedValue !== 'INF' && trimmedValue !== '-INF' && trimmedValue !== 'NaN') {
                    return ValidationResult.error(`Invalid ${datatype}: "${value}"`);
                }
                return ValidationResult.success();

            case 'date':
                // Basic date format validation (YYYY-MM-DD)
                if (!/^\d{4}-\d{2}-\d{2}(Z|[+-]\d{2}:\d{2})?$/.test(trimmedValue)) {
                    return ValidationResult.error(`Invalid date: "${value}"`);
                }
                return ValidationResult.success();

            case 'time':
                // Basic time format validation (HH:MM:SS)
                if (!/^\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(trimmedValue)) {
                    return ValidationResult.error(`Invalid time: "${value}"`);
                }
                return ValidationResult.success();

            case 'dateTime':
                // Basic dateTime format validation (YYYY-MM-DDTHH:MM:SS)
                if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(trimmedValue)) {
                    return ValidationResult.error(`Invalid dateTime: "${value}"`);
                }
                return ValidationResult.success();

            case 'anyURI':
                // Basic URI validation - allow most strings
                if (trimmedValue === '') {
                    return ValidationResult.error(`Invalid anyURI: empty value`);
                }
                return ValidationResult.success();

            case 'QName':
                // Use XMLUtils for proper QName validation
                if (!XMLUtils.isValidXMLName(trimmedValue)) {
                    return ValidationResult.error(`Invalid QName: "${value}"`);
                }
                return ValidationResult.success();

            case 'NCName':
                // Non-colonized name - use XMLUtils for proper validation
                if (trimmedValue.includes(':') || !XMLUtils.isValidXMLName(trimmedValue)) {
                    return ValidationResult.error(`Invalid NCName: "${value}"`);
                }
                return ValidationResult.success();

            case 'ID':
            case 'IDREF':
            case 'ENTITY':
                // Use XMLUtils for proper XML name validation
                if (!XMLUtils.isValidXMLName(trimmedValue)) {
                    return ValidationResult.error(`Invalid ${datatype}: "${value}"`);
                }
                return ValidationResult.success();

            case 'NMTOKEN':
                // Use XMLUtils for proper NMTOKEN validation
                if (!XMLUtils.isValidNMTOKEN(trimmedValue)) {
                    return ValidationResult.error(`Invalid NMTOKEN: "${value}"`);
                }
                return ValidationResult.success();

            default:
                // Unknown datatype - assume valid for now
                return ValidationResult.success();
        }
    }

    private validateBasicDatatype(datatype: string, value: string): ValidationResult {
        // For unknown datatype libraries, do basic validation
        if (value === null || value === undefined) {
            return ValidationResult.error(`Invalid ${datatype}: null value`);
        }
        return ValidationResult.success();
    }

    private countElementsConsumed(pattern: RelaxNGPattern, content: ValidationContext): number {
        // Simplified counting - in a full implementation, this would track exactly
        // how many elements each pattern consumed during validation
        switch (pattern.getType()) {
            case RelaxNGPatternType.ELEMENT:
                return 1;
            case RelaxNGPatternType.EMPTY:
            case RelaxNGPatternType.TEXT:
            case RelaxNGPatternType.VALUE:
            case RelaxNGPatternType.DATA:
                return 0;
            default:
                return 0; // Conservative estimate
        }
    }

    private getAttributeDatatype(attrPattern: RelaxNGPattern): string {
        return 'string';
    }

    resolveEntity(name: string): string | undefined {
        return undefined;
    }

    addEntityReferenceUsage(originalReference: string, expandedText: string): void {
    }

    getOriginalEntityReference(expandedText: string): string | undefined {
        return undefined;
    }

    clearEntityReferenceTracking(): void {
    }

    getGrammarType(): GrammarType {
        return GrammarType.RELAX_NG;
    }

    getTargetNamespace(): string | undefined {
        return this.targetNamespace;
    }

    getNamespaceDeclarations(): Map<string, string> {
        return new Map(this.namespaces);
    }

    toJSON(): any {
        return {
            type: 'relaxng-grammar',
            targetNamespace: this.targetNamespace,
            namespaces: Object.fromEntries(this.namespaces),
            defines: Object.fromEntries(this.defines),
            startPattern: this.startPattern?.toJSON()
        };
    }
}