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

import { AttributeInfo } from "../grammar/Grammar";
import { XMLUtils } from "../XMLUtils";
import { AllModel } from "./AllModel";
import { SchemaAttributeDecl } from "./Attribute";
import { ChoiceModel } from "./ChoiceModel";
import { ContentModel } from "./ContentModel";
import { ElementModel } from "./ElementModel";
import { SchemaType } from "./SchemaType";
import { SequenceModel } from "./SequenceModel";

export type ContentType = 'empty' | 'simple' | 'element-only' | 'mixed';

export class ComplexType extends SchemaType {
    private mixed: boolean = false;
    private abstract: boolean = false;
    private contentType: ContentType = 'element-only';
    private contentModel?: ContentModel;
    private attributes: Map<string, SchemaAttributeDecl> = new Map();
    private derivationMethod?: 'extension' | 'restriction';
    private allowsAnyAttributes: boolean = false;
    private baseTypeQName?: string; // For unresolved base type references

    constructor(name?: string, targetNamespace?: string) {
        super(name, targetNamespace);
        if (name) {
            this.validateName(name);
        }
    }

    isSimpleType(): boolean {
        return false;
    }

    isComplexType(): boolean {
        return true;
    }

    isMixed(): boolean {
        return this.mixed;
    }

    setMixed(mixed: boolean): void {
        this.mixed = mixed;
        if (mixed && this.contentType === 'element-only') {
            this.contentType = 'mixed';
        }
    }

    isAbstract(): boolean {
        return this.abstract;
    }

    setAbstract(abstract: boolean): void {
        this.abstract = abstract;
    }

    getContentType(): ContentType {
        return this.contentType;
    }

    setContentType(contentType: ContentType): void {
        this.contentType = contentType;
    }

    hasSimpleContent(): boolean {
        return this.contentType === 'simple';
    }

    hasComplexContent(): boolean {
        return this.contentType === 'element-only' || this.contentType === 'mixed';
    }

    isEmpty(): boolean {
        return this.contentType === 'empty';
    }

    getContentModel(): ContentModel | undefined {
        return this.contentModel;
    }

    setContentModel(contentModel: ContentModel): void {
        this.validateContentModel(contentModel);
        this.contentModel = contentModel;

        // Update content type based on content model
        if (!contentModel) {
            this.contentType = 'empty';
        } else if (this.mixed) {
            this.contentType = 'mixed';
        } else {
            this.contentType = 'element-only';
        }
    }

    getAttributes(): Map<string, SchemaAttributeDecl> {
        return this.attributes;
    }

    setAttributes(attributes: Map<string, SchemaAttributeDecl>): void {
        this.attributes = attributes;
    }

    addAttribute(name: string, attribute: SchemaAttributeDecl): void {
        this.validateAttributeAddition(name, attribute);
        this.attributes.set(name, attribute);
    }

    getAttribute(name: string): SchemaAttributeDecl | undefined {
        return this.attributes.get(name);
    }

    hasAttribute(name: string): boolean {
        return this.attributes.has(name);
    }

    getDerivationMethod(): 'extension' | 'restriction' | undefined {
        return this.derivationMethod;
    }

    setDerivationMethod(method: 'extension' | 'restriction'): void {
        this.derivationMethod = method;
    }

    isExtension(): boolean {
        return this.derivationMethod === 'extension';
    }

    isRestriction(): boolean {
        return this.derivationMethod === 'restriction';
    }

    // Convert to Grammar framework AttributeInfo format
    getAttributeInfos(): Map<string, AttributeInfo> {
        const result = new Map<string, AttributeInfo>();

        for (const [name, attrDecl] of this.attributes) {
            const info = attrDecl.toAttributeInfo();
            result.set(name, info);
        }

        return result;
    }

    // Get default attribute values
    getDefaultAttributes(): Map<string, string> {
        const result = new Map<string, string>();

        for (const [name, attrDecl] of this.attributes) {
            const defaultValue = attrDecl.getDefaultValue();
            if (defaultValue) {
                result.set(name, defaultValue);
            }
        }

        return result;
    }

    getAllowsAnyAttributes(): boolean {
        return this.allowsAnyAttributes;
    }

    setAllowsAnyAttributes(allows: boolean): void {
        this.allowsAnyAttributes = allows;
    }

    getBaseTypeQName(): string | undefined {
        return this.baseTypeQName;
    }

    setBaseTypeQName(baseTypeQName: string): void {
        this.validateBaseTypeReference(baseTypeQName);
        this.baseTypeQName = baseTypeQName;
    }

    // Override base class method to handle content model merging for extensions
    setBaseType(baseType: SchemaType): void {
        super.setBaseType(baseType);

        // If this is an extension, merge content models
        if (this.isExtension() && baseType.isComplexType()) {
            this.mergeContentModelForExtension(baseType as ComplexType);
        }
    }

    private mergeContentModelForExtension(baseType: ComplexType): void {
        const baseContentModel = baseType.getContentModel();
        const extensionContentModel = this.contentModel;

        if (baseContentModel && extensionContentModel) {
            // Both base and extension have content models - need to merge them properly
            const mergedModel = this.mergeContentModels(baseContentModel, extensionContentModel);
            this.contentModel = mergedModel;
        } else if (baseContentModel && !extensionContentModel) {
            // Only base has content model - use it directly
            this.contentModel = baseContentModel;
        }
        // If only extension has content model or neither has content model, keep current state
    }

    private mergeContentModels(baseModel: ContentModel, extensionModel: ContentModel): ContentModel {
        // For XML Schema extensions, we generally create a sequence that combines base + extension
        // This follows the XML Schema specification for complex type extensions

        const combinedSequence = new SequenceModel(1, 1);

        // Add base content model components
        this.addContentModelToSequence(combinedSequence, baseModel);

        // Add extension content model components
        this.addContentModelToSequence(combinedSequence, extensionModel);

        return combinedSequence;
    }

    private addContentModelToSequence(targetSequence: SequenceModel, sourceModel: ContentModel): void {
        if (sourceModel instanceof SequenceModel) {
            // Flatten sequence - add all its particles individually
            const sourceParticles = sourceModel.getParticles();
            for (const particle of sourceParticles) {
                targetSequence.addParticle(particle);
            }
        } else if (sourceModel instanceof ChoiceModel) {
            // Add choice as a single particle (don't flatten)
            targetSequence.addParticle(sourceModel);
        } else if (sourceModel instanceof ElementModel) {
            // Add element as a single particle
            targetSequence.addParticle(sourceModel);
        } else if (sourceModel instanceof AllModel) {
            // Add all as a single particle (don't flatten - all has special semantics)
            targetSequence.addParticle(sourceModel);
        } else {
            // Other content model types (GroupModel, AnyModel, etc.) - add as single particle
            targetSequence.addParticle(sourceModel);
        }
    }

    // Schema validation methods

    private validateName(name: string): void {
        if (!name) {
            throw new Error('ComplexType name cannot be empty');
        }

        // Skip validation for Clark notation (expanded QNames like {namespace}localName)
        if (name.startsWith('{')) {
            const closeBrace = name.indexOf('}');
            if (closeBrace !== -1) {
                // This is Clark notation - only validate the local name part
                const localName = name.substring(closeBrace + 1);
                if (!XMLUtils.isValidNCName(localName)) {
                    throw new Error(`ComplexType local name '${localName}' is not a valid NCName`);
                }
                return;
            }
        }

        // Handle qualified names (prefix:localName) vs NCNames
        const colonIndex = name.indexOf(':');
        if (colonIndex !== -1) {
            // Qualified name - validate both prefix and local name as NCNames
            const prefix = name.substring(0, colonIndex);
            const localName = name.substring(colonIndex + 1);

            if (!XMLUtils.isValidNCName(prefix)) {
                throw new Error(`ComplexType name prefix '${prefix}' is not a valid NCName`);
            }
            if (!XMLUtils.isValidNCName(localName)) {
                throw new Error(`ComplexType name local part '${localName}' is not a valid NCName`);
            }
        } else {
            // Simple NCName
            if (!XMLUtils.isValidNCName(name)) {
                throw new Error(`ComplexType name '${name}' is not a valid NCName`);
            }
        }
    }

    private validateContentModel(contentModel: ContentModel): void {
        // Schema spec: mixed content validation
        if (this.mixed && this.contentType === 'simple') {
            throw new Error('Simple content cannot be mixed');
        }

        // Schema spec: empty content cannot have content model
        if (this.contentType === 'empty' && contentModel) {
            throw new Error('Empty content type cannot have a content model');
        }
    }

    private validateAttributeAddition(name: string, attribute: SchemaAttributeDecl): void {
        // Check for duplicate attribute names
        if (this.attributes.has(name)) {
            throw new Error(`Duplicate attribute declaration: '${name}'`);
        }

        // Validate the attribute itself
        attribute.validate();
    }

    private validateBaseTypeReference(baseTypeQName: string): void {
        if (!baseTypeQName) {
            throw new Error('Base type reference cannot be empty');
        }

        // Handle qualified names vs local names
        const colonIndex = baseTypeQName.indexOf(':');
        if (colonIndex !== -1) {
            // Qualified name - validate both prefix and local name as NCNames
            const prefix = baseTypeQName.substring(0, colonIndex);
            const localName = baseTypeQName.substring(colonIndex + 1);

            if (!XMLUtils.isValidNCName(prefix)) {
                throw new Error(`Base type prefix '${prefix}' is not a valid NCName`);
            }
            if (!XMLUtils.isValidNCName(localName)) {
                throw new Error(`Base type local part '${localName}' is not a valid NCName`);
            }
        } else {
            // Simple name - check if it's built-in or validate as NCName
            if (!this.isBuiltInType(baseTypeQName) && !XMLUtils.isValidNCName(baseTypeQName)) {
                throw new Error(`Base type '${baseTypeQName}' is not a valid type reference`);
            }
        }
    }

    private isBuiltInType(typeName: string): boolean {
        const builtInTypes = [
            'string', 'boolean', 'decimal', 'float', 'double', 'duration', 'dateTime', 'time', 'date',
            'gYearMonth', 'gYear', 'gMonthDay', 'gDay', 'gMonth', 'hexBinary', 'base64Binary', 'anyURI',
            'QName', 'NOTATION', 'normalizedString', 'token', 'language', 'NMTOKEN', 'NMTOKENS', 'Name',
            'NCName', 'ID', 'IDREF', 'IDREFS', 'ENTITY', 'ENTITIES', 'integer', 'nonPositiveInteger',
            'negativeInteger', 'long', 'int', 'short', 'byte', 'nonNegativeInteger', 'unsignedLong',
            'unsignedInt', 'unsignedShort', 'unsignedByte', 'positiveInteger', 'anyType', 'anySimpleType'
        ];
        return builtInTypes.includes(typeName);
    }

    validate(): void {
        // Comprehensive validation of complex type definition
        if (this.getName()) {
            this.validateName(this.getName()!);
        }

        if (this.contentModel) {
            this.validateContentModel(this.contentModel);
        }

        // Schema spec: abstract types with simple content restrictions
        if (this.abstract && this.hasSimpleContent() && !this.baseType && !this.baseTypeQName) {
            throw new Error('Abstract types with simple content must have a base type');
        }

        // Validate inheritance consistency
        if (this.derivationMethod && !this.baseType && !this.baseTypeQName) {
            throw new Error(`Type derivation method '${this.derivationMethod}' specified but no base type defined`);
        }

        // Validate all attributes
        for (const [name, attribute] of this.attributes) {
            try {
                attribute.validate();
            } catch (error) {
                throw new Error(`Invalid attribute '${name}': ${(error as Error).message}`);
            }
        }

        // Schema spec: content type consistency validation
        if (this.contentType === 'simple' && this.contentModel) {
            throw new Error('Simple content type cannot have element content model');
        }

        if (this.contentType === 'empty' && (this.contentModel || this.mixed)) {
            throw new Error('Empty content type cannot have content model or be mixed');
        }
    }
}