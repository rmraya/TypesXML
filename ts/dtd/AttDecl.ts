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

import { Constants } from "../Constants";
import { XMLNode } from "../XMLNode";
import { XMLUtils } from "../XMLUtils";

export class AttDecl implements XMLNode {
    private name: string;
    private attType: string;
    private defaultDecl: string;
    private defaultValue: string;
    private enumeration: string[] = [];
    private notationValues: string[] = [];

    constructor(name: string, attType: string, defaultDecl: string, defaultValue: string) {
        this.name = name;
        this.attType = attType;
        this.defaultDecl = defaultDecl;
        this.defaultValue = defaultValue;
        
        // Validate the attribute type immediately during construction
        this.getType();
    }

    getName(): string {
        return this.name;
    }

    getType(): string {
        let standardTypes: string[] = ['CDATA', 'ID', 'IDREF', 'IDREFS', 'NMTOKEN', 'NMTOKENS', 'ENTITY', 'ENTITIES'];
        if (!standardTypes.includes(this.attType)) {
            if (this.attType.startsWith('NOTATION')) {
                this.notationValues = this.parseNotationType(this.attType);
            } else if (this.attType.startsWith('(') && this.attType.endsWith(')')) {
                this.enumeration = this.parseEnumerationValues(this.attType);
            } else {
                throw new Error(`Invalid attribute type: ${this.attType}`);
            }
        }
        return this.attType;
    }

    getDefaultDecl(): string {
        return this.defaultDecl;
    }

    getDefaultValue(): string {
        return this.defaultValue;
    }

    getNodeType(): number {
        return Constants.ATTRIBUTE_DECL_NODE;
    }

    equals(node: XMLNode): boolean {
        if (node instanceof AttDecl) {
            return this.name === node.name && this.attType === node.attType && this.defaultDecl === node.defaultDecl && this.defaultValue === node.defaultValue;
        }
        return false;
    }

    toString(): string {
        let result = this.name + ' ' + this.attType + ' ' + this.defaultDecl;
        if (this.defaultValue) {
            // Quote the default value if it contains spaces or is not already quoted
            if (this.defaultValue.includes(' ') && !this.defaultValue.startsWith('"')) {
                result += ' "' + this.defaultValue + '"';
            } else {
                result += ' ' + this.defaultValue;
            }
        }
        return result.trim();
    }

    isValid(value: string): boolean {
        if (this.attType === 'CDATA') {
            return true; // CDATA can contain any character data
        }
        if (this.attType === 'ID') {
            return XMLUtils.isValidXMLName(value); // Must be a valid XML name
        }
        if (this.attType === 'IDREF') {
            return XMLUtils.isValidXMLName(value); // Must be a valid XML name
        }
        if (this.attType === 'IDREFS') {
            return value.split(/\s+/).every(ref => XMLUtils.isValidXMLName(ref));
        }
        if (this.attType === 'NMTOKEN') {
            return XMLUtils.isValidNMTOKEN(value);
        }
        if (this.attType === 'NMTOKENS') {
            return value.split(/\s+/).every(token => XMLUtils.isValidNMTOKEN(token));
        }
        if (this.attType === 'ENTITY') {
            return XMLUtils.isValidXMLName(value); // Must reference a valid entity name
        }
        if (this.attType === 'ENTITIES') {
            return value.split(/\s+/).every(entity => XMLUtils.isValidXMLName(entity));
        }
        if (this.attType.startsWith('(')) {
            // Enumeration - check if value is in the list populated during construction
            if (this.enumeration.length === 0) {
                this.enumeration = this.parseEnumerationValues(this.attType);
            }
            return this.enumeration.includes(value);
        }
        if (this.attType.startsWith('NOTATION')) {
            if (this.notationValues.length === 0) {
                this.notationValues = this.parseNotationType(this.attType);
            }
            return this.notationValues.includes(value);
        }
        return true; // Default to valid for other types
    }

    private parseNotationType(type: string): string[] {
        const openParen: number = type.indexOf('(');
        const closeParen: number = type.lastIndexOf(')');
        if (openParen === -1 || closeParen === -1 || closeParen <= openParen + 1) {
            throw new Error(`Invalid NOTATION attribute type: ${type}`);
        }

        const prefix: string = type.substring(0, openParen).trim();
        if (prefix !== 'NOTATION') {
            throw new Error(`Invalid NOTATION attribute type: ${type}`);
        }

        const suffix: string = type.substring(closeParen + 1).trim();
        if (suffix.length !== 0) {
            throw new Error(`Invalid NOTATION attribute type: ${type}`);
        }

        const rawList: string = type.substring(openParen + 1, closeParen);
        const names: string[] = rawList.split('|').map(v => v.trim()).filter(name => name.length > 0);
        if (names.length === 0) {
            throw new Error(`Empty NOTATION name list: ${type}`);
        }

        for (const name of names) {
            if (!XMLUtils.isValidXMLName(name)) {
                throw new Error(`Invalid NOTATION name "${name}" in attribute type: ${type}`);
            }
        }

        return names;
    }

    private parseEnumerationValues(type: string): string[] {
        const inner: string = type.substring(1, type.length - 1);
        const values: string[] = inner.split('|').map(v => v.trim()).filter(token => token.length > 0);
        if (values.length === 0) {
            throw new Error(`Empty enumeration attribute type: ${type}`);
        }

        for (const value of values) {
            if (!XMLUtils.isValidNMTOKEN(value)) {
                throw new Error(`Invalid enumeration value "${value}" for attribute type: ${type}`);
            }
        }

        return values;
    }
    getEnumeration(): string[] {
        return this.enumeration;
    }
}