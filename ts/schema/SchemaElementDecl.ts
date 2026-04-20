/*******************************************************************************
 * Copyright (c) 2023-2026 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

import { SchemaAttributeDecl } from './SchemaAttributeDecl.js';
import { SchemaContentModel } from './SchemaContentModel.js';
import { SchemaFacets, SchemaTypeValidator } from './SchemaTypeValidator.js';

export interface IdentityConstraint {
    name: string;
    kind: 'key' | 'keyref' | 'unique';
    selector: string;
    fields: string[];
    refer?: string;
}

export class SchemaElementDecl {

    private name: string;
    private namespace: string | undefined;
    private contentModel: SchemaContentModel;
    private attributeDecls: Map<string, SchemaAttributeDecl>;
    private anyAttribute: boolean = false;
    private anyAttributeNamespace: string = '##any';
    private anyAttributeProcessContents: string = 'strict';
    private anyAttributeOwnerNs: string | undefined;
    private anyAttributeExcludedNamespaces: string[] | undefined;
    private simpleType: string | undefined;
    private textFacets: SchemaFacets | undefined;
    private declaredTypeName: string | undefined;
    private abstract: boolean = false;
    private blockConstraints: Set<string> = new Set<string>();
    private finalConstraints: Set<string> = new Set<string>();
    private nillable: boolean = false;
    private unionMemberTypes: string[] | undefined;
    private listItemType: string | undefined;
    private identityConstraints: IdentityConstraint[] | undefined;
    private fixedValue: string | undefined;
    private defaultValue: string | undefined;

    constructor(name: string, namespace?: string, contentModel?: SchemaContentModel) {
        this.name = name;
        this.namespace = namespace;
        this.contentModel = contentModel !== undefined ? contentModel : SchemaContentModel.any();
        this.attributeDecls = new Map<string, SchemaAttributeDecl>();
    }

    getName(): string {
        return this.name;
    }

    getNamespace(): string | undefined {
        return this.namespace;
    }

    getContentModel(): SchemaContentModel {
        return this.contentModel;
    }

    setContentModel(model: SchemaContentModel): void {
        this.contentModel = model;
    }

    addAttributeDecl(decl: SchemaAttributeDecl): void {
        this.attributeDecls.set(decl.getName(), decl);
    }

    getAttributeDecl(name: string): SchemaAttributeDecl | undefined {
        return this.attributeDecls.get(name);
    }

    getAttributeDecls(): Map<string, SchemaAttributeDecl> {
        return this.attributeDecls;
    }

    setSimpleType(type: string): void {
        this.simpleType = type;
    }

    getSimpleType(): string | undefined {
        return this.simpleType;
    }

    setTextFacets(facets: SchemaFacets): void {
        this.textFacets = facets;
    }

    validateText(value: string): boolean {
        if (!this.textFacets) {
            return true;
        }
        return SchemaTypeValidator.validateFacets(value, this.textFacets, this.simpleType);
    }

    hasTextFacets(): boolean {
        return this.textFacets !== undefined;
    }

    setAnyAttribute(namespace: string = '##any', processContents: string = 'strict', ownerNs?: string, excludedNamespaces?: string[]): void {
        this.anyAttribute = true;
        this.anyAttributeNamespace = namespace;
        this.anyAttributeProcessContents = processContents;
        this.anyAttributeOwnerNs = ownerNs;
        this.anyAttributeExcludedNamespaces = excludedNamespaces;
    }

    allowsAnyAttribute(): boolean {
        return this.anyAttribute;
    }

    getAnyAttributeNamespace(): string {
        return this.anyAttributeNamespace;
    }

    getAnyAttributeProcessContents(): string {
        return this.anyAttributeProcessContents;
    }

    getAnyAttributeOwnerNs(): string | undefined {
        return this.anyAttributeOwnerNs;
    }

    getAnyAttributeExcludedNamespaces(): string[] | undefined {
        return this.anyAttributeExcludedNamespaces;
    }

    setDeclaredTypeName(typeName: string): void {
        this.declaredTypeName = typeName;
    }

    getDeclaredTypeName(): string | undefined {
        return this.declaredTypeName;
    }

    setAbstract(value: boolean): void {
        this.abstract = value;
    }

    isAbstractElement(): boolean {
        return this.abstract;
    }

    setBlockConstraints(constraints: Set<string>): void {
        this.blockConstraints = constraints;
    }

    getBlockConstraints(): Set<string> {
        return this.blockConstraints;
    }

    setFinalConstraints(constraints: Set<string>): void {
        this.finalConstraints = constraints;
    }

    getFinalConstraints(): Set<string> {
        return this.finalConstraints;
    }

    setNillable(value: boolean): void {
        this.nillable = value;
    }

    isNillable(): boolean {
        return this.nillable;
    }

    setUnionMemberTypes(types: string[]): void {
        this.unionMemberTypes = types;
    }

    getUnionMemberTypes(): string[] | undefined {
        return this.unionMemberTypes;
    }

    setListItemType(type: string): void {
        this.listItemType = type;
    }

    getListItemType(): string | undefined {
        return this.listItemType;
    }

    addIdentityConstraint(constraint: IdentityConstraint): void {
        if (!this.identityConstraints) {
            this.identityConstraints = [];
        }
        this.identityConstraints.push(constraint);
    }

    getIdentityConstraints(): IdentityConstraint[] | undefined {
        return this.identityConstraints;
    }

    setFixedValue(value: string): void {
        this.fixedValue = value;
    }

    getFixedValue(): string | undefined {
        return this.fixedValue;
    }

    setDefaultValue(value: string): void {
        this.defaultValue = value;
    }

    getDefaultValue(): string | undefined {
        return this.defaultValue;
    }
}

