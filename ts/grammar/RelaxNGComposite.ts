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

import { AttributeInfo, Grammar, GrammarType, ValidationContext, ValidationResult } from './Grammar';
import { RelaxNGGrammar } from '../relaxng/RelaxNGGrammar';

export class RelaxNGComposite implements Grammar {
    private static instance: RelaxNGComposite | undefined;
    private relaxNGGrammars: RelaxNGGrammar[] = [];
    private validating: boolean = false;
    
    private constructor() {
    }
    
    static getInstance(): RelaxNGComposite {
        if (!RelaxNGComposite.instance) {
            RelaxNGComposite.instance = new RelaxNGComposite();
        }
        return RelaxNGComposite.instance;
    }
    
    static resetInstance(): void {
        RelaxNGComposite.instance = undefined;
    }
    
    setValidating(validating: boolean): void {
        this.validating = validating;
    }
    
    addGrammar(grammar: RelaxNGGrammar): void {
        this.relaxNGGrammars.push(grammar);
    }
    
    validateElement(element: string, content: ValidationContext): ValidationResult {
        // If no grammars are loaded, validation passes (for composite scenarios)
        if (this.relaxNGGrammars.length === 0) {
            return ValidationResult.success();
        }
        
        for (const grammar of this.relaxNGGrammars) {
            const result = grammar.validateElement(element, content);
            if (result.isValid) {
                return result;
            }
        }
        
        // If validating mode is disabled, be more lenient
        if (!this.validating) {
            return ValidationResult.success();
        }
        
        return ValidationResult.error('Element validation failed against all RelaxNG grammars');
    }
    
    validateAttributes(element: string, attributes: Map<string, string>, context: ValidationContext): ValidationResult {
        // If no grammars are loaded, validation passes (for composite scenarios)
        if (this.relaxNGGrammars.length === 0) {
            return ValidationResult.success();
        }
        
        for (const grammar of this.relaxNGGrammars) {
            const result = grammar.validateAttributes(element, attributes, context);
            if (result.isValid) {
                return result;
            }
        }
        
        // If validating mode is disabled, be more lenient
        if (!this.validating) {
            return ValidationResult.success();
        }
        
        return ValidationResult.error('Attribute validation failed against all RelaxNG grammars');
    }
    
    getDefaultAttributes(element: string): Map<string, string> {
        const defaultAttrs = new Map<string, string>();
        
        for (const grammar of this.relaxNGGrammars) {
            const grammarDefaults = grammar.getDefaultAttributes(element);
            grammarDefaults.forEach((value: string, attrName: string) => {
                defaultAttrs.set(attrName, value);
            });
        }
        
        return defaultAttrs;
    }
    
    getElementAttributes(element: string): Map<string, AttributeInfo> {
        const attributeInfos = new Map<string, AttributeInfo>();
        
        for (const grammar of this.relaxNGGrammars) {
            const grammarAttrs = grammar.getElementAttributes(element);
            grammarAttrs.forEach((info: AttributeInfo, attrName: string) => {
                attributeInfos.set(attrName, info);
            });
        }
        
        return attributeInfos;
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
        for (const grammar of this.relaxNGGrammars) {
            const ns = grammar.getTargetNamespace();
            if (ns) return ns;
        }
        return undefined;
    }
    
    getNamespaceDeclarations(): Map<string, string> {
        const namespaces = new Map<string, string>();
        
        for (const grammar of this.relaxNGGrammars) {
            const grammarNs = grammar.getNamespaceDeclarations();
            grammarNs.forEach((uri: string, prefix: string) => {
                namespaces.set(prefix, uri);
            });
        }
        
        return namespaces;
    }
    
    toJSON(): any {
        return {
            type: 'relaxng-composite',
            validating: this.validating,
            grammars: this.relaxNGGrammars.map(g => g.toJSON())
        };
    }
}