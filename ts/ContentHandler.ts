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

import { Catalog } from "./Catalog";
import { XMLAttribute } from "./XMLAttribute";

export interface ContentHandler {

    initialize(): void;
    setCatalog(catalog: Catalog): void;
    setValidating(validating: boolean): void;

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