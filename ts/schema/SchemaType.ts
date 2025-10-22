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

import { } from "../grammar/Grammar";

export abstract class SchemaType {
    protected name?: string;
    protected targetNamespace: string = '';
    protected baseType?: SchemaType;

    constructor(name?: string, targetNamespace: string = '') {
        this.name = name;
        this.targetNamespace = targetNamespace;
    }

    getName(): string | undefined {
        return this.name;
    }

    setName(name: string): void {
        this.name = name;
    }

    getTargetNamespace(): string {
        return this.targetNamespace;
    }

    setTargetNamespace(namespace: string): void {
        this.targetNamespace = namespace;
    }

    getBaseType(): SchemaType | undefined {
        return this.baseType;
    }

    setBaseType(baseType: SchemaType): void {
        this.baseType = baseType;
    }

    abstract isSimpleType(): boolean;
    abstract isComplexType(): boolean;
    abstract validate(): void;
}