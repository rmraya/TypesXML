import { ValidationParticle } from './ValidationParticle';
import { } from '../grammar/Grammar';

export class AnyParticle implements ValidationParticle {
    private minOccurs: number = 1;
    private maxOccurs: number = 1;
    private namespace: string; // Values: ##any, ##other, ##local, ##targetNamespace, or specific URIs
    private processContents: string = 'lax'; // strict, lax, or skip
    private resolved: boolean = false;
    private targetNamespace?: string;

    constructor(namespace: string = '##any', processContents: string = 'lax', targetNamespace?: string) {
        this.namespace = namespace;
        this.processContents = processContents;
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
            // This would require schema resolution and validation for each element
            // For now, we'll just ensure they match the namespace constraint (already done above)
            // TODO: Implement strict schema validation for matched elements
        } else if (this.processContents === 'lax') {
            // In lax mode, validate if schemas are available, otherwise skip
            // For now, we'll just ensure they match the namespace constraint (already done above)
            // TODO: Implement lax schema validation for matched elements
        } else if (this.processContents === 'skip') {
            // In skip mode, no validation is performed beyond namespace matching
            // Already handled above - just namespace constraint checking
        }
    }

    setSubstitutionGroupResolver(resolver: (elementName: string, substitutionHead: string) => boolean): void {
        // AnyParticle doesn't need substitution group resolution since it accepts any element
        // This method is here to satisfy the ValidationParticle interface
    }
}