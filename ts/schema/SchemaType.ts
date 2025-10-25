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