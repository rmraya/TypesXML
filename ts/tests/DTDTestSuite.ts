/*******************************************************************************
 * Copyright (c) 2023 - 2025 Maxprograms.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse   License 1.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/org/documents/epl-v10.html
 *
 * Contributors:
 *     Maxprograms - initial API and implementation
 *******************************************************************************/

import { existsSync, readdirSync } from "fs"
import { SAXParser } from "../SAXParser";
import { DOMBuilder } from "../DOMBuilder";


export class DTDTestSuite {

    constructor() {
        if (!existsSync("./tests/xmltest")) {
            throw new Error("DTD Test Suite not found in ./tests/xmltest");
        }
        if (!existsSync("./tests/xmltest/valid")) {
            throw new Error("DTD Test Suite valid folder not found in ./tests/xmltest/valid");
        }
        if (!existsSync("./tests/xmltest/valid/sa")) {
            throw new Error("DTD Test Suite valid/sa folder not found in ./tests/xmltest/valid/");
        }

        const xmlFiles: string[] = readdirSync("./tests/xmltest/valid/sa").filter((file) => file.endsWith(".xml"));

        let validSa: number = 0;
        let invalidSa: number = 0;

        for (const xmlFile of xmlFiles) {
            let parser: SAXParser = new SAXParser();
            let domBuilder: DOMBuilder = new DOMBuilder();
            parser.setContentHandler(domBuilder);
            parser.setValidating(true);
            try {
                parser.parseFile("./tests/xmltest/valid/sa/" + xmlFile);
                validSa++;
            } catch (error) {
                console.error('Error parsing file ' + xmlFile + ':', error);
                invalidSa++;
            }
        }
        console.log('Valid SA files: ' + validSa + ', Invalid SA files: ' + invalidSa);

        if (!existsSync("./tests/xmltest/invalid")) {
            throw new Error("DTD Test Suite invalid folder not found in ./tests/xmltest/invalid");
        }

    }
}
new DTDTestSuite();