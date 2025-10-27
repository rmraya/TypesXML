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

import { RelaxNGPattern, RelaxNGPatternType } from './RelaxNGPattern';
import { PatternSimplifier } from './PatternSimplifier';
import { NameClass, NameClassFactory } from './NameClass';

export class PatternValidator {
    private simplifier: typeof PatternSimplifier;

    constructor() {
        this.simplifier = PatternSimplifier;
    }

    validateStartElement(pattern: RelaxNGPattern, localName: string, namespaceURI: string | null, attributes: Map<string, string>): ValidationResult {
        const simplified = this.simplifier.simplify(pattern);
        const derivative = this.deriveElement(simplified, localName, namespaceURI, attributes);
        
        return {
            isValid: derivative.getType() !== RelaxNGPatternType.NOT_ALLOWED,
            pattern: derivative,
            errors: derivative.getType() === RelaxNGPatternType.NOT_ALLOWED ? 
                [`Element ${this.formatQName(localName, namespaceURI)} not allowed here`] : []
        };
    }

    validateEndElement(pattern: RelaxNGPattern): ValidationResult {
        const simplified = this.simplifier.simplify(pattern);
        const isNullable = this.isNullable(simplified);
        
        return {
            isValid: isNullable,
            pattern: simplified,
            errors: isNullable ? [] : ['Element content is incomplete']
        };
    }

    validateText(pattern: RelaxNGPattern, text: string): ValidationResult {
        const simplified = this.simplifier.simplify(pattern);
        const derivative = this.deriveText(simplified, text);
        
        return {
            isValid: derivative.getType() !== RelaxNGPatternType.NOT_ALLOWED,
            pattern: derivative,
            errors: derivative.getType() === RelaxNGPatternType.NOT_ALLOWED ? 
                [`Text content "${text}" not allowed here`] : []
        };
    }

    private deriveElement(pattern: RelaxNGPattern, localName: string, namespaceURI: string | null, attributes: Map<string, string>): RelaxNGPattern {
        switch (pattern.getType()) {
            case RelaxNGPatternType.ELEMENT:
                return this.deriveElementPattern(pattern, localName, namespaceURI, attributes);
            
            case RelaxNGPatternType.CHOICE:
                return this.deriveChoice(pattern, (p) => this.deriveElement(p, localName, namespaceURI, attributes));
            
            case RelaxNGPatternType.GROUP:
                return this.deriveGroup(pattern, (p) => this.deriveElement(p, localName, namespaceURI, attributes));
            
            case RelaxNGPatternType.INTERLEAVE:
                return this.deriveInterleave(pattern, (p) => this.deriveElement(p, localName, namespaceURI, attributes));
            
            case RelaxNGPatternType.ONE_OR_MORE:
                return this.deriveOneOrMore(pattern, (p) => this.deriveElement(p, localName, namespaceURI, attributes));
            
            case RelaxNGPatternType.ATTRIBUTE:
            case RelaxNGPatternType.TEXT:
            case RelaxNGPatternType.VALUE:
            case RelaxNGPatternType.DATA:
            case RelaxNGPatternType.LIST:
            case RelaxNGPatternType.EMPTY:
                return new RelaxNGPattern(RelaxNGPatternType.NOT_ALLOWED);
            
            case RelaxNGPatternType.NOT_ALLOWED:
                return pattern;
            
            default:
                return new RelaxNGPattern(RelaxNGPatternType.NOT_ALLOWED);
        }
    }

    private deriveText(pattern: RelaxNGPattern, text: string): RelaxNGPattern {
        switch (pattern.getType()) {
            case RelaxNGPatternType.TEXT:
                return pattern; // text pattern always accepts more text
            
            case RelaxNGPatternType.VALUE:
                if (pattern.getValue() === text.trim()) {
                    return new RelaxNGPattern(RelaxNGPatternType.EMPTY);
                }
                return new RelaxNGPattern(RelaxNGPatternType.NOT_ALLOWED);
            
            case RelaxNGPatternType.DATA:
                return this.validateDataType(pattern, text) ? 
                    new RelaxNGPattern(RelaxNGPatternType.EMPTY) :
                    new RelaxNGPattern(RelaxNGPatternType.NOT_ALLOWED);
            
            case RelaxNGPatternType.LIST:
                return this.deriveList(pattern, text);
            
            case RelaxNGPatternType.CHOICE:
                return this.deriveChoice(pattern, (p) => this.deriveText(p, text));
            
            case RelaxNGPatternType.GROUP:
                return this.deriveGroup(pattern, (p) => this.deriveText(p, text));
            
            case RelaxNGPatternType.INTERLEAVE:
                return this.deriveInterleave(pattern, (p) => this.deriveText(p, text));
            
            case RelaxNGPatternType.ONE_OR_MORE:
                return this.deriveOneOrMore(pattern, (p) => this.deriveText(p, text));
            
            case RelaxNGPatternType.ELEMENT:
            case RelaxNGPatternType.ATTRIBUTE:
            case RelaxNGPatternType.EMPTY:
                // Only allow whitespace for these patterns
                if (text.trim() === '') {
                    return pattern;
                }
                return new RelaxNGPattern(RelaxNGPatternType.NOT_ALLOWED);
            
            case RelaxNGPatternType.NOT_ALLOWED:
                return pattern;
            
            default:
                return new RelaxNGPattern(RelaxNGPatternType.NOT_ALLOWED);
        }
    }

    private deriveElementPattern(pattern: RelaxNGPattern, localName: string, namespaceURI: string | null, attributes: Map<string, string>): RelaxNGPattern {
        // Check if the element name matches
        const nameClass = this.createNameClass(pattern);
        if (!nameClass.matches(localName, namespaceURI)) {
            return new RelaxNGPattern(RelaxNGPatternType.NOT_ALLOWED);
        }

        // Validate attributes and get content pattern
        const children = pattern.getChildren();
        let contentPattern: RelaxNGPattern | null = null;
        const attributePatterns: RelaxNGPattern[] = [];

        for (const child of children) {
            if (child.getType() === RelaxNGPatternType.ATTRIBUTE) {
                attributePatterns.push(child);
            } else {
                if (contentPattern === null) {
                    contentPattern = child;
                } else {
                    // Multiple content patterns - combine in group
                    const group = new RelaxNGPattern(RelaxNGPatternType.GROUP);
                    group.addChild(contentPattern);
                    group.addChild(child);
                    contentPattern = group;
                }
            }
        }

        // Validate attributes
        const attributeResult = this.validateAttributes(attributePatterns, attributes);
        if (!attributeResult.isValid) {
            return new RelaxNGPattern(RelaxNGPatternType.NOT_ALLOWED);
        }

        // Return content pattern or empty if no content
        return contentPattern || new RelaxNGPattern(RelaxNGPatternType.EMPTY);
    }

    private deriveChoice(pattern: RelaxNGPattern, deriveFn: (p: RelaxNGPattern) => RelaxNGPattern): RelaxNGPattern {
        const children = pattern.getChildren();
        const derivatives: RelaxNGPattern[] = [];

        for (const child of children) {
            const derivative = deriveFn(child);
            if (derivative.getType() !== RelaxNGPatternType.NOT_ALLOWED) {
                derivatives.push(derivative);
            }
        }

        if (derivatives.length === 0) {
            return new RelaxNGPattern(RelaxNGPatternType.NOT_ALLOWED);
        } else if (derivatives.length === 1) {
            return derivatives[0];
        } else {
            const choice = new RelaxNGPattern(RelaxNGPatternType.CHOICE);
            for (const derivative of derivatives) {
                choice.addChild(derivative);
            }
            return this.simplifier.simplify(choice);
        }
    }

    private deriveGroup(pattern: RelaxNGPattern, deriveFn: (p: RelaxNGPattern) => RelaxNGPattern): RelaxNGPattern {
        const children = pattern.getChildren();
        if (children.length === 0) {
            return new RelaxNGPattern(RelaxNGPatternType.EMPTY);
        }

        const first = children[0];
        const firstDerivative = deriveFn(first);

        if (firstDerivative.getType() === RelaxNGPatternType.NOT_ALLOWED) {
            return new RelaxNGPattern(RelaxNGPatternType.NOT_ALLOWED);
        }

        // Create the result based on whether first pattern is nullable
        const result = new RelaxNGPattern(RelaxNGPatternType.GROUP);
        result.addChild(firstDerivative);
        
        for (let i = 1; i < children.length; i++) {
            result.addChild(children[i]);
        }

        let finalResult = result;

        // If first pattern is nullable, also try deriving the rest
        if (this.isNullable(first)) {
            const rest = new RelaxNGPattern(RelaxNGPatternType.GROUP);
            for (let i = 1; i < children.length; i++) {
                rest.addChild(children[i]);
            }
            const restDerivative = this.deriveGroup(rest, deriveFn);
            
            if (restDerivative.getType() !== RelaxNGPatternType.NOT_ALLOWED) {
                const choice = new RelaxNGPattern(RelaxNGPatternType.CHOICE);
                choice.addChild(finalResult);
                choice.addChild(restDerivative);
                finalResult = choice;
            }
        }

        return this.simplifier.simplify(finalResult);
    }

    private deriveInterleave(pattern: RelaxNGPattern, deriveFn: (p: RelaxNGPattern) => RelaxNGPattern): RelaxNGPattern {
        const children = pattern.getChildren();
        const derivatives: RelaxNGPattern[] = [];

        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            const derivative = deriveFn(child);
            
            if (derivative.getType() !== RelaxNGPatternType.NOT_ALLOWED) {
                // Create interleave with derivative at position i and others unchanged
                const interleave = new RelaxNGPattern(RelaxNGPatternType.INTERLEAVE);
                
                for (let j = 0; j < children.length; j++) {
                    if (j === i) {
                        interleave.addChild(derivative);
                    } else {
                        interleave.addChild(children[j]);
                    }
                }
                
                derivatives.push(interleave);
            }
        }

        if (derivatives.length === 0) {
            return new RelaxNGPattern(RelaxNGPatternType.NOT_ALLOWED);
        } else if (derivatives.length === 1) {
            return this.simplifier.simplify(derivatives[0]);
        } else {
            const choice = new RelaxNGPattern(RelaxNGPatternType.CHOICE);
            for (const derivative of derivatives) {
                choice.addChild(derivative);
            }
            return this.simplifier.simplify(choice);
        }
    }

    private deriveOneOrMore(pattern: RelaxNGPattern, deriveFn: (p: RelaxNGPattern) => RelaxNGPattern): RelaxNGPattern {
        const children = pattern.getChildren();
        if (children.length !== 1) {
            return new RelaxNGPattern(RelaxNGPatternType.NOT_ALLOWED);
        }

        const child = children[0];
        const derivative = deriveFn(child);
        
        if (derivative.getType() === RelaxNGPatternType.NOT_ALLOWED) {
            return new RelaxNGPattern(RelaxNGPatternType.NOT_ALLOWED);
        }

        // oneOrMore(p) derivative is group(derivative(p), zeroOrMore(p))
        const group = new RelaxNGPattern(RelaxNGPatternType.GROUP);
        group.addChild(derivative);
        
        const zeroOrMore = new RelaxNGPattern(RelaxNGPatternType.ZERO_OR_MORE);
        zeroOrMore.addChild(child.clone());
        group.addChild(zeroOrMore);

        return this.simplifier.simplify(group);
    }

    private deriveList(pattern: RelaxNGPattern, text: string): RelaxNGPattern {
        const children = pattern.getChildren();
        if (children.length !== 1) {
            return new RelaxNGPattern(RelaxNGPatternType.NOT_ALLOWED);
        }

        // Split text into tokens and validate each against the list pattern
        const tokens = text.trim().split(/\s+/).filter(token => token.length > 0);
        let currentPattern = children[0];

        for (const token of tokens) {
            const derivative = this.deriveText(currentPattern, token);
            if (derivative.getType() === RelaxNGPatternType.NOT_ALLOWED) {
                return new RelaxNGPattern(RelaxNGPatternType.NOT_ALLOWED);
            }
            currentPattern = derivative;
        }

        // Check if final pattern is nullable
        if (this.isNullable(currentPattern)) {
            return new RelaxNGPattern(RelaxNGPatternType.EMPTY);
        } else {
            return currentPattern;
        }
    }

    private isNullable(pattern: RelaxNGPattern): boolean {
        switch (pattern.getType()) {
            case RelaxNGPatternType.EMPTY:
                return true;
            
            case RelaxNGPatternType.NOT_ALLOWED:
            case RelaxNGPatternType.TEXT:
            case RelaxNGPatternType.VALUE:
            case RelaxNGPatternType.DATA:
            case RelaxNGPatternType.LIST:
            case RelaxNGPatternType.ELEMENT:
            case RelaxNGPatternType.ATTRIBUTE:
                return false;
            
            case RelaxNGPatternType.CHOICE:
                return pattern.getChildren().some(child => this.isNullable(child));
            
            case RelaxNGPatternType.GROUP:
            case RelaxNGPatternType.INTERLEAVE:
                return pattern.getChildren().every(child => this.isNullable(child));
            
            case RelaxNGPatternType.ONE_OR_MORE:
                const children = pattern.getChildren();
                return children.length === 1 && this.isNullable(children[0]);
            
            case RelaxNGPatternType.ZERO_OR_MORE:
            case RelaxNGPatternType.OPTIONAL:
                return true;
            
            default:
                return false;
        }
    }

    private createNameClass(pattern: RelaxNGPattern): NameClass {
        const name = pattern.getName();
        const namespace = pattern.getNamespace();
        
        if (name) {
            return NameClassFactory.qualifiedName(name, namespace || '');
        }
        
        // Look for name class in children
        for (const child of pattern.getChildren()) {
            if (child.getType() === RelaxNGPatternType.NAME ||
                child.getType() === RelaxNGPatternType.ANY_NAME ||
                child.getType() === RelaxNGPatternType.NS_NAME) {
                return NameClassFactory.fromPattern(child);
            }
        }
        
        return NameClassFactory.anyName();
    }

    private validateAttributes(attributePatterns: RelaxNGPattern[], attributes: Map<string, string>): ValidationResult {
        // This is a simplified implementation
        // Full implementation would use derivative-based validation for attributes too
        
        const errors: string[] = [];
        let isValid = true;

        // For now, just check that all required attributes are present
        for (const attrPattern of attributePatterns) {
            const attrName = attrPattern.getName();
            if (attrName && !attributes.has(attrName)) {
                // Check if attribute is optional
                if (attrPattern.getParent()?.getType() !== RelaxNGPatternType.OPTIONAL) {
                    errors.push(`Required attribute '${attrName}' is missing`);
                    isValid = false;
                }
            }
        }

        return { isValid, pattern: new RelaxNGPattern(RelaxNGPatternType.EMPTY), errors };
    }

    private validateDataType(pattern: RelaxNGPattern, text: string): boolean {
        const datatype = pattern.getDataType();
        if (!datatype) {
            return true; // No datatype means any text is valid
        }

        // Simplified datatype validation
        switch (datatype) {
            case 'string':
                return true;
            case 'token':
                return text.trim() === text && !text.includes('\n') && !text.includes('\t');
            case 'int':
            case 'integer':
                return /^-?\d+$/.test(text.trim());
            case 'decimal':
                return /^-?\d+(\.\d+)?$/.test(text.trim());
            case 'boolean':
                return ['true', 'false', '1', '0'].includes(text.trim());
            default:
                return true; // Unknown datatypes are treated as valid
        }
    }

    private formatQName(localName: string, namespaceURI: string | null): string {
        if (namespaceURI) {
            return `{${namespaceURI}}${localName}`;
        }
        return localName;
    }
}

export interface ValidationResult {
    isValid: boolean;
    pattern: RelaxNGPattern;
    errors: string[];
}