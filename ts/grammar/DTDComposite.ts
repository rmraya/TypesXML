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

import { AttributeInfo, Grammar, GrammarType, ValidationContext, ValidationResult } from './Grammar';
import { DTDGrammar } from '../dtd/DTDGrammar';
import { EntityDecl } from '../dtd/EntityDecl';
import { ElementDecl } from '../dtd/ElementDecl';
import { AttDecl } from '../dtd/AttDecl';
import { NotationDecl } from '../dtd/NotationDecl';

/**
 * DTDComposite orchestrates multiple DTDGrammar instances to provide
 * a unified view of DTD validation rules. This follows the same pattern as
 * CompositeGrammar for XML Schema support.
 * 
 * It combines:
 * - Internal DTD subset (parameter entities available to external processing)
 * - External DTD files (with access to internal parameter entities)
 * - Proper precedence rules for conflicting declarations
 */
export class DTDComposite implements Grammar {
    private internalDTD: DTDGrammar | undefined;
    private externalDTDs: DTDGrammar[] = [];
    private sharedParameterEntities: Map<string, EntityDecl> = new Map();
    
    constructor() {
        // Initialize with predefined entities like DTDGrammar does
        this.addPredefinedEntities();
    }

    private addPredefinedEntities(): void {
        this.sharedParameterEntities.set('lt', new EntityDecl('lt', false, '<', '', '', ''));
        this.sharedParameterEntities.set('gt', new EntityDecl('gt', false, '>', '', '', ''));
        this.sharedParameterEntities.set('amp', new EntityDecl('amp', false, '&', '', '', ''));
        this.sharedParameterEntities.set('apos', new EntityDecl('apos', false, "'", '', '', ''));
        this.sharedParameterEntities.set('quot', new EntityDecl('quot', false, '"', '', '', ''));
    }

    /**
     * Add the internal DTD subset grammar
     */
    addInternalDTD(dtdGrammar: DTDGrammar): void {
        this.internalDTD = dtdGrammar;
        // Extract parameter entities from internal DTD for sharing with external DTDs
        this.extractParameterEntities(dtdGrammar);
    }

    /**
     * Add an external DTD grammar
     */
    addExternalDTD(dtdGrammar: DTDGrammar): void {
        this.externalDTDs.push(dtdGrammar);
    }

    /**
     * Get a grammar instance that includes shared parameter entities
     * This is used when parsing external DTD files
     */
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
        for (const [attrName, attrValue] of attributes) {
            if (!declaredAttributes.has(attrName)) {
                return ValidationResult.error(`Undeclared attribute '${attrName}' found in element '${element}'`);
            }
            
            // Validate attribute value well-formedness
            const wellFormednessResult = this.validateAttributeValueWellFormedness(attrName, attrValue);
            if (!wellFormednessResult.isValid) {
                return wellFormednessResult;
            }
            
            // TODO: Add specific datatype validation here if needed (NMTOKEN, ID, etc.)
            const attrInfo = declaredAttributes.get(attrName)!;
        }

        // Check for required attributes that are missing
        for (const [attrName, attrInfo] of declaredAttributes) {
            if (attrInfo.use === 'required' && !attributes.has(attrName)) {
                return ValidationResult.error(`Required attribute '${attrName}' is missing from element '${element}'`);
            }
        }

        return ValidationResult.success();
    }

    private validateAttributeValueWellFormedness(attrName: string, attrValue: string): ValidationResult {
        // Check for unescaped ampersands that are not part of valid entity references
        let i = 0;
        while (i < attrValue.length) {
            const char = attrValue.charAt(i);
            
            if (char === '&') {
                // Found ampersand - check if it's part of a valid entity or character reference
                const remaining = attrValue.substring(i);
                
                // Check for character references (&#digits; or &#xhex;)
                const charRefMatch = remaining.match(/^&#(\d+|x[0-9a-fA-F]+);/);
                if (charRefMatch) {
                    const refContent = charRefMatch[1];
                    
                    // Validate decimal character reference
                    if (refContent.match(/^\d+$/)) {
                        const codePoint = parseInt(refContent, 10);
                        if (codePoint === 0 || (codePoint >= 1 && codePoint <= 8) || 
                            (codePoint >= 11 && codePoint <= 12) || (codePoint >= 14 && codePoint <= 31) ||
                            codePoint === 0xFFFE || codePoint === 0xFFFF || codePoint > 0x10FFFF ||
                            (codePoint >= 0xD800 && codePoint <= 0xDFFF)) {
                            return ValidationResult.error(`Invalid character reference: &#${refContent}; (U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}) is not allowed in XML 1.0`);
                        }
                    }
                    // Validate hexadecimal character reference
                    else if (refContent.match(/^x[0-9a-fA-F]+$/)) {
                        const hexValue = refContent.substring(1); // Remove 'x' prefix
                        const codePoint = parseInt(hexValue, 16);
                        if (codePoint === 0 || (codePoint >= 1 && codePoint <= 8) || 
                            (codePoint >= 11 && codePoint <= 12) || (codePoint >= 14 && codePoint <= 31) ||
                            codePoint === 0xFFFE || codePoint === 0xFFFF || codePoint > 0x10FFFF ||
                            (codePoint >= 0xD800 && codePoint <= 0xDFFF)) {
                            return ValidationResult.error(`Invalid character reference: &#x${hexValue}; (U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}) is not allowed in XML 1.0`);
                        }
                    }
                    // Malformed character reference (no valid digits/hex after &#)
                    else {
                        return ValidationResult.error(`Malformed character reference: &#${refContent}; contains invalid characters`);
                    }
                    
                    i += charRefMatch[0].length;
                    continue;
                }
                
                // Check for entity references (&name;)
                const entityRefMatch = remaining.match(/^&([a-zA-Z_:][a-zA-Z0-9_:.-]*);/);
                if (entityRefMatch) {
                    // Valid entity reference format
                    i += entityRefMatch[0].length;
                    continue;
                }
                
                // Check for malformed character reference (starts with &# but malformed)
                const malformedCharRefMatch = remaining.match(/^&#([^;]*)/);
                if (malformedCharRefMatch) {
                    const content = malformedCharRefMatch[1];
                    if (content.includes(':') || content.match(/[^0-9a-fA-F]/)) {
                        return ValidationResult.error(`Malformed character reference: &#${content} (missing semicolon or invalid characters)`);
                    }
                }
                
                // Unescaped ampersand - this is not allowed in attribute values
                return ValidationResult.error(`Unescaped ampersand in attribute '${attrName}' value. Use &amp; instead of &`);
            }
            
            i++;
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