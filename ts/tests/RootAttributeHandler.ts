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

import { Catalog } from '../Catalog.js';
import { ContentHandler } from '../ContentHandler.js';
import { Grammar } from '../grammar/Grammar.js';
import { XMLAttribute } from '../XMLAttribute.js';

export class RootAttributeHandler implements ContentHandler {

    private grammar: Grammar | undefined;
    private rootSeen: boolean = false;

    hasSchemaRef(): boolean {
        return this.grammar !== undefined;
    }

    initialize(): void {}
    setCatalog(_catalog: Catalog): void {}
    startDocument(): void {}
    endDocument(): void {}
    xmlDeclaration(_version: string, _encoding: string, _standalone: string | undefined): void {}

    startElement(_name: string, _atts: Array<XMLAttribute>): void {
        if (!this.rootSeen) {
            this.rootSeen = true;
            return;
        }
        throw new Error('RootAttributeHandler: root seen');
    }

    endElement(_name: string): void {}
    internalSubset(_declaration: string): void {}
    characters(_ch: string): void {}
    ignorableWhitespace(_ch: string): void {}
    comment(_ch: string): void {}
    processingInstruction(_target: string, _data: string): void {}
    startCDATA(): void {}
    endCDATA(): void {}
    startDTD(_name: string, _publicId: string, _systemId: string): void {}
    endDTD(): void {}
    skippedEntity(_name: string): void {}
    getCurrentText(): string { return ''; }

    getGrammar(): Grammar | undefined {
        return this.grammar;
    }

    setGrammar(grammar: Grammar | undefined): void {
        this.grammar = grammar;
    }
}
