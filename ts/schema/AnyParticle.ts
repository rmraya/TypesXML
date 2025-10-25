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
        this.targetNamespace = targetNamespace;
    }

    getComponents(): ValidationParticle[] {
        return []; // AnyParticle has no sub-components
    }

    addComponent(component: ValidationParticle): void {
        throw new Error('AnyParticle does not support adding sub-components');
    }

    getMinOccurs(): number {
        return this.minOccurs;
    }

    getMaxOccurs(): number {
        return this.maxOccurs;
    }

    setCardinality(minOccurs: number, maxOccurs: number): void {
        this.minOccurs = minOccurs;
        this.maxOccurs = maxOccurs;
    }

    resolve(): ValidationParticle[] {
        this.resolved = true;
        return [this]; // Return self as resolved
    }

    isResolved(): boolean {
        return this.resolved;
    }

    getNamespace(): string {
        return this.namespace;
    }

    getProcessContents(): string {
        return this.processContents;
    }

    getTargetNamespace(): string | undefined {
        return this.targetNamespace;
    }

    setGrammarResolver(resolver: (namespace?: string) => Grammar | undefined): void {
        this.grammarResolver = resolver;
    }

    setValidating(validating: boolean): void {
        this.validating = validating;
    }

    isValidating(): boolean {
        return this.validating;
    }

    matches(element: string, targetNamespace?: string): boolean {
        // Parse namespace from element name if it has a prefix
        const colonIndex = element.indexOf(':');
        const contextTargetNamespace = targetNamespace || this.targetNamespace || '';

        // Determine element namespace category
        let elementNamespace: string;
        if (colonIndex >= 0) {
            const prefix = element.substring(0, colonIndex);
            // Elements with xlf: prefix are from target namespace
            // Elements with other prefixes (mda:, mtc:, gls:) are from other namespaces
            if (prefix === 'xlf') {
                elementNamespace = contextTargetNamespace; // target namespace
            } else {
                elementNamespace = 'other'; // other namespace
            }
        } else {
            // Unprefixed elements are in no namespace (local)
            elementNamespace = '';
        }

        // Handle space-separated list of namespace constraints
        const namespaceTokens = this.namespace.split(/\s+/);

        // Check each token in the namespace constraint
        for (const token of namespaceTokens) {
            if (this.matchesToken(token, elementNamespace, contextTargetNamespace)) {
                return true;
            }
        }

        return false;
    }

    private matchesToken(token: string, elementNamespace: string, contextTargetNamespace: string): boolean {
        switch (token) {
            case '##any':
                return true; // Matches any element from any namespace

            case '##other':
                // Matches elements from namespaces OTHER than the target namespace and no-namespace
                // Both the target namespace and no-namespace are excluded
                return elementNamespace === 'other';

            case '##local':
                // Matches elements with no namespace (absent namespace)
                return elementNamespace === '';

            case '##targetNamespace':
                // Matches elements from the target namespace
                return elementNamespace === contextTargetNamespace;

            default:
                // Specific namespace URI
                return elementNamespace === token;
        }
    }

    validate(children: string[]): void {
        if (!this.isResolved()) {
            throw new Error('AnyParticle must be resolved before validation');
        }

        // Validate that all provided children match the namespace constraint
        const matchingElements = children.filter(child => this.matches(child, this.targetNamespace));

        // All children passed to this method should match the xs:any constraint
        if (matchingElements.length !== children.length) {
            const nonMatchingElements = children.filter(child => !this.matches(child, this.targetNamespace));
            throw new Error(`Elements [${nonMatchingElements.map(e => e.toString()).join(', ')}] do not match xs:any namespace constraint '${this.namespace}'`);
        }

        // Check cardinality constraints
        const matchCount = matchingElements.length;
        if (matchCount < this.minOccurs) {
            throw new Error(`xs:any expects at least ${this.minOccurs} elements, got ${matchCount}`);
        }

        if (this.maxOccurs !== -1 && matchCount > this.maxOccurs) {
            throw new Error(`xs:any expects at most ${this.maxOccurs} elements, got ${matchCount}`);
        }

        // Handle processContents validation
        if (this.processContents === 'strict') {
            // In strict mode, all elements must be valid according to their schemas
            return this.validateStrict(matchingElements);
        } else if (this.processContents === 'lax') {
            // In lax mode, validate if schemas are available, otherwise skip
            return this.validateLax(matchingElements);
        } else if (this.processContents === 'skip') {
            // In skip mode, no validation is performed beyond namespace matching
            // Already handled above - just namespace constraint checking
        }
    }

    setSubstitutionGroupResolver(resolver: (elementName: string, substitutionHead: string) => boolean): void {
        // AnyParticle doesn't need substitution group resolution since it accepts any element
        // This method is here to satisfy the ValidationParticle interface
    }

    private validateStrict(elements: string[]): void {
        // In strict mode, ALL elements must be valid according to their schemas
        // If any element cannot be validated, the validation fails
        if (!this.grammarResolver) {
            // Only enforce grammar resolver requirement in validating mode
            if (this.validating) {
                throw new Error('Grammar resolver not set - cannot perform strict validation');
            } else {
                // In non-validating mode, skip strict validation
                return;
            }
        }

        for (const element of elements) {
            const elementNamespace = this.getElementNamespace(element);
            const grammar = this.grammarResolver(elementNamespace);

            if (!grammar) {
                // Only enforce schema availability requirement in validating mode
                if (this.validating) {
                    throw new Error(`Strict validation failed: No schema available for element '${element}' in namespace '${elementNamespace || '(no namespace)'}'`);
                } else {
                    // In non-validating mode, skip validation for unavailable schemas
                    continue;
                }
            }

            // Create a minimal validation context for element validation
            // In a real scenario, this would need more context (attributes, content, etc.)
            const context: ValidationContext = {
                childrenNames: [],
                attributes: new Map(),
                textContent: '',
                attributeOnly: false
            };

            const result = grammar.validateElement(element, context);
            if (!result.isValid) {
                // Only enforce validation failures in validating mode
                if (this.validating) {
                    const errorMessages = result.errors.map(e => e.message).join('; ');
                    throw new Error(`Strict validation failed for element '${element}': ${errorMessages}`);
                }
                // In non-validating mode, ignore validation failures
            }
        }
    }

    private validateLax(elements: string[]): void {
        // In lax mode, validate elements IF schemas are available
        // Skip validation for elements without available schemas
        if (!this.grammarResolver) {
            // No grammar resolver available - skip all validation (lax behavior)
            return;
        }

        for (const element of elements) {
            const elementNamespace = this.getElementNamespace(element);
            const grammar = this.grammarResolver(elementNamespace);

            if (grammar) {
                // Schema is available - perform validation
                const context: ValidationContext = {
                    childrenNames: [],
                    attributes: new Map(),
                    textContent: '',
                    attributeOnly: false
                };

                const result = grammar.validateElement(element, context);
                if (!result.isValid && this.validating) {
                    // Only report validation failures in validating mode
                    const errorMessages = result.errors.map(e => e.message).join('; ');
                    throw new Error(`Lax validation failed for element '${element}': ${errorMessages}`);
                }
                // In non-validating mode, ignore validation failures
            }
            // If no schema is available, skip validation (lax behavior)
        }
    }

    private getElementNamespace(element: string): string | undefined {
        // Extract namespace from element name
        const colonIndex = element.indexOf(':');
        if (colonIndex >= 0) {
            const prefix = element.substring(0, colonIndex);
            // This is a simplified approach - in a real implementation,
            // we would need access to namespace prefix mappings
            if (prefix === 'xlf') {
                return this.targetNamespace;
            }
            // For other prefixes, we would need to resolve them properly
            // For now, return a placeholder
            return `namespace-for-${prefix}`;
        }
        // Unprefixed element - could be in default namespace or no namespace
        return undefined;
    }

    toBNF(): string {
        const name: string = 'any';
        const min: number = this.minOccurs;
        const max: number = this.maxOccurs;
        
        if (min === 1 && max === 1) {
            return name;
        } else if (min === 0 && max === 1) {
            return `${name}?`;
        } else if (min === 0 && max === -1) {
            return `${name}*`;
        } else if (min === 1 && max === -1) {
            return `${name}+`;
        } else {
            const maxStr: string = max === -1 ? 'unbounded' : max.toString();
            return `${name}{${min},${maxStr}}`;
        }
    }
}