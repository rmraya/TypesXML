/*******************************************************************************
 * Copyright (c) 2023 - 2024 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse   License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

import { Catalog } from "./Catalog";
import { XMLAttribute } from "./XMLAttribute";

export interface ContentHandler {

    initialize(): void;
    setCatalog(catalog: Catalog): void;

    startDocument(): void;
    endDocument(): void;

    xmlDeclaration(version: string, encoding: string, standalone: string | undefined): void;

    startElement(name: string, atts: Array<XMLAttribute>): void;
    endElement(name: string): void;
    internalSubset(declaration: string): void;

    characters(ch: string): void;
    ignorableWhitespace(ch: string): void;

    comment(ch: string): void;
    processingInstruction(target: string, data: string): void;

    startCDATA(): void;
    endCDATA(): void;

    startDTD(name: string, publicId: string, systemId: string): void;
    endDTD(): void;

    skippedEntity(name: string): void;
}