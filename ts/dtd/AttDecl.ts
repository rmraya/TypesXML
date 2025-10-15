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

import { Constants } from "../Constants";
import { XMLNode } from "../XMLNode";

export class AttDecl implements XMLNode {
    private name: string;
    private attType: string;
    private defaultDecl: string;
    private defaultValue: string;

    constructor(name: string, attType: string, defaultDecl: string, defaultValue: string) {
        this.name = name;
        this.attType = attType;
        this.defaultDecl = defaultDecl;
        this.defaultValue = defaultValue;
    }

    getName(): string {
        return this.name;
    }

    getType(): string {
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
            return this.isValidName(value); // Must be a valid XML name
        }
        if (this.attType === 'IDREF') {
            return this.isValidName(value); // Must be a valid XML name
        }
        if (this.attType === 'IDREFS') {
            return value.split(/\s+/).every(ref => this.isValidName(ref));
        }
        if (this.attType === 'NMTOKEN') {
            return this.isValidNmtoken(value);
        }
        if (this.attType === 'NMTOKENS') {
            return value.split(/\s+/).every(token => this.isValidNmtoken(token));
        }
        if (this.attType === 'ENTITY') {
            return this.isValidName(value); // Must reference a valid entity name
        }
        if (this.attType === 'ENTITIES') {
            return value.split(/\s+/).every(entity => this.isValidName(entity));
        }
        if (this.attType.startsWith('(')) {
            // Enumeration - check if value is in the list
            const enumValues = this.attType.slice(1, -1).split('|').map(v => v.trim());
            return enumValues.includes(value);
        }
        if (this.attType.startsWith('NOTATION')) {
            // NOTATION type with enumeration
            const match = this.attType.match(/NOTATION\s*\(([^)]+)\)/);
            if (match) {
                const notationValues = match[1].split('|').map(v => v.trim());
                return notationValues.includes(value);
            }
        }
        return true; // Default to valid for other types
    }

    private isValidName(name: string): boolean {
        // XML name must start with letter or underscore, followed by name characters
        const nameStart = /[A-Za-z_:]/;
        const nameChar = /[A-Za-z0-9._:-]/;
        
        if (name.length === 0 || !nameStart.test(name.charAt(0))) {
            return false;
        }
        
        for (let i = 1; i < name.length; i++) {
            if (!nameChar.test(name.charAt(i))) {
                return false;
            }
        }
        return true;
    }

    private isValidNmtoken(token: string): boolean {
        // NMTOKEN can contain name characters but doesn't need to start with letter
        const nameChar = /[A-Za-z0-9._:-]/;
        
        if (token.length === 0) {
            return false;
        }
        
        for (let i = 0; i < token.length; i++) {
            if (!nameChar.test(token.charAt(i))) {
                return false;
            }
        }
        return true;
    }
}