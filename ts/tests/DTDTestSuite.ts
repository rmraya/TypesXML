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

import { existsSync, readdirSync, readFileSync } from "fs";
import { DOMBuilder } from "../DOMBuilder";
import { SAXParser } from "../SAXParser";
import { XMLCanonicalizer } from "../XMLCanonicalizer";

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

        // Stand alone files

        let xmlFiles: string[] = readdirSync("./tests/xmltest/valid/sa").filter((file) => file.endsWith(".xml"));

        let validSa: number = 0;
        let invalidSa: number = 0;

        for (const xmlFile of xmlFiles) {
            let parser: SAXParser = new SAXParser();
            let domBuilder: DOMBuilder = new DOMBuilder();
            parser.setContentHandler(domBuilder);
            parser.setValidating(true);
            try {
                parser.parseFile("./tests/xmltest/valid/sa/" + xmlFile);
                const canonicalForm = readFileSync('./tests/xmltest/valid/sa/out/' + xmlFile, "utf-8");
                const canonicalizer: XMLCanonicalizer = new XMLCanonicalizer();
                canonicalizer.setDocument(domBuilder.getDocument()!);
                const generatedCanonicalForm = canonicalizer.toString();
                if (canonicalForm !== generatedCanonicalForm) {
                    console.log(' Generated form:\n' + generatedCanonicalForm);
                    console.log(' Expected form:\n' + canonicalForm);
                    throw new Error('Canonical form does not match for file ' + xmlFile);
                }
                validSa++;
            } catch (error) {
                console.error('Error parsing file ./tests/xmltest/valid/sa/' + xmlFile + ':', error, '\n');
                invalidSa++;
            }
        }

        // Not stand alone files

        xmlFiles = readdirSync("./tests/xmltest/valid/not-sa").filter((file) => file.endsWith(".xml"));

        let validNotSa: number = 0;
        let invalidNotSa: number = 0;

        for (const xmlFile of xmlFiles) {
            let parser: SAXParser = new SAXParser();
            let domBuilder: DOMBuilder = new DOMBuilder();
            parser.setContentHandler(domBuilder);
            parser.setValidating(true);
            try {
                parser.parseFile("./tests/xmltest/valid/not-sa/" + xmlFile);
                const canonicalForm = readFileSync('./tests/xmltest/valid/not-sa/out/' + xmlFile, "utf-8");
                const canonicalizer: XMLCanonicalizer = new XMLCanonicalizer();
                canonicalizer.setDocument(domBuilder.getDocument()!);
                const generatedCanonicalForm = canonicalizer.toString();
                if (canonicalForm !== generatedCanonicalForm) {
                    console.log(' Generated form:\n' + generatedCanonicalForm);
                    console.log(' Expected form:\n' + canonicalForm);
                    throw new Error('Canonical form does not match for file ' + xmlFile);
                }
                validNotSa++;
            } catch (error) {
                console.error('Error parsing file ./tests/xmltest/valid/not-sa/' + xmlFile + ':', error, '\n');
                invalidNotSa++;
            }
        }

        // External entity files

        xmlFiles = readdirSync("./tests/xmltest/valid/ext-sa").filter((file) => file.endsWith(".xml"));

        let validExtSa: number = 0;
        let invalidExtSa: number = 0;

        for (const xmlFile of xmlFiles) {
            let parser: SAXParser = new SAXParser();
            let domBuilder: DOMBuilder = new DOMBuilder();
            parser.setContentHandler(domBuilder);
            parser.setValidating(true);
            try {
                parser.parseFile("./tests/xmltest/valid/ext-sa/" + xmlFile);
                const canonicalForm = readFileSync('./tests/xmltest/valid/ext-sa/out/' + xmlFile, "utf-8");
                const canonicalizer: XMLCanonicalizer = new XMLCanonicalizer();
                canonicalizer.setDocument(domBuilder.getDocument()!);
                const generatedCanonicalForm = canonicalizer.toString();
                if (canonicalForm !== generatedCanonicalForm) {
                    console.log(' Generated form:\n' + generatedCanonicalForm);
                    console.log(' Expected form:\n' + canonicalForm);
                    throw new Error('Canonical form does not match for file ' + xmlFile);
                }
                validExtSa++;
            } catch (error) {
                console.error('Error parsing file ./tests/xmltest/valid/ext-sa/' + xmlFile + ':', error, '\n');
                invalidExtSa++;
            }
        }

        // Invalid files

        if (!existsSync("./tests/xmltest/invalid")) {
            throw new Error("DTD Test Suite invalid folder not found in ./tests/xmltest/invalid");
        }
        xmlFiles = readdirSync("./tests/xmltest/invalid").filter((file) => file.endsWith(".xml"));

        let invalidCatched: number = 0;
        let invalidMissed: number = 0;

        for (const xmlFile of xmlFiles) {
            let parser: SAXParser = new SAXParser();
            let domBuilder: DOMBuilder = new DOMBuilder();
            parser.setContentHandler(domBuilder);
            parser.setValidating(true);
            try {
                parser.parseFile("./tests/xmltest/invalid/" + xmlFile);
                console.log(' -- Invalid file ./tests/xmltest/invalid/' + xmlFile + ' not rejected');
                invalidMissed++;
            } catch (error) {
                invalidCatched++;
            }
        }

        // Not well-formed files - standalone

        if (!existsSync("./tests/xmltest/not-wf/sa")) {
            throw new Error("DTD Test Suite not well-formed folder not found in ./tests/xmltest/not-wf/sa");
        }
        xmlFiles = readdirSync("./tests/xmltest/not-wf/sa").filter((file) => file.endsWith(".xml"));

        let notWFSaCatched: number = 0;
        let notWFSaMissed: number = 0;

        for (const xmlFile of xmlFiles) {
            let parser: SAXParser = new SAXParser();
            let domBuilder: DOMBuilder = new DOMBuilder();
            parser.setContentHandler(domBuilder);
            parser.setValidating(true);
            try {
                parser.parseFile("./tests/xmltest/not-wf/sa/" + xmlFile);
                console.log(' -- Not well-formed SA file ./tests/xmltest/not-wf/sa/' + xmlFile + ' not rejected');
                notWFSaMissed++;
            } catch (error) {
                notWFSaCatched++;
            }
        }

        console.log('\n\n');
        console.log('Valid SA files: ' + validSa + ', Invalid SA files: ' + invalidSa);
        console.log('Valid NOT-SA files: ' + validNotSa + ', Invalid NOT-SA files: ' + invalidNotSa);
        console.log('Valid EXT-SA files: ' + validExtSa + ', Invalid EXT-SA files: ' + invalidExtSa);
        console.log('Invalid files catched: ' + invalidCatched + ', Invalid files missed: ' + invalidMissed);   
        console.log('Not well-formed "sa" catched: ' + notWFSaCatched + ', Not well-formed "sa" missed: ' + notWFSaMissed);
        console.log('\n\n');
    }
}
new DTDTestSuite();