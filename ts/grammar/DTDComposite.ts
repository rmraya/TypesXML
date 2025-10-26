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

import { AttDecl } from '../dtd/AttDecl';
import { DTDGrammar } from '../dtd/DTDGrammar';
import { ElementDecl } from '../dtd/ElementDecl';
import { EntityDecl } from '../dtd/EntityDecl';
import { AttributeInfo, Grammar, GrammarType, ValidationContext, ValidationResult } from './Grammar';


export class DTDComposite implements Grammar {
    
    private static instance: DTDComposite | undefined;
    private validating: boolean = false;
    private internalDTD: DTDGrammar | undefined;
    private externalDTDs: DTDGrammar[] = [];
    private sharedParameterEntities: Map<string, EntityDecl> = new Map();
    
    private constructor() {
        // Initialize with predefined entities like DTDGrammar does
        this.addPredefinedEntities();
    }

    static getInstance(): DTDComposite {
        if (!DTDComposite.instance) {
            DTDComposite.instance = new DTDComposite();
        }
        return DTDComposite.instance;
    }

    static resetInstance(): void {
        DTDComposite.instance = undefined;
    }

    reset(): void {
        this.validating = false;
        this.internalDTD = undefined;
        this.externalDTDs = [];
        this.sharedParameterEntities.clear();
        this.addPredefinedEntities();
    }

    private addPredefinedEntities(): void {
        this.sharedParameterEntities.set('lt', new EntityDecl('lt', false, '<', '', '', ''));
        this.sharedParameterEntities.set('gt', new EntityDecl('gt', false, '>', '', '', ''));
        this.sharedParameterEntities.set('amp', new EntityDecl('amp', false, '&', '', '', ''));
        this.sharedParameterEntities.set('apos', new EntityDecl('apos', false, "'", '', '', ''));
        this.sharedParameterEntities.set('quot', new EntityDecl('quot', false, '"', '', '', ''));
    }

    setValidating(validating: boolean): void {
        this.validating = validating;
    }

    addInternalDTD(dtdGrammar: DTDGrammar): void {
        this.internalDTD = dtdGrammar;
        // Extract parameter entities from internal DTD for sharing with external DTDs
        this.extractParameterEntities(dtdGrammar);
    }

    addExternalDTD(dtdGrammar: DTDGrammar): void {
        this.externalDTDs.push(dtdGrammar);
    }

    createSharedGrammar(): DTDGrammar {
        const sharedGrammar = new DTDGrammar();

        // Add all shared parameter entities to the new grammar
        this.sharedParameterEntities.forEach((entity, name) => {
            sharedGrammar.addEntity(entity);
        });

        return sharedGrammar;
    }

    private extractParameterEntities(dtdGrammar: DTDGrammar): void {
        // Extract parameter entities from the DTD grammar
        const entitiesMap = dtdGrammar.getEntitiesMap();
        entitiesMap.forEach((entity, name) => {
            if (entity.isParameterEntity()) {
                this.sharedParameterEntities.set(name, entity);
            }
        });
    }

    // Grammar interface implementation
    validateElement(element: string, content: ValidationContext): ValidationResult {
        // Check if element is declared in any DTD first
        const colonIndex = element.indexOf(':');
        const elementName = colonIndex !== -1 ? element.substring(colonIndex + 1) : element;

        // Internal DTD takes precedence
        if (this.internalDTD && this.internalDTD.getElementDeclMap().has(elementName)) {
            return this.internalDTD.validateElement(element, content);
        }

        // Try external DTDs in order
        for (const externalDTD of this.externalDTDs) {
            if (externalDTD.getElementDeclMap().has(elementName)) {
                return externalDTD.validateElement(element, content);
            }
        }

        return ValidationResult.error(`Element '${element}' is not declared in any DTD`);
    }

    validateAttributes(element: string, attributes: Map<string, string>, context: ValidationContext): ValidationResult {
        // Use merged attribute information for validation
        const declaredAttributes = this.getElementAttributes(element);

        if (declaredAttributes.size === 0) {
            // No attributes declared - any attributes present are invalid
            if (attributes.size > 0) {
                const attrName = attributes.keys().next().value;
                return ValidationResult.error(`Undeclared attribute '${attrName}' found in element '${element}'`);
            }
            return ValidationResult.success();
        }

        // Check each provided attribute against declarations
        const attributeDeclarations = this.getElementAttributeDeclarations(element);
        for (const [attrName, attrValue] of attributes) {
            if (!declaredAttributes.has(attrName)) {
                return ValidationResult.error(`Undeclared attribute '${attrName}' found in element '${element}'`);
            }

            // Well-formedness validation is handled by SAXParser before entity expansion
            // DTDComposite focuses on DTD-specific validation only

            // Perform DTD datatype validation using AttDecl
            const attDecl = attributeDeclarations.get(attrName);
            if (attDecl) {
                const validationResult = this.validateAttributeValue(attrName, attrValue, attDecl, element);
                if (!validationResult.isValid) {
                    return validationResult;
                }
            }
        }

        // Check for required attributes that are missing
        for (const [attrName, attrInfo] of declaredAttributes) {
            if (attrInfo.use === 'required' && !attributes.has(attrName)) {
                return ValidationResult.error(`Required attribute '${attrName}' is missing from element '${element}'`);
            }
        }

        return ValidationResult.success();
    }

    getElementAttributes(element: string): Map<string, AttributeInfo> {
        // Merge attributes from all DTDs, with internal taking precedence over external
        const combinedAttributes = new Map<string, AttributeInfo>();

        // Add from external DTDs first (lower precedence)
        for (const externalDTD of this.externalDTDs) {
            const attrs = externalDTD.getElementAttributes(element);
            attrs.forEach((attr, name) => {
                if (!combinedAttributes.has(name)) {
                    combinedAttributes.set(name, attr);
                }
            });
        }

        // Add from internal DTD (higher precedence)
        if (this.internalDTD) {
            const attrs = this.internalDTD.getElementAttributes(element);
            attrs.forEach((attr, name) => {
                combinedAttributes.set(name, attr); // Overrides external attributes
            });
        }

        return combinedAttributes;
    }

    private getElementAttributeDeclarations(element: string): Map<string, AttDecl> {
        const colonIndex = element.indexOf(':');
        const elementName = colonIndex !== -1 ? element.substring(colonIndex + 1) : element;
        const combinedDeclarations = new Map<string, AttDecl>();

        // Add from external DTDs first (lower precedence)
        for (const externalDTD of this.externalDTDs) {
            const attrs = externalDTD.getElementAttributesMap(elementName);
            if (attrs) {
                attrs.forEach((attDecl, name) => {
                    if (!combinedDeclarations.has(name)) {
                        combinedDeclarations.set(name, attDecl);
                    }
                });
            }
        }

        // Add from internal DTD (higher precedence)
        if (this.internalDTD) {
            const attrs = this.internalDTD.getElementAttributesMap(elementName);
            if (attrs) {
                attrs.forEach((attDecl, name) => {
                    combinedDeclarations.set(name, attDecl); // Overrides external declarations
                });
            }
        }

        return combinedDeclarations;
    }

    private validateAttributeValue(attrName: string, attrValue: string, attDecl: AttDecl, element: string): ValidationResult {
        const attrType = attDecl.getType();

        // Skip ID and IDREF validation - these require document-level tracking
        if (attrType === 'ID' || attrType === 'IDREF' || attrType === 'IDREFS') {
            // ID/IDREF validation is handled by DOMBuilder with document-level state tracking
            return ValidationResult.success();
        }

        // Use AttDecl's built-in validation for basic datatypes
        if (!attDecl.isValid(attrValue)) {
            return ValidationResult.error(`Invalid value '${attrValue}' for attribute '${attrName}' of type '${attrType}' in element '${element}'`);
        }

        // Additional validation for ENTITY/ENTITIES types - check if entities exist
        if (attrType === 'ENTITY') {
            if (!this.entityExists(attrValue)) {
                return ValidationResult.error(`Entity '${attrValue}' referenced in attribute '${attrName}' is not declared in element '${element}'`);
            }
        } else if (attrType === 'ENTITIES') {
            const entityNames = attrValue.split(/\s+/);
            for (const entityName of entityNames) {
                if (!this.entityExists(entityName)) {
                    return ValidationResult.error(`Entity '${entityName}' referenced in attribute '${attrName}' is not declared in element '${element}'`);
                }
            }
        }

        // Additional validation for NOTATION types - check if notations exist
        if (attrType.startsWith('NOTATION')) {
            if (!this.notationExists(attrValue)) {
                return ValidationResult.error(`Notation '${attrValue}' referenced in attribute '${attrName}' is not declared in element '${element}'`);
            }
        }
        if (attrType.startsWith('(') && attrType.endsWith(')')) {
            const enumeration = attDecl.getEnumeration();
            if (!enumeration.includes(attrValue)) {
                return ValidationResult.error(`Value '${attrValue}' for attribute '${attrName}' is not in the enumeration ${attDecl.getType()} in element '${element}'`);
            }
        }
        // check for entities inside attribute value
        const entityReferences = attrValue.match(/&([a-zA-Z0-9._:-]+);/g);
        if (entityReferences) {
            for (const entityRef of entityReferences) {
                const entityName = entityRef.slice(1, -1); // Remove the '&' and ';'
                if (!this.entityExists(entityName)) {
                    return ValidationResult.error(`Entity '${entityName}' referenced in attribute '${attrName}' is not declared in element '${element}'`);
                }
            }
        }
        return ValidationResult.success();
    }

    private entityExists(entityName: string): boolean {
        // Check internal DTD first
        if (this.internalDTD && this.internalDTD.resolveEntity(entityName) !== undefined) {
            return true;
        }

        // Check external DTDs
        for (const externalDTD of this.externalDTDs) {
            if (externalDTD.resolveEntity(entityName) !== undefined) {
                return true;
            }
        }

        return false;
    }

    private notationExists(notationName: string): boolean {
        // Check internal DTD first
        if (this.internalDTD) {
            const notationsMap = this.internalDTD.getNotationsMap();
            if (notationsMap.has(notationName)) {
                return true;
            }
        }

        // Check external DTDs
        for (const externalDTD of this.externalDTDs) {
            const notationsMap = externalDTD.getNotationsMap();
            if (notationsMap.has(notationName)) {
                return true;
            }
        }

        return false;
    }

    getDefaultAttributes(element: string): Map<string, string> {
        // Combine default attributes from all DTDs, with internal taking precedence
        const combinedDefaults = new Map<string, string>();

        // Add from external DTDs first (lower precedence)
        for (const externalDTD of this.externalDTDs) {
            const defaults = externalDTD.getDefaultAttributes(element);
            defaults.forEach((value, name) => {
                if (!combinedDefaults.has(name)) {
                    combinedDefaults.set(name, value);
                }
            });
        }

        // Add from internal DTD (higher precedence)
        if (this.internalDTD) {
            const defaults = this.internalDTD.getDefaultAttributes(element);
            defaults.forEach((value, name) => {
                combinedDefaults.set(name, value); // Overrides external defaults
            });
        }

        return combinedDefaults;
    }

    resolveEntity(name: string): string | undefined {
        // Internal DTD takes precedence
        if (this.internalDTD) {
            const entity = this.internalDTD.resolveEntity(name);
            if (entity !== undefined) {
                return entity;
            }
        }

        // Try external DTDs in order
        for (const externalDTD of this.externalDTDs) {
            const entity = externalDTD.resolveEntity(name);
            if (entity !== undefined) {
                return entity;
            }
        }

        return undefined;
    }

    addEntityReferenceUsage(originalReference: string, expandedText: string): void {
        // Delegate to internal DTD if available, otherwise first external DTD
        if (this.internalDTD) {
            this.internalDTD.addEntityReferenceUsage(originalReference, expandedText);
        } else if (this.externalDTDs.length > 0) {
            this.externalDTDs[0].addEntityReferenceUsage(originalReference, expandedText);
        }
    }

    getOriginalEntityReference(expandedText: string): string | undefined {
        // Check internal DTD first
        if (this.internalDTD) {
            const ref = this.internalDTD.getOriginalEntityReference(expandedText);
            if (ref !== undefined) {
                return ref;
            }
        }

        // Try external DTDs in order
        for (const externalDTD of this.externalDTDs) {
            const ref = externalDTD.getOriginalEntityReference(expandedText);
            if (ref !== undefined) {
                return ref;
            }
        }

        return undefined;
    }

    clearEntityReferenceTracking(): void {
        if (this.internalDTD) {
            this.internalDTD.clearEntityReferenceTracking();
        }
        for (const externalDTD of this.externalDTDs) {
            externalDTD.clearEntityReferenceTracking();
        }
    }

    getGrammarType(): GrammarType {
        return GrammarType.DTD;
    }

    getElementDeclMap(): Map<string, ElementDecl> {
        const combined = new Map<string, ElementDecl>();

        // Add from external DTDs first (lower precedence)
        for (const externalDTD of this.externalDTDs) {
            const externalElements = externalDTD.getElementDeclMap();
            externalElements.forEach((decl, name) => {
                if (!combined.has(name)) {
                    combined.set(name, decl);
                }
            });
        }

        // Add from internal DTD (higher precedence - overwrites external)
        if (this.internalDTD) {
            const internalElements = this.internalDTD.getElementDeclMap();
            internalElements.forEach((decl, name) => {
                combined.set(name, decl); // Overrides external declarations
            });
        }

        return combined;
    }

    getTargetNamespace(): string | undefined {
        // DTDs don't have namespaces
        return undefined;
    }

    getNamespaceDeclarations(): Map<string, string> {
        // DTDs don't have namespace declarations
        return new Map();
    }

    toJSON(): any {
        // Serialize the composite DTD grammar
        const result: any = {
            type: 'dtd-composite',
            internalDTD: this.internalDTD?.toJSON(),
            externalDTDs: this.externalDTDs.map(dtd => dtd.toJSON()),
            sharedParameterEntities: {}
        };

        // Include shared parameter entities
        this.sharedParameterEntities.forEach((entity, name) => {
            result.sharedParameterEntities[name] = {
                name: entity.getName(),
                value: entity.getValue(),
                isParameter: entity.isParameterEntity()
            };
        });

        return result;
    }
}